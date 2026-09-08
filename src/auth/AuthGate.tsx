import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './auth.css'

type Session = { authenticated: boolean; required: boolean }

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const requireLogin = () => setSession((current) => ({ authenticated: false, required: current?.required ?? true }))
    window.addEventListener('zalo-auth-required', requireLogin)
    fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(async (response) => response.ok ? response.json() as Promise<Session> : Promise.reject())
      .then(setSession)
      .catch(() => setSession({ authenticated: false, required: true }))
    return () => window.removeEventListener('zalo-auth-required', requireLogin)
  }, [])

  async function login(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true); setError('')
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Zalo-Tool': '1' },
        body: JSON.stringify({ password }),
      })
      const result = await response.json() as Session & { error?: string }
      if (!response.ok) throw new Error(result.error || 'Không thể đăng nhập.')
      setPassword(''); setSession(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập.')
    } finally { setSubmitting(false) }
  }

  if (!session) return <main className="auth-screen"><p className="auth-loading" role="status">Đang kết nối dịch vụ…</p></main>
  if (session.authenticated) return children
  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={(event) => void login(event)}>
        <div className="auth-mark" aria-hidden="true">Z</div>
        <div><h1>Đăng nhập Zalo Tool</h1><p>Nhập mật khẩu quản trị để tiếp tục.</p></div>
        <label htmlFor="admin-password">Mật khẩu</label>
        <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
      </form>
    </main>
  )
}
