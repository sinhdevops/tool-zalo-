import { CookieJar } from 'tough-cookie'
import type { Credentials } from 'zalo-api-final'
import { safeLoginError } from './login-errors.ts'

/** The SDK splits Set-Cookie on commas (including Expires) and loses cookies on automatic redirects. */
export function createZaloTransport(signal: AbortSignal, cookies?: Credentials['cookie'], fetcher: typeof fetch = fetch) {
  const jar = cookies ? CookieJar.fromJSON(JSON.stringify({ cookies: Array.isArray(cookies) ? cookies : cookies.cookies })) : new CookieJar()
  const lifetime = new AbortController()
  let authenticating = true

  const request: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    // The jar owns Cookie even when the SDK supplies a stale header from a previous redirect.
    const cookie = await jar.getCookieString(url.href)
    if (cookie) headers.set('Cookie', cookie)
    else headers.delete('Cookie')
    let response: Response
    try {
      response = await fetcher(input, {
        ...init, headers, redirect: 'manual',
        signal: AbortSignal.any([lifetime.signal, ...(authenticating ? [signal] : []), AbortSignal.timeout(120_000), ...(init?.signal ? [init.signal] : [])]),
      })
    } catch (error) {
      if (authenticating && !signal.aborted) console.error('[account-login:network]', url.pathname, safeLoginError(error))
      throw error
    }
    // Each header remains intact, including Expires dates, Domain and Path attributes.
    for (const value of response.headers.getSetCookie()) {
      await jar.setCookie(value, url.href).catch(() => {
        if (authenticating) console.warn('[account-login:cookie-rejected]', url.pathname)
      })
    }
    if (authenticating) {
      console.info('[account-login:http]', url.pathname, response.status)
      if (response.headers.get('content-type')?.includes('application/json')) {
        void response.clone().json().then((body: unknown) => {
          if (body && typeof body === 'object' && 'error_code' in body && typeof body.error_code === 'number' && body.error_code !== 0 && body.error_code !== 8) console.warn('[account-login:remote-code]', url.pathname, body.error_code)
        }).catch(() => console.warn('[account-login:invalid-json]', url.pathname))
      }
    }
    // Let the SDK follow its redirect after cookies have been stored, without dropping intermediate headers.
    return response
  }
  return {
    request,
    cookies: () => jar.serializeSync()?.cookies ?? [],
    authenticated: () => { authenticating = false },
    disconnect: () => lifetime.abort(),
  }
}
