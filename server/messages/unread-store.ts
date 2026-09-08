import { DatabaseSync } from 'node:sqlite'
import type { ConversationType } from '../../shared/messages.ts'

export interface UnreadState { count: number; through: number }

/** Stores message IDs and read state only; message bodies and media stay out of this database. */
export class UnreadStore {
  private db: DatabaseSync
  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename)
    this.db.exec(`
      PRAGMA busy_timeout = 3000;
      CREATE TABLE IF NOT EXISTS unread_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        account TEXT NOT NULL, type TEXT NOT NULL, thread TEXT NOT NULL,
        message TEXT NOT NULL, unread INTEGER NOT NULL,
        UNIQUE(account, type, thread, message)
      );
      CREATE INDEX IF NOT EXISTS unread_by_thread ON unread_events(account, type, thread, unread, seq);
    `)
  }
  observe(account: string, type: ConversationType, thread: string, message: string, unread: boolean) {
    this.db.prepare('INSERT OR IGNORE INTO unread_events(account,type,thread,message,unread) VALUES(?,?,?,?,?)').run(account, type, thread, message, Number(unread))
  }
  state(account: string, type: ConversationType, thread: string): UnreadState {
    const row = this.db.prepare('SELECT COUNT(*) AS count, COALESCE(MAX(seq),0) AS through FROM unread_events WHERE account=? AND type=? AND thread=? AND unread=1').get(account, type, thread)!
    return { count: Number(row.count), through: Number(row.through) }
  }
  list(account: string, type: ConversationType): Map<string, UnreadState> {
    const rows = this.db.prepare('SELECT thread, COUNT(*) AS count, MAX(seq) AS through FROM unread_events WHERE account=? AND type=? AND unread=1 GROUP BY thread').all(account, type)
    return new Map(rows.map((row) => [String(row.thread), { count: Number(row.count), through: Number(row.through) }]))
  }
  readableThrough(account: string, type: ConversationType, thread: string, messageIds: string[]): number {
    if (!messageIds.length) return 0
    const row = this.db.prepare(`SELECT COALESCE(MAX(seq),0) AS through FROM unread_events WHERE account=? AND type=? AND thread=? AND unread=1 AND message IN (${messageIds.map(() => '?').join(',')})`).get(account, type, thread, ...messageIds)!
    return Number(row.through)
  }
  markRead(account: string, type: ConversationType, thread: string, through: number): UnreadState {
    // A newly arriving message gets a higher sequence and survives an older read request.
    this.db.prepare('UPDATE unread_events SET unread=0 WHERE account=? AND type=? AND thread=? AND seq<=? AND unread=1').run(account, type, thread, through)
    return this.state(account, type, thread)
  }
  remove(account: string, type: ConversationType, thread: string, message: string) {
    this.db.prepare('UPDATE unread_events SET unread=0 WHERE account=? AND type=? AND thread=? AND message=?').run(account, type, thread, message)
  }
  close() { this.db.close() }
}
