import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDocumentsPage, parseCloudJson } from '../../server/messages/documents-history.ts'
import { ThreadType } from 'zalo-api-final'

test('cloud JSON preserves large UIDs and pagination IDs exactly', () => {
  const page = normalizeDocumentsPage(parseCloudJson('{"groupMsgs":[{"msgId":8222365410950123456,"cliMsgId":"123","uidFrom":640853224902936751,"msgType":"webchat","content":"Ghi chú mẫu","ts":"1700000000000"}],"lastMsgId":8222365410950123456,"hasMore":1,"isOld":1}'), '555', '99')
  assert.equal(page.messages[0]?.data.uidFrom, '640853224902936751')
  assert.equal(page.messages[0]?.data.msgId, '8222365410950123456')
  assert.equal(page.cursor, '8222365410950123456')
  assert.equal(page.messages[0]?.threadId, '555')
  assert.equal(page.messages[0]?.type, ThreadType.User)
  assert.equal(page.more, true); assert.equal(page.isOld, true)
})

test('cloud empty history is distinct from an invalid response', () => {
  assert.deepEqual(normalizeDocumentsPage({ groupMsgs: [], hasMore: 0, isOld: 0 }, '555', '99'), { messages: [], cursor: undefined, more: false, isOld: false })
  assert.throws(() => normalizeDocumentsPage({ error_code: 604 }, '555', '99'), /không đúng định dạng/)
  assert.throws(() => normalizeDocumentsPage({ groupMsgs: [{}] }, '555', '99'), /Không đọc được/)
})
