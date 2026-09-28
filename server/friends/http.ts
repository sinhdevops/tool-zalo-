import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AccountService } from '../accounts/service.ts'
import { ChatError } from '../messages/types.ts'

async function readCount(request: IncomingMessage): Promise<number> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += data.length
    if (size > 1024) throw new ChatError('Nội dung yêu cầu quá lớn.', 413)
    chunks.push(data)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ChatError('Số lượng bạn bè không hợp lệ.') }
  if (!value || typeof value !== 'object' || !('count' in value) || !Number.isSafeInteger(value.count) || (value.count as number) < 1 || (value.count as number) > 500) {
    throw new ChatError('Số lượng xóa phải từ 1 đến 500.')
  }
  return value.count as number
}

async function readIds(request: IncomingMessage): Promise<string[]> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += data.length
    if (size > 64_000) throw new ChatError('Danh sách bạn bè quá lớn.', 413)
    chunks.push(data)
  }
  let value: unknown
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new ChatError('Danh sách chọn xóa không hợp lệ.') }
  if (!value || typeof value !== 'object' || !('ids' in value) || !Array.isArray(value.ids) || value.ids.length < 1 || value.ids.length > 1000 || value.ids.some((id) => typeof id !== 'string' || !/^\d{1,30}$/.test(id))) {
    throw new ChatError('Hãy chọn từ 1 đến 1.000 UID bạn bè hợp lệ.')
  }
  return [...new Set(value.ids as string[])]
}

export async function handleFriends(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  service: AccountService,
  json: (response: ServerResponse, status: number, body: unknown) => void,
): Promise<boolean> {
  const match = /^\/api\/friends\/([^/]+)(?:\/(remove-oldest|remove-selected))?$/.exec(url.pathname)
  if (!match?.[1]) return false
  const messaging = service.getMessaging(decodeURIComponent(match[1]))
  if (!match[2] && request.method === 'GET') {
    json(response, 200, { friends: await messaging.friends() })
    return true
  }
  if (match[2] === 'remove-oldest' && request.method === 'POST') {
    const count = await readCount(request)
    const friends = await messaging.friends()
    const oldest = friends
      .map((friend, index) => ({ friend, index }))
      .sort((a, b) => (a.friend.createdAt ?? Number.POSITIVE_INFINITY) - (b.friend.createdAt ?? Number.POSITIVE_INFINITY) || a.index - b.index)
      .slice(0, count)
    const removed: string[] = []
    const failed: Array<{ id: string; name: string }> = []
    for (const { friend } of oldest) {
      try {
        await messaging.removeFriend(friend.id)
        removed.push(friend.id)
      } catch {
        failed.push({ id: friend.id, name: friend.name })
      }
    }
    json(response, 200, { requested: oldest.length, removed, failed, remaining: (await messaging.friends()).length })
    return true
  }
  if (match[2] === 'remove-selected' && request.method === 'POST') {
    const ids = await readIds(request)
    const friends = await messaging.friends()
    const current = new Map(friends.map((friend) => [friend.id, friend]))
    if (ids.some((id) => !current.has(id))) throw new ChatError('Danh sách bạn bè đã thay đổi. Hãy tải lại trước khi xóa.', 409)
    const removed: string[] = []
    const failed: Array<{ id: string; name: string }> = []
    for (const id of ids) {
      try {
        await messaging.removeFriend(id)
        removed.push(id)
      } catch {
        failed.push({ id, name: current.get(id)!.name })
      }
    }
    json(response, 200, { requested: ids.length, removed, failed, remaining: (await messaging.friends()).length })
    return true
  }
  throw new ChatError('Yêu cầu quản lý bạn bè không hợp lệ.', 405)
}
