import { useCallback, useEffect, useRef, useState } from 'react'
import type { Account } from '../../../../shared/accounts'
import { accountsApi } from '../api'

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)
  const refresh = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return accountsApi.list(controller.signal).then((result) => {
      if (!controller.signal.aborted) { setAccounts(result.accounts); setError('') }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được danh sách tài khoản.')
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10_000)
    return () => { clearInterval(timer); controllerRef.current?.abort() }
  }, [refresh])
  return { accounts, loading, error, refresh }
}
