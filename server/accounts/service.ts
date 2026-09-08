import { isLoginPending } from '../../shared/accounts.ts'
import type { Account, LoginSession } from '../../shared/accounts.ts'
import type { AccountConnection, AccountGateway } from './gateway.ts'
import type { AccountStore, StoredAccount } from './store.ts'
import { ChatError } from '../messages/types.ts'
import { loginErrorMessage, safeLoginError } from './login-errors.ts'

interface PendingLogin {
  public: LoginSession
  controller: AbortController
  timer?: ReturnType<typeof setTimeout>
  updatedAt: number
}

export class AccountService {
  private store: AccountStore
  private gateway: AccountGateway
  private records = new Map<string, StoredAccount>()
  private connections = new Map<string, AccountConnection>()
  private restoring = new Map<string, AbortController>()
  private sessions = new Map<string, PendingLogin>()
  private mutations: Promise<unknown> = Promise.resolve()
  private closed = false

  constructor(store: AccountStore, gateway: AccountGateway) { this.store = store; this.gateway = gateway }

  async initialize(restore = true) {
    for (const record of await this.store.load()) this.records.set(record.account.id, record)
    if (restore) for (const record of this.records.values()) void this.restore(record)
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutations.then(operation)
    this.mutations = result.catch(() => undefined)
    return result
  }

  listAccounts(): Account[] {
    return Array.from(this.records.values(), ({ account }) => ({
      ...account,
      status: this.connections.has(account.id) ? 'connected' as const : this.restoring.has(account.id) ? 'restoring' as const : 'expired' as const,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getMessaging(id: string) {
    const messaging = this.connections.get(id)?.messaging
    if (!messaging || this.closed) throw new ChatError('Tài khoản chưa kết nối. Hãy đăng nhập lại tại trang Tài khoản.', 409)
    return messaging
  }

  startLogin(id: string): LoginSession {
    if (this.closed) throw new Error('SERVICE_CLOSED')
    // Bound retained QR sessions and cancellation tombstones.
    for (const [key, session] of this.sessions) {
      if (!isLoginPending(session.public.status) && Date.now() - session.updatedAt > 10 * 60_000) this.sessions.delete(key)
    }
    const existing = this.sessions.get(id)
    if (existing) return this.snapshot(existing)
    if (Array.from(this.sessions.values()).filter((s) => isLoginPending(s.public.status)).length >= 5 || this.sessions.size >= 100) throw new Error('TOO_MANY_LOGINS')
    const session: PendingLogin = { public: { id, status: 'initializing' }, controller: new AbortController(), updatedAt: Date.now() }
    session.timer = setTimeout(() => {
      if (isLoginPending(session.public.status)) this.finish(session, 'expired')
    }, 150_000)
    session.timer.unref()
    this.sessions.set(id, session)
    void this.runLogin(session)
    return this.snapshot(session)
  }

  getLogin(id: string): LoginSession | undefined {
    const session = this.sessions.get(id)
    return session ? this.snapshot(session) : undefined
  }

  private snapshot(session: PendingLogin): LoginSession {
    return { ...session.public, account: session.public.account ? { ...session.public.account } : undefined }
  }

  private finish(session: PendingLogin, status: LoginSession['status'], error?: string) {
    session.public = { id: session.public.id, status, error }
    session.updatedAt = Date.now()
    clearTimeout(session.timer)
    session.controller.abort()
  }

  async cancelLogin(id: string): Promise<LoginSession> {
    return this.serialize(async () => {
      let session = this.sessions.get(id)
      if (!session) {
        // A cancellation may reach the server before its POST.
        if (this.sessions.size >= 100) throw new Error('TOO_MANY_LOGINS')
        session = { public: { id, status: 'cancelled' }, controller: new AbortController(), updatedAt: Date.now() }
        this.sessions.set(id, session)
      }
      if (isLoginPending(session.public.status)) this.finish(session, 'cancelled')
      return this.snapshot(session)
    })
  }

  private async runLogin(session: PendingLogin) {
    let connection: AccountConnection | undefined
    let saving = false
    try {
      connection = await this.gateway.loginQR((update) => {
        if (!isLoginPending(session.public.status)) return
        if (update.status === 'expired' || update.status === 'declined') this.finish(session, update.status)
        else session.public = { ...session.public, ...update }
      }, session.controller.signal)
      const established = connection
      await this.serialize(async () => {
        if (!isLoginPending(session.public.status) || this.closed) { established.disconnect(); return }
        const id = established.profile.id
        const previous = this.records.get(id)
        const timestamp = new Date().toISOString()
        const record: StoredAccount = {
          account: { ...established.profile, createdAt: previous?.account.createdAt ?? timestamp, lastLoginAt: timestamp },
          credentials: established.credentials,
        }
        const next = new Map(this.records).set(id, record)
        clearTimeout(session.timer)
        saving = true
        await this.store.save(Array.from(next.values()))
        saving = false
        this.records = next
        this.restoring.get(id)?.abort()
        this.restoring.delete(id)
        this.connections.get(id)?.disconnect()
        this.connections.set(id, established)
        clearTimeout(session.timer)
        session.public = { id: session.public.id, status: 'success', account: { ...record.account, status: 'connected' } }
        session.updatedAt = Date.now()
      })
    } catch (error) {
      connection?.disconnect()
      if (isLoginPending(session.public.status)) {
        const frame = error instanceof Error ? error.stack?.split('\n').slice(1).find((line) => /^\s+at .*\.(?:js|ts):\d+:\d+\)?$/.test(line)) : undefined
        console.error('[account-login]', saving ? 'saving' : session.public.status, safeLoginError(error), frame?.trim() ?? '')
        this.finish(session, 'error', loginErrorMessage(error, saving))
      }
    }
  }

  private async restore(record: StoredAccount) {
    const id = record.account.id
    const controller = new AbortController()
    this.restoring.set(id, controller)
    let connection: AccountConnection | undefined
    try {
      connection = await this.gateway.restore(record.credentials, AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]))
      if (controller.signal.aborted || this.closed || this.records.get(id) !== record) { connection.disconnect(); return }
      this.connections.set(id, connection)
    } catch { connection?.disconnect() }
    finally { if (this.restoring.get(id) === controller) this.restoring.delete(id) }
  }

  async removeAccount(id: string): Promise<void> {
    await this.serialize(async () => {
      if (!this.records.has(id)) return
      const next = new Map(this.records)
      next.delete(id)
      await this.store.save(Array.from(next.values()))
      this.records = next
      this.restoring.get(id)?.abort()
      this.restoring.delete(id)
      this.connections.get(id)?.disconnect()
      this.connections.delete(id)
    })
  }

  shutdown() {
    this.closed = true
    for (const session of this.sessions.values()) if (isLoginPending(session.public.status)) this.finish(session, 'cancelled')
    for (const controller of this.restoring.values()) controller.abort()
    for (const connection of this.connections.values()) connection.disconnect()
  }
}
