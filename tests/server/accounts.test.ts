import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Credentials } from 'zalo-api-final'
import { AccountService } from '../../server/accounts/service.ts'
import { EncryptedAccountStore } from '../../server/accounts/store.ts'
import type { AccountStore, StoredAccount } from '../../server/accounts/store.ts'
import type { AccountConnection, AccountGateway, LoginUpdate } from '../../server/accounts/gateway.ts'
import { createApp } from '../../server/app.ts'

const credentials: Credentials = { imei: 'test-imei-secret', cookie: [], userAgent: 'test-agent-secret' }
function connection(id = '123'): AccountConnection {
  return { profile: { id, displayName: 'Tài khoản kiểm thử', avatar: '', phoneNumber: '' }, credentials, disconnect() {} }
}
class MemoryStore implements AccountStore {
  records: StoredAccount[] = []
  fail = false
  async load() { return this.records }
  async save(records: StoredAccount[]) { if (this.fail) throw new Error('Disk error'); this.records = records }
}
interface LoginRequest { update: (event: LoginUpdate) => void; signal: AbortSignal; resolve: (value: AccountConnection) => void; reject: (error: Error) => void }
class FakeGateway implements AccountGateway {
  requests: LoginRequest[] = []
  loginQR(update: LoginRequest['update'], signal: AbortSignal): Promise<AccountConnection> {
    return new Promise((resolve, reject) => { this.requests.push({ update, signal, resolve, reject }) })
  }
  async restore(): Promise<AccountConnection> { return connection() }
  next(): LoginRequest { const request = this.requests.at(-1); assert.ok(request); return request }
}
async function eventually(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await delay(10) }
  assert.fail('Expected state was not reached')
}

test('QR scan alone does not add an account; successful login stores one and exposes no credentials', async (t) => {
  const store = new MemoryStore(); const gateway = new FakeGateway(); const service = new AccountService(store, gateway)
  t.after(() => service.shutdown()); await service.initialize()
  service.startLogin('first')
  gateway.next().update({ status: 'qr_ready', qrImage: 'data:image/png;base64,TEST', expiresAt: new Date().toISOString() })
  assert.equal(service.getLogin('first')?.status, 'qr_ready')
  gateway.next().update({ status: 'scanned', displayName: 'Tài khoản kiểm thử' })
  assert.equal(service.listAccounts().length, 0)
  gateway.next().resolve(connection())
  await eventually(() => service.getLogin('first')?.status === 'success')
  assert.equal(store.records.length, 1)
  assert.equal(service.listAccounts()[0]?.status, 'connected')
  const payload = JSON.stringify([service.listAccounts(), service.getLogin('first')])
  assert.ok(!payload.includes('test-imei-secret')); assert.ok(!payload.includes('cookie')); assert.ok(!payload.includes('qrImage'))
})

test('closing a pending modal cancels network work and discards a late login success', async (t) => {
  const store = new MemoryStore(); const gateway = new FakeGateway(); const service = new AccountService(store, gateway)
  t.after(() => service.shutdown()); await service.initialize()
  service.startLogin('cancel'); const request = gateway.next()
  await service.cancelLogin('cancel'); assert.equal(request.signal.aborted, true)
  let disconnected = false
  request.resolve({ ...connection(), disconnect() { disconnected = true } })
  await eventually(() => disconnected)
  assert.equal(service.getLogin('cancel')?.status, 'cancelled'); assert.equal(store.records.length, 0)
})

test('cancel arriving before POST prevents an orphan QR login', async (t) => {
  const gateway = new FakeGateway(); const service = new AccountService(new MemoryStore(), gateway)
  t.after(() => service.shutdown()); await service.initialize()
  await service.cancelLogin('early')
  assert.equal(service.startLogin('early').status, 'cancelled'); assert.equal(gateway.requests.length, 0)
})

