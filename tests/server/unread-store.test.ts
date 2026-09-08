import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { UnreadStore } from '../../server/messages/unread-store.ts'

test('unread persists after restart, deduplicates read messages, and isolates account/type/thread', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zalo-unread-test-'))
  const file = join(dir, 'unread.sqlite')
  let store = new UnreadStore(file)
  try {
    store.observe('a', 'personal', '1', 'm1', true)
    const first = store.state('a', 'personal', '1').through
    store.observe('a', 'personal', '1', 'm1', true)
    store.observe('a', 'personal', '1', 'm2', true)
    store.observe('b', 'personal', '1', 'm1', true)
    store.observe('a', 'group', '1', 'm1', true)
    store.observe('a', 'personal', '2', 'm1', true)
    assert.equal(store.markRead('a', 'personal', '1', first).count, 1)
    store.close()
    store = new UnreadStore(file)
    store.observe('a', 'personal', '1', 'm1', true)
    assert.equal(store.state('a', 'personal', '1').count, 1)
    assert.equal(store.state('b', 'personal', '1').count, 1)
    assert.equal(store.state('a', 'group', '1').count, 1)
    assert.equal(store.state('a', 'personal', '2').count, 1)
    assert.equal(store.readableThrough('a', 'personal', '1', []), 0)
    assert.equal(store.readableThrough('a', 'personal', '1', ['m1']), 0)
    assert.ok(store.readableThrough('a', 'personal', '1', ['m2']) > first)
    store.remove('a', 'personal', '1', 'm2')
    store.observe('a', 'personal', '1', 'm2', true)
    assert.equal(store.state('a', 'personal', '1').count, 0)
  } finally {
    store.close()
    await unlink(file)
    await rmdir(dir)
  }
})
