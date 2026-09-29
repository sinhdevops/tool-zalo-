const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000

export const lookupRetryDelay = (retryCount: number) => Math.min(60 * 60 * 1000, 5 * 60 * 1000 * 2 ** Math.min(Math.max(0, retryCount - 1), 4))
export const vietnamTime = (timestamp: number) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }).format(timestamp)

export function lookupRateLimitRetryAt(code: 312 | 313, message: string, now = Date.now()) {
  const match = /(?:thử lại vào|try again at)\s*(\d{1,2}):(\d{2})/i.exec(message)
  const hour = Number(match?.[1]), minute = Number(match?.[2])
  if (match && hour <= 23 && minute <= 59) {
    const vietnamNow = new Date(now + VIETNAM_OFFSET_MS)
    let retryAt = Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate(), hour, minute) - VIETNAM_OFFSET_MS
    if (retryAt <= now) {
      if (code === 312) return now + 61 * 60 * 1000
      retryAt += 24 * 60 * 60 * 1000
    }
    return retryAt + 60_000
  }
  if (code === 313) {
    const vietnamNow = new Date(now + VIETNAM_OFFSET_MS)
    return Date.UTC(vietnamNow.getUTCFullYear(), vietnamNow.getUTCMonth(), vietnamNow.getUTCDate() + 1) - VIETNAM_OFFSET_MS + 60_000
  }
  return now + 61 * 60 * 1000
}

export function retryAtFromLookupDetail(detail: string, now = Date.now()) {
  const match = /(?:mã|code)\s*(312|313)/i.exec(detail)
  if (!match) return null
  const code = Number(match[1]) as 312 | 313
  return lookupRateLimitRetryAt(code, detail, now)
}

export function isLookupFailureDetail(detail: string) {
  return /không nhận được kết quả tra cứu|không trả về uid hợp lệ|không tra cứu được tài khoản zalo/i.test(detail)
}
