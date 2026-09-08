import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Cookie, CookieJar } from 'tough-cookie'
import { createZaloTransport } from '../../server/accounts/zalo-transport.ts'

test('keeps cookies with commas in Expires across login subdomains and restores them', async () => {
  const cookie = 'session=synthetic-secret; Expires=Wed, 01 Jan 2031 00:00:00 GMT; Domain=.example.com; Path=/; Secure; HttpOnly'
  // Reproduce the installed SDK bug: splitting on ", " loses Domain and Path after Expires.
  const broken = new CookieJar()
  for (const part of cookie.split(', ')) {
    const parsed = Cookie.parse(part)
    if (parsed) await broken.setCookie(parsed, 'https://id.example.com').catch(() => undefined)
  }
  assert.equal(await broken.getCookieString('https://chat.example.com/jr/userinfo'), '')

  let calls = 0
  const fetcher: typeof fetch = async (_input, init) => {
    assert.equal(init?.redirect, 'manual')
    const headers = new Headers(init?.headers)
    if (calls++ === 0) {
      assert.equal(headers.has('cookie'), false)
      const responseHeaders = new Headers({ Location: 'https://chat.example.com/jr/userinfo' })
      responseHeaders.append('Set-Cookie', cookie)
      responseHeaders.append('Set-Cookie', 'other=value; Domain=.example.com; Path=/; Secure')
      return new Response(null, { status: 302, headers: responseHeaders })
    }
    assert.match(headers.get('cookie') ?? '', /session=synthetic-secret/)
    assert.match(headers.get('cookie') ?? '', /other=value/)
    assert.ok(!headers.get('cookie')?.includes('stale'))
    return new Response('ok')
  }
  const transport = createZaloTransport(new AbortController().signal, undefined, fetcher)
  const first = await transport.request('https://id.example.com/account/checksession')
  await transport.request(first.headers.get('location')!, { headers: { Cookie: 'stale=invalid' } })
  const restored = createZaloTransport(new AbortController().signal, transport.cookies(), fetcher)
  await restored.request('https://chat.example.com/jr/userinfo')
  transport.disconnect(); restored.disconnect()
})

test('cookie paths are respected and empty jars do not reuse stale SDK cookies', async () => {
  let calls = 0
  const transport = createZaloTransport(new AbortController().signal, undefined, async (_url, init) => {
    const cookie = new Headers(init?.headers).get('cookie')
    if (calls++ === 0) return new Response(null, { headers: { 'Set-Cookie': 'only=synthetic; Path=/private; Secure' } })
    assert.equal(cookie, null)
    return new Response('ok')
  })
  await transport.request('https://chat.example.com/private/login')
  await transport.request('https://chat.example.com/public', { headers: { Cookie: 'only=synthetic' } })
  transport.disconnect()
})
