import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { phones } from '../../server/automation/parse.ts'
import { AutomationStore } from '../../server/automation/store.ts'
import { automationFixture, incoming, contact } from '../fixtures/automation.ts'
import { withinVietnamTimeWindow } from '../../server/automation/service.ts'
import { createApp } from '../../server/app.ts'
import type { AccountService } from '../../server/accounts/service.ts'

test('Vietnamese phones normalize country prefix and separators, reject dates, UIDs and malformed numbers', () => {
  assert.deepEqual(phones('090 000 0000; +84 900 000 000; 84900000000; 038-000-0000'), ['0900000000', '0380000000'])
  assert.deepEqual(phones('2026-09-03 1230900000000123 abc0900000000 0200000000'), [])
})

test('bulk schedule uses Vietnam time even when the server uses UTC', () => {
  const start = 7 * 60, end = 21 * 60
  assert.equal(withinVietnamTimeWindow(start, end, new Date('2026-09-24T05:07:00Z')), true) // 12:07 VN
  assert.equal(withinVietnamTimeWindow(start, end, new Date('2026-09-24T23:59:00Z')), false) // 06:59 VN
  assert.equal(withinVietnamTimeWindow(start, end, new Date('2026-09-24T14:00:00Z')), false) // 21:00 VN
})

const bulkSettings = { accountId: '99', message: 'Tin nhắn kiểm thử', startTime: '07:00', endTime: '21:00', delaySeconds: 15, pauseEvery: 2, pauseSeconds: 60 }

test('starting a bulk campaign searches and sends during Vietnam daytime', async (t) => {
  const f = automationFixture(new AutomationStore(), 0, () => new Date('2026-09-24T05:07:00Z'))
  t.after(() => f.service.close())
  const id = f.service.createBulk(bulkSettings, ['0900000000']).campaigns[0]!.id
  f.service.startBulk(id)
  await f.drain()
  assert.deepEqual(f.calls.filter(call => call.kind === 'find-user' || call.kind === 'bulk-send'), [
    { kind: 'find-user', id: '0900000000' }, { kind: 'bulk-send', id: '123', text: bulkSettings.message },
  ])
  assert.equal(f.service.bulkSnapshot().sent, 1)
  assert.equal(f.service.bulkSnapshot().running, false)
})

test('bulk campaign shows why it is waiting, then proceeds when Vietnam schedule opens', async (t) => {
  let clock = new Date('2026-09-24T22:07:00Z') // 05:07 VN
  const f = automationFixture(new AutomationStore(), 0, () => clock)
  t.after(() => f.service.close())
  const id = f.service.createBulk(bulkSettings, ['0900000000']).campaigns[0]!.id
  f.service.startBulk(id)
  await f.drain()
  assert.match(f.service.bulkSnapshot().pausedReason, /Ngoài khung giờ.*Việt Nam/)
  assert.equal(f.service.bulkSnapshot().items[0]?.detail, 'Đã vào hàng chờ gửi.')
  assert.equal(f.calls.length, 0)
  clock = new Date('2026-09-25T05:07:00Z')
  await f.drain()
  assert.equal(f.service.bulkSnapshot().sent, 1)
})

test('bulk campaign waits for account connection and sends when it reconnects', async (t) => {
  const f = automationFixture(new AutomationStore(), 0, () => new Date('2026-09-24T05:07:00Z'))
  t.after(() => f.service.close())
  const id = f.service.createBulk(bulkSettings, ['0900000000']).campaigns[0]!.id
  f.setConnection('connecting')
  f.service.startBulk(id)
  assert.match(f.service.bulkSnapshot().pausedReason, /chờ tài khoản Zalo kết nối/)
  f.setConnection('connected')
  await f.drain()
  assert.equal(f.service.bulkSnapshot().sent, 1)
})