test('expiry and denial clear QR and abort pending requests', async (t) => {
  const gateway = new FakeGateway(); const service = new AccountService(new MemoryStore(), gateway)
  t.after(() => service.shutdown()); await service.initialize()
  for (const status of ['expired', 'declined'] as const) {
    service.startLogin(status)
    const request = gateway.next()
    request.update({ status: 'qr_ready', qrImage: 'test' }); request.update({ status })
    assert.equal(service.getLogin(status)?.status, status); assert.equal(service.getLogin(status)?.qrImage, undefined); assert.equal(request.signal.aborted, true)
    request.reject(new Error('Network aborted'))
  }
})

test('same Zalo account replaces its session; removal persists across restart', async (t) => {
  const store = new MemoryStore(); const gateway = new FakeGateway(); const service = new AccountService(store, gateway)
  t.after(() => service.shutdown()); await service.initialize()
  for (const id of ['one', 'two']) { service.startLogin(id); gateway.next().resolve(connection()); await eventually(() => service.getLogin(id)?.status === 'success') }
  assert.equal(service.listAccounts().length, 1); assert.equal(store.records.length, 1)
  await service.removeAccount('123')
  const restarted = new AccountService(store, gateway); await restarted.initialize(false); t.after(() => restarted.shutdown())
  assert.equal(restarted.listAccounts().length, 0)
})

test('storage failure must not report login success or add an account', async (t) => {
  const store = new MemoryStore(); store.fail = true
  const gateway = new FakeGateway(); const service = new AccountService(store, gateway)
  t.after(() => service.shutdown()); await service.initialize()
  service.startLogin('failure'); gateway.next().resolve(connection())
  await eventually(() => service.getLogin('failure')?.status === 'error')
  assert.equal(service.listAccounts().length, 0)
})

test('session storage is encrypted, authenticated and reloadable', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zalo-account-test-'))
  try {
    const store = new EncryptedAccountStore(directory)
    const record: StoredAccount = { account: { ...connection().profile, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() }, credentials }
    await store.save([record])
    assert.ok(!(await readFile(path.join(directory, 'accounts.enc'))).includes(Buffer.from(credentials.imei)))
    assert.deepEqual(await new EncryptedAccountStore(directory).load(), [record])
    await store.save([]); assert.deepEqual(await store.load(), [])
    await unlink(path.join(directory, 'session.key'))
    await assert.rejects(new EncryptedAccountStore(directory).load(), /key is missing/)
    await assert.rejects(readFile(path.join(directory, 'session.key')), { code: 'ENOENT' })
  } finally {
    // Only delete the test's own mkdtemp directory, never a computed parent.
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('zalo-account-test-'))
    await rm(directory, { recursive: true, force: true })
  }
})

test('HTTP API rejects foreign origins and serves QR status without credentials', async (t) => {
  const gateway = new FakeGateway(); const service = new AccountService(new MemoryStore(), gateway)
  await service.initialize()
  const server = createApp(service, 3001)
  server.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve))
  t.after(() => { service.shutdown(); server.closeAllConnections(); server.close() })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`
  const headers = { Host: '127.0.0.1:3001', 'X-Zalo-Tool': '1', 'Content-Type': 'application/json' }
  const id = '12345678-1234-1234-1234-123456789abc'
  const denied = await fetch(`${base}/api/account-logins/${id}`, { method: 'POST', headers: { ...headers, Origin: 'https://untrusted.example' } })
  assert.equal(denied.status, 403); assert.equal(gateway.requests.length, 0)
  const missingHeader = await fetch(`${base}/api/account-logins/${id}`, { method: 'POST', headers: { Host: headers.Host } })
  assert.equal(missingHeader.status, 403)
  const created = await fetch(`${base}/api/account-logins/${id}`, { method: 'POST', headers })
  assert.equal(created.status, 202)
  const duplicate = await fetch(`${base}/api/account-logins/${id}`, { method: 'POST', headers })
  assert.equal(duplicate.status, 202); assert.equal(gateway.requests.length, 1)
  gateway.next().resolve(connection()); await eventually(() => service.getLogin(id)?.status === 'success')
  const response = await fetch(`${base}/api/accounts`, { headers })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const body = await response.text(); assert.ok(body.includes('Tài khoản kiểm thử')); assert.ok(!body.includes('test-imei-secret'))
})
