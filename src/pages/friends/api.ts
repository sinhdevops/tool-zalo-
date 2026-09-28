import { apiUrl } from '../../api-url'

export interface FriendContact {
  id: string
  name: string
  avatar: string
  createdAt: number | null
}

async function request<T>(accountId: string, action = '', init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(`/api/friends/${encodeURIComponent(accountId)}${action}`), {
      ...init,
      signal: AbortSignal.any([AbortSignal.timeout(init.method === 'POST' ? 600_000 : 45_000), ...(init.signal ? [init.signal] : [])]),
      headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1', ...init.headers },
    })
  } catch (cause) {
    if (init.signal?.aborted) throw cause
    throw new Error('Không kết nối được dịch vụ bạn bè. Hãy kiểm tra backend và thử lại.', { cause })
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok || data === null) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Không tải được dữ liệu bạn bè.'
    throw new Error(message)
  }
  return data as T
}

export const friendsApi = {
  list: (accountId: string, signal?: AbortSignal) => request<{ friends: FriendContact[] }>(accountId, '', { signal }),
  removeOldest: (accountId: string, count: number) => request<{ requested: number; removed: string[]; failed: Array<{ id: string; name: string }>; remaining: number }>(accountId, '/remove-oldest', { method: 'POST', body: JSON.stringify({ count }) }),
  removeSelected: (accountId: string, ids: string[]) => request<{ requested: number; removed: string[]; failed: Array<{ id: string; name: string }>; remaining: number }>(accountId, '/remove-selected', { method: 'POST', body: JSON.stringify({ ids }) }),
}
