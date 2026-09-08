import { useEffect, useState } from 'react'
import { isLoginPending } from '../../../../shared/accounts'
import type { LoginSession } from '../../../../shared/accounts'
import { accountsApi } from '../api'

function waitForPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, 1000)
    signal.addEventListener('abort', abort, { once: true })
  })
}

export function useQrLogin(onSuccess: () => void) {
  const [attempt, setAttempt] = useState(0)
  const [session, setSession] = useState<LoginSession | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // A fresh id per effect makes StrictMode's setup/cleanup safe and idempotent.
    const id = crypto.randomUUID()
    const controller = new AbortController()
    let complete = false
    async function run() {
      try {
        let result = await accountsApi.startLogin(id, controller.signal)
        while (!controller.signal.aborted) {
          setSession(result)
          if (!isLoginPending(result.status)) {
            complete = true
            if (result.status === 'success') onSuccess()
            return
          }
          await waitForPoll(controller.signal)
          result = await accountsApi.getLogin(id, controller.signal)
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Không thể tải mã QR.')
          void accountsApi.cancelLogin(id).catch(() => undefined)
        }
      }
    }
    void run()
    return () => {
      controller.abort()
      if (!complete) void accountsApi.cancelLogin(id).catch(() => undefined)
    }
  }, [attempt, onSuccess])

  function retry() { setSession(null); setError(''); setAttempt((value) => value + 1) }
  return { session, error, retry }
}
