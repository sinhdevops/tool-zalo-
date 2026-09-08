import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { ConversationType, MessageList } from '../../../../shared/messages'
import { chatApi } from '../api'

export function useReadConversation(accountId: string, type: ConversationType, threadId: string, data: MessageList | null, scrollRef: RefObject<HTMLDivElement | null>, refresh: () => void) {
  const [error, setError] = useState('')
  const pending = useRef(false)
  const completed = useRef(0)
  useEffect(() => {
    let cancelled = false
    const node = scrollRef.current
    const through = data?.unread?.through ?? 0
    const check = () => {
      if (cancelled || pending.current || !node || !data?.unread?.count || !through || completed.current >= through) return
      if (document.visibilityState !== 'visible' || !document.hasFocus() || node.scrollHeight - node.scrollTop - node.clientHeight >= 80) return
      pending.current = true
      void chatApi.markRead(accountId, type, threadId, through).then(() => {
        if (cancelled) return
        completed.current = through
        setError('')
        window.dispatchEvent(new Event('chat-unread-updated'))
        refresh()
      }).catch(() => { if (!cancelled) setError('Chưa cập nhật được trạng thái đã đọc. Tool sẽ thử lại.') }).finally(() => { pending.current = false })
    }
    check()
    node?.addEventListener('scroll', check, { passive: true })
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      cancelled = true
      node?.removeEventListener('scroll', check)
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [accountId, type, threadId, data, scrollRef, refresh])
  return error
}