test('a restarted campaign resumes pending numbers but does not resend an interrupted number', async (t) => {
  const store = new AutomationStore()
  store.saveBulkCampaign({
    id: 'restart', createdAt: 1, updatedAt: 2, state: 'running', settings: bulkSettings,
    items: [
      { id: 'interrupted', phone: '0900000000', status: 'sending', detail: 'Đang gửi.' },
      { id: 'pending', phone: '0380000000', status: 'pending', detail: 'Chờ bấm Chạy.' },
    ],
  })
  const f = automationFixture(store, 0, () => new Date('2026-09-24T05:07:00Z'))
  t.after(() => f.service.close())
  assert.equal(f.service.bulkSnapshot().items[0]?.status, 'error')
  assert.equal(f.service.bulkSnapshot().running, true)
  await f.drain()
  assert.deepEqual(f.calls.filter(call => call.kind === 'find-user').map(call => call.id), ['0380000000'])
  assert.equal(f.service.bulkSnapshot().failed, 1)
  assert.equal(f.service.bulkSnapshot().sent, 1)
})
test('activity log retains only the latest 100 entries', () => {
  const store = new AutomationStore()
  try {
    for (let index = 0; index < 105; index += 1) store.log(`Log ${index}`)
    const logs = store.logs()
    assert.equal(logs.length, 100)
    assert.equal(logs[0]?.text, 'Log 104')
    assert.equal(logs.at(-1)?.text, 'Log 5')
  } finally { store.close() }
})
test('rule is off by default and only new incoming messages from the chosen account/group/UID qualify', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close())
  await f.service.configure('99', '22', '11', '33')
  f.service.ingest('99', incoming('off')); assert.equal(f.store.stats().total, 0)
  await f.service.toggle(true)
  for (const [key, value] of Object.entries({ threadId: '23', senderId: '12', type: 'personal', self: true, system: true, timestamp: 1 })) {
    const event = incoming(key); Object.assign(event.message, { [key]: value }); f.emit(event)
  }
  f.service.ingest('100', incoming('other-account')); f.emit(incoming('empty', 'Xin chào'))
  await f.drain(); assert.equal(f.store.stats().total, 0); assert.equal(f.calls.length, 0)
})
test('a source message with phones saves leads, hearts, then sends the full source text once', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  f.emit(incoming('1')); await f.drain()
  const lead = f.store.leads().leads[0]!
  assert.equal(lead.address, 'Địa chỉ kiểm thử'); assert.equal(lead.plan, 'NETVT2'); assert.equal(lead.status, 'sent'); assert.ok(lead.sentAt)
  assert.deepEqual(f.calls, [{ kind: 'heart', id: '1' }, { kind: 'send-message', id: '33', text: incoming('expected').message.text }])
  f.emit(incoming('1')); await f.drain()
  assert.equal(f.calls.length, 2)
})
test('heart and delivery job waits for its configured settling delay', async (t) => {
  const f = automationFixture(new AutomationStore(), 12_345); t.after(() => f.service.close()); await f.enable()
  const before = Date.now(); f.emit(incoming('delay'))
  const job = f.store.jobs('pending')[0]!
  assert.ok(job.notBefore >= before + 12_345)
  await f.drain(); assert.equal(f.calls.length, 0)
})
test('all phone numbers in one message are saved while the full source text is delivered once', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  f.emit(incoming('2', 'Số liên hệ: 0900000000\nSố phụ: 0380000000')); await f.drain()
  assert.equal(f.store.stats().total, 2); assert.equal(f.store.stats().sent, 2)
  assert.deepEqual(f.calls, [{ kind: 'heart', id: '2' }, { kind: 'send-message', id: '33', text: 'Số liên hệ: 0900000000\nSố phụ: 0380000000' }])
})
test('a matching contact card is sent after the full source message', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  f.emit(incoming('1')); f.emit(contact('2')); await f.drain()
  assert.deepEqual(f.calls, [
    { kind: 'heart', id: '1' },
    { kind: 'send-message', id: '33', text: incoming('expected').message.text },
    { kind: 'send-card', id: '0900000000', text: '33:123' },
  ])
  assert.equal(f.store.leads().leads[0]?.status, 'sent')
  assert.equal(f.store.leads().leads[0]?.name, 'Khách mẫu')
})
test('a later contact card fills a lead name only when the order did not provide one', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  f.emit(incoming('1', 'Số liên hệ: 0900000000')); f.emit(contact('2', '0900000000', '123')); await f.drain()
  assert.equal(f.store.leads().leads[0]?.name, 'Khách mẫu')
  f.emit(incoming('3', 'Tên khách hàng: Tên trong đơn\nSố liên hệ: 0380000000')); f.emit(contact('4', '0380000000', '456')); await f.drain()
  assert.equal(f.store.leads().leads.find((lead) => lead.phone === '0380000000')?.name, 'Tên trong đơn')
})
test('uncertain delivery remains unchecked and is never retried by duplicate events or worker ticks', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable(); f.failForward()
  f.emit(incoming('1')); await f.drain()
  assert.equal(f.store.leads().leads[0]?.status, 'review'); assert.equal(f.store.leads().leads[0]?.sentAt, undefined)
  f.emit(incoming('1')); await f.drain(); assert.equal(f.calls.filter((c) => c.kind.startsWith('send-')).length, 1)
})
test('lead fields and customer stage are editable with conflict and duplicate-phone protection', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  f.emit(incoming('1')); f.emit(incoming('2', 'Tên khách hàng: Khách hai\nSố liên hệ: 0380000000')); await f.drain()
  const first = f.store.leads().leads.find((lead) => lead.phone === '0900000000')!
  const edited = f.store.editLead(first.id, first.updatedAt, { name: 'Tên đã sửa', phone: '0911111111', address: 'Địa chỉ đã sửa', plan: 'Gói mới', stage: 'paid' })
  assert.equal(edited.name, 'Tên đã sửa'); assert.equal(edited.stage, 'paid')
  assert.deepEqual(f.store.leads('', 'paid').leads.map((lead) => lead.id), [first.id])
  assert.throws(() => f.store.editLead(first.id, first.updatedAt, { name: '', phone: '0922222222', address: '', plan: '', stage: 'new' }), /LEAD_CHANGED/)
  const second = f.store.leads().leads.find((lead) => lead.phone === '0380000000')!
  assert.throws(() => f.store.editLead(second.id, second.updatedAt, { name: '', phone: '0911111111', address: '', plan: '', stage: 'new' }), /LEAD_PHONE_EXISTS/)
})
test('turning off after heart stops the delivery step', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  let release!: () => void
  f.holdHeart(() => new Promise<void>((resolve) => { release = resolve }))
  f.emit(incoming('0')); await f.drain()
  await f.service.toggle(false); release(); await f.drain()
  assert.equal(f.calls.filter((c) => c.kind.startsWith('send-')).length, 0)
  assert.equal(f.store.leads().leads[0]?.status, 'review')
})
test('restart retains leads and dedupe; interrupted effects are marked for review', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zalo-automation-')), file = join(dir, 'automation.sqlite')
  const first = automationFixture(new AutomationStore(file)); await first.enable()
  first.emit(incoming('1'))
  const job = first.store.jobs('pending')[0]!
  first.store.saveJob({ ...job, state: 'running' })
  await first.service.close()
  const second = automationFixture(new AutomationStore(file))
  try {
    await second.service.tick(); second.emit(incoming('1')); await second.drain()
    assert.equal(second.store.stats().total, 1); assert.equal(second.store.leads().leads[0]?.status, 'review')
    assert.equal(second.calls.filter((c) => c.kind.startsWith('send-')).length, 0)
  } finally { await second.service.close(); await unlink(file); await rmdir(dir) }
})
test('automation HTTP validates inputs and rejects foreign origins before side effects', async (t) => {
  const f = automationFixture()
  const server = createApp(f.accounts as AccountService, 3001, f.service)
  server.listen(0, '127.0.0.1'); await new Promise<void>((r) => server.once('listening', r))
  t.after(async () => { server.closeAllConnections(); server.close(); await f.service.close() })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`, headers = { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' }
  assert.equal((await fetch(`${base}/api/automation/enabled`, { method: 'POST', body: '{"enabled":true}' })).status, 403)
  assert.equal((await fetch(`${base}/api/automation/rule`, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body: '{}' })).status, 403)
  assert.equal((await fetch(`${base}/api/automation/enabled`, { method: 'POST', headers, body: '{"enabled":"yes"}' })).status, 400)
  assert.equal((await fetch(`${base}/api/leads?page=-1`)).status, 400)
  assert.equal((await fetch(`${base}/api/leads?stage=unknown`)).status, 400)
  const logs = await (await fetch(`${base}/api/automation/logs`)).json() as { logs: unknown[]; limit: number }
  assert.equal(logs.limit, 100); assert.ok(Array.isArray(logs.logs))
  const saved = await fetch(`${base}/api/automation/rule`, { method: 'POST', headers, body: JSON.stringify({ accountId: '99', groupId: '22', senderId: '11', targetGroupId: '33' }) })
  assert.equal(saved.status, 200); assert.equal(f.store.rule()?.enabled, false); assert.equal(f.calls.length, 0)
})

test('multiple group rules keep leads and pending work independent', async (t) => {
  const f = automationFixture(new AutomationStore(), 60_000); t.after(() => f.service.close())
  await f.enable()
  const snapshot = await f.service.configure('99', '33', '11', '22', null)
  const second = snapshot.rules.find(rule => rule.id !== 'group-leads')!
  assert.ok(second); assert.equal(second.enabled, false)
  assert.equal(f.store.rule()?.enabled, true)
  await f.service.toggle(true, second.id)
  f.emit(incoming('same-message'))
  const other = incoming('same-message'); other.message.threadId = '33'; f.emit(other)
  assert.equal(f.store.stats().total, 2)
  assert.equal(f.store.jobs('pending').length, 2)
  await f.service.toggle(false, 'group-leads')
  assert.equal(f.store.jobs('cancelled').length, 1)
  assert.equal(f.store.jobs('pending').length, 1)
  assert.equal(f.store.jobs('pending')[0]?.targetGroupId, '22')
  const job = f.store.jobs('pending')[0]!; f.store.saveJob({ ...job, notBefore: 0 })
  await f.drain()
  assert.equal(f.store.stats().sent, 1)
  assert.equal(f.calls.filter(call => call.kind === 'send-message')[0]?.id, '22')
  await assert.rejects(f.service.configure('99', '33', '11', '22', null), /đã tồn tại/)
  await assert.rejects(f.service.configure('99', '33', '12', '22', second.id), /Tắt quy tắc/)
  await f.service.toggle(false, second.id)
  await f.service.configure('99', '33', '12', '22', second.id)
  assert.equal(f.store.rules().length, 2)
  assert.equal(f.store.rule(second.id)?.senderId, '12')
})

test('two destinations for one source each receive the message once', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close())
  await f.enable()
  const original = f.store.rule()!
  f.store.saveRule({ ...original, id: 'another-destination', targetGroupId: '44', revision: 'second-revision' })
  await f.service.tick()
  f.emit(incoming('shared-source')); f.emit(incoming('shared-source'))
  await f.drain()
  assert.equal(f.store.stats().total, 2)
  assert.deepEqual(f.calls.filter(call => call.kind === 'send-message').map(call => call.id), ['33', '44'])
})

test('HTTP creates a separate rule while the existing rule stays enabled', async (t) => {
  const f = automationFixture(); await f.enable()
  const server = createApp(f.accounts as AccountService, 3001, f.service)
  server.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeAllConnections(); server.close(); await f.service.close() })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const response = await fetch(`http://127.0.0.1:${address.port}/api/automation/rule`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' },
    body: JSON.stringify({ id: null, accountId: '99', groupId: '33', senderId: '11', targetGroupId: '22' }),
  })
  assert.equal(response.status, 200)
  const state = await response.json() as { rules: { id: string; enabled: boolean }[] }
  assert.equal(state.rules.length, 2)
  assert.equal(state.rules.find(rule => rule.id === 'group-leads')?.enabled, true)
  assert.equal(state.rules.find(rule => rule.id !== 'group-leads')?.enabled, false)
  assert.equal(f.calls.length, 0)
})

