import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ChatMessage, Conversation, ConversationType } from '../../shared/messages.ts'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** Stores chat bodies encrypted at rest. Database keys contain hashes, never Zalo IDs. */
export class EncryptedChatStore {
  private db: DatabaseSync
  private key: Buffer

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const keyFile = path.join(directory, 'chat.key')
    try { this.key = readFileSync(keyFile) }
    catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      try { writeFileSync(keyFile, randomBytes(32), { flag: 'wx', mode: 0o600 }) }
      catch (writeError) { if (!(writeError instanceof Error) || !('code' in writeError) || writeError.code !== 'EEXIST') throw writeError }
      this.key = readFileSync(keyFile)
    }
    if (this.key.length !== 32) throw new Error('Invalid chat storage key')
    this.db = new DatabaseSync(path.join(directory, 'chat.sqlite'))
    this.db.exec(`PRAGMA busy_timeout=3000; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS conversations(account TEXT NOT NULL, item TEXT NOT NULL, body BLOB NOT NULL, PRIMARY KEY(account,item));
      CREATE TABLE IF NOT EXISTS messages(account TEXT NOT NULL, thread TEXT NOT NULL, item TEXT NOT NULL, at INTEGER NOT NULL, body BLOB NOT NULL, PRIMARY KEY(account,thread,item));
      CREATE INDEX IF NOT EXISTS messages_by_thread ON messages(account,thread,at);`)
  }

  private encrypt(value: unknown) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), body])
  }

  private decrypt<T>(value: unknown): T | undefined {
    try {
      const content = Buffer.from(value as Uint8Array)
      if (content.length < 29) return undefined
      const decipher = createDecipheriv('aes-256-gcm', this.key, content.subarray(0, 12))
      decipher.setAuthTag(content.subarray(12, 28))
      return JSON.parse(Buffer.concat([decipher.update(content.subarray(28)), decipher.final()]).toString('utf8')) as T
    } catch { return undefined }
  }

  conversations(accountId: string): Conversation[] {
    return this.db.prepare('SELECT body FROM conversations WHERE account=?').all(hash(accountId)).flatMap((row) => {
      const value = this.decrypt<Conversation>(row.body)
      return value ? [value] : []
    })
  }

  messages(accountId: string, type: ConversationType, threadId: string): ChatMessage[] {
    return this.db.prepare('SELECT body FROM messages WHERE account=? AND thread=? ORDER BY at,item').all(hash(accountId), hash(`${type}:${threadId}`)).flatMap((row) => {
      const value = this.decrypt<ChatMessage>(row.body)
      return value ? [value] : []
    })
  }

  saveConversation(accountId: string, conversation: Conversation) {
    this.db.prepare('INSERT OR REPLACE INTO conversations(account,item,body) VALUES(?,?,?)').run(hash(accountId), hash(`${conversation.type}:${conversation.id}`), this.encrypt(conversation))
  }

  saveMessage(accountId: string, message: ChatMessage) {
    const account = hash(accountId), thread = hash(`${message.type}:${message.threadId}`)
    this.db.prepare('INSERT OR REPLACE INTO messages(account,thread,item,at,body) VALUES(?,?,?,?,?)').run(account, thread, hash(message.id), message.timestamp, this.encrypt(message))
    this.db.prepare('DELETE FROM messages WHERE account=? AND thread=? AND item NOT IN (SELECT item FROM messages WHERE account=? AND thread=? ORDER BY at DESC,rowid DESC LIMIT 1000)').run(account, thread, account, thread)
  }

  close() { this.db.close() }
}
