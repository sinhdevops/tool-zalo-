import { useEffect, useRef, useState } from 'react'
import type { GroupMember } from '../../../shared/automation'
import { FormField } from '../../components/common'

export default function SenderSelect({ members, value, onChange, disabled, placeholder }: {
  members: GroupMember[]; value: string[]; onChange: (value: string[]) => void; disabled: boolean; placeholder: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setOpen] = useState(false)
  const open = isOpen && !disabled
  const selected = members.filter(member => value.includes(member.id))
  const summary = selected.length > 1 ? `Đã chọn ${selected.length} người` : selected[0]?.name

  useEffect(() => {
    if (!open) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  return <FormField label="Chỉ nhận tin từ" required disabled={disabled} helperText="Có thể tích chọn nhiều người gửi trong nhóm.">
    {field => <div className="dropdown sender-select" ref={rootRef}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
      onKeyDown={event => {
        if (event.key === 'Escape' && open) {
          event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus()
        }
      }}>
      <button {...field} ref={triggerRef} type="button" className="form-control dropdown__trigger"
        aria-expanded={open} aria-controls={open ? `${field.id}-senders` : undefined}
        title={selected.map(member => member.name).join(', ')}
        onClick={() => setOpen(!open)}>
        <span className={summary ? undefined : 'dropdown__placeholder'}>{summary ?? placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && <div id={`${field.id}-senders`} role="group" aria-label="Người gửi cần theo dõi" className="dropdown__list sender-select__list">
        {members.map(member => <label key={member.id} className="sender-select__option" data-selected={value.includes(member.id) || undefined}>
          <input type="checkbox" checked={value.includes(member.id)} disabled={disabled}
            onChange={event => onChange(event.target.checked ? [...value, member.id] : value.filter(id => id !== member.id))} />
          <span>{member.name} · {member.id}</span>
        </label>)}
      </div>}
    </div>}
  </FormField>
}
