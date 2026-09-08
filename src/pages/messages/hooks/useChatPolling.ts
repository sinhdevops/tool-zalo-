import { useCallback, useEffect, useState } from 'react'

/** Call with a stable loader. Requests never overlap and stale responses are discarded. */
export function useChatPolling<T>(loader: (signal: AbortSignal) => Promise<T>, interval: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        const result = await loader(controller.signal)
        if (!controller.signal.aborted) { setData(result); setError('') }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu.')
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), interval)
      }
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [loader, interval, version])
  const refresh = useCallback(() => setVersion((value) => value + 1), [])
  return { data, error, refresh }
}