test('HTTP toggle targets the selected rule without changing the first rule', async (t) => {
  const f = automationFixture(); await f.enable()
  const state = await f.service.configure('99', '33', '11', '22', null)
  const second = state.rules.find(rule => rule.id !== 'group-leads')!
  const server = createApp(f.accounts as AccountService, 3001, f.service)
  server.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve))
  t.after(async () => { server.closeAllConnections(); server.close(); await f.service.close() })
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  for (const enabled of [true, false]) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/automation/enabled`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' },
      body: JSON.stringify({ id: second.id, enabled }),
    })
    assert.equal(response.status, 200)
    assert.equal(f.store.rule(second.id)?.enabled, enabled)
    assert.equal(f.store.rule()?.enabled, true)
  }
})

test('a running delivery in one group does not block enabling another group', async (t) => {
  const f = automationFixture(); t.after(() => f.service.close()); await f.enable()
  const state = await f.service.configure('99', '33', '11', '22', null)
  const second = state.rules.find(rule => rule.id !== 'group-leads')!
  let release!: () => void
  f.holdHeart(() => new Promise<void>(resolve => { release = resolve }))
  f.emit(incoming('in-flight')); await f.service.tick()
  try {
    assert.equal(f.store.jobs('running').length, 1)
    await f.service.toggle(true, second.id)
    assert.equal(f.store.rule(second.id)?.enabled, true)
    assert.equal(f.store.rule()?.enabled, true)
  } finally { release(); await f.drain() }
})
