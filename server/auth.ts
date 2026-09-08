import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

const COOKIE_NAME = 'zalo_tool_session'
const SESSION_SECONDS = 7 * 24 * 60 * 60

export interface AuthConfig {
  password: string
  secret: string
  secure: boolean
}

function digest(value: string) {
  return createHmac('sha256', 'zalo-tool-password-check').update(value).digest()
}

function equal(left: string, right: string) {
  return timingSafeEqual(digest(left), digest(right))
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function cookieValue(request: IncomingMessage) {
  const cookies = request.headers.cookie?.split(';') ?? []
  for (const cookie of cookies) {
    const [name, ...parts] = cookie.trim().split('=')
    if (name === COOKIE_NAME) return parts.join('=')
  }
  return undefined
}

export function createSession(config: AuthConfig) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS
  const payload = `${expires}.${randomBytes(24).toString('base64url')}`
  return `${payload}.${signature(payload, config.secret)}`
}

export function passwordIsValid(password: unknown, config: AuthConfig) {
  return typeof password === 'string' && equal(password, config.password)
}

export function requestIsAuthenticated(request: IncomingMessage, config?: AuthConfig) {
  if (!config) return true
  const token = cookieValue(request)
  if (!token) return false
  const [expiresText, nonce, receivedSignature, ...extra] = token.split('.')
  if (!expiresText || !nonce || !receivedSignature || extra.length) return false
  const expires = Number(expiresText)
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false
  return equal(receivedSignature, signature(`${expiresText}.${nonce}`, config.secret))
}

export function setSessionCookie(response: ServerResponse, token: string, config: AuthConfig) {
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${config.secure ? '; Secure' : ''}`)
}

export function clearSessionCookie(response: ServerResponse, secure: boolean) {
  response.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`)
}
