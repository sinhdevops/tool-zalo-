import { useState } from 'react'
import { FiCloud, FiUsers } from 'react-icons/fi'

export default function ChatAvatar({ name, avatar, group = false, documents = false }: { name: string; avatar: string; group?: boolean; documents?: boolean }) {
  const [failed, setFailed] = useState(false)
  return <span className={`chat-avatar${group ? ' chat-avatar--group' : ''}${documents ? ' chat-avatar--documents' : ''}`}>
    {documents ? <FiCloud aria-hidden="true" /> : !failed && avatar.startsWith('https://') ? <img src={avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : group ? <FiUsers aria-hidden="true" /> : name.slice(0, 1).toUpperCase()}
  </span>
}
