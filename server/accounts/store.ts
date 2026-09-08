import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Credentials } from 'zalo-api-final'
import type { Account } from '../../shared/accounts.ts'

export interface StoredAccount {
  account: Omit<Account, 'status'>
  credentials: Credentials
}

export interface AccountStore {
  load: () => Promise<StoredAccount[]>
  save: (accounts: StoredAccount[]) => Promise<void>
}

export class EncryptedAccountStore implements AccountStore {
  private directory: string
  private key: Buffer | undefined

  constructor(directory: string) { this.directory = directory }

  private async getKey(create = true): Promise<Buffer> {
    if (this.key) return this.key
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const keyPath = path.join(this.directory, 'session.key')
    try {
      this.key = await readFile(keyPath)
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      if (!create) throw new Error('Session storage key is missing', { cause: error })
      const key = randomBytes(32)
      try { await writeFile(keyPath, key, { flag: 'wx', mode: 0o600 }) }
      catch (writeError) {
        if (!(writeError instanceof Error) || !('code' in writeError) || writeError.code !== 'EEXIST') throw writeError
      }
      this.key = await readFile(keyPath)
    }
    if (this.key.length !== 32) throw new Error('Invalid session storage key')
    return this.key
  }

  async load(): Promise<StoredAccount[]> {
    let content: Buffer
    try { content = await readFile(path.join(this.directory, 'accounts.enc')) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
      throw error
    }
    const decipher = createDecipheriv('aes-256-gcm', await this.getKey(false), content.subarray(0, 12))
    decipher.setAuthTag(content.subarray(12, 28))
    const decrypted = Buffer.concat([decipher.update(content.subarray(28)), decipher.final()])
    const records: unknown = JSON.parse(decrypted.toString('utf8'))
    if (!Array.isArray(records)) throw new Error('Invalid account storage')
    return records as StoredAccount[]
  }

  async save(accounts: StoredAccount[]): Promise<void> {
    const key = await this.getKey()
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const body = Buffer.concat([cipher.update(JSON.stringify(accounts), 'utf8'), cipher.final()])
    const file = path.join(this.directory, 'accounts.enc')
    const temporaryFile = `${file}.tmp`
    await writeFile(temporaryFile, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 })
    await rename(temporaryFile, file)
  }
}
