import type { Account, LoginSession } from '../../../shared/accounts'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(init.signal ? [init.signal] : [])]),
      headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1', ...init.headers },
    })
  } catch (error) {
    if (init.signal?.aborted) throw error
    throw new Error('Không kết nối được dịch vụ tài khoản. Hãy kiểm tra backend và thử lại.', { cause: error })
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok || data === null) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
      ? data.error : 'Dịch vụ tài khoản chưa sẵn sàng. Hãy thử lại.'
    throw new Error(message)
  }
  return data as T
}

export const accountsApi = {
  list: (signal?: AbortSignal) => request<{ accounts: Account[] }>('/api/accounts', { signal }),
  startLogin: (id: string, signal?: AbortSignal) => request<LoginSession>(`/api/account-logins/${id}`, { method: 'POST', body: '{}', signal }),
  getLogin: (id: string, signal?: AbortSignal) => request<LoginSession>(`/api/account-logins/${id}`, { signal }),
  cancelLogin: (id: string) => request<LoginSession>(`/api/account-logins/${id}`, { method: 'DELETE', keepalive: true }),
  remove: (id: string) => request<{ success: boolean }>(`/api/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
