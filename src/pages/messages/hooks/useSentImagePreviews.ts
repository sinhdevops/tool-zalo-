import { useEffect, useRef, useState } from 'react'
import type { SendChatInput } from '../../../../shared/messages'

/** Keep the acknowledged upload visible even when the browser cannot reach Zalo's CDN. */
export function useSentImagePreviews() {
  const entries = useRef(new Map<string, { url: string; bytes: number }>())
  const active = useRef(true)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    active.current = true
    const cache = entries.current
    return () => { active.current = false; for (const item of cache.values()) URL.revokeObjectURL(item.url); cache.clear() }
  }, [])
  function remember(ids: string[], attachment?: SendChatInput['attachment']) {
    if (!active.current || !attachment || !ids.length) return
    const bytes = Uint8Array.from(atob(attachment.base64), (character) => character.charCodeAt(0))
    const prefix = String.fromCharCode(...bytes.slice(0, 12))
    const type = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : prefix.startsWith('\x89PNG\r\n\x1a\n') ? 'image/png'
      : prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a') ? 'image/gif'
      : prefix.startsWith('RIFF') && prefix.slice(8) === 'WEBP' ? 'image/webp' : undefined
    if (!type) return
    const blob = new Blob([bytes], { type })
    for (const id of ids) {
      const previous = entries.current.get(id)
      if (previous) URL.revokeObjectURL(previous.url)
      entries.current.set(id, { url: URL.createObjectURL(blob), bytes: bytes.length })
    }
    let total = [...entries.current.values()].reduce((sum, item) => sum + item.bytes, 0)
    for (const [id, item] of entries.current) {
      if (total <= 30 * 1024 * 1024) break
      URL.revokeObjectURL(item.url); entries.current.delete(id); total -= item.bytes
    }
    setPreviews(Object.fromEntries([...entries.current].map(([id, item]) => [id, item.url])))
  }
  return { previews, remember }
}
