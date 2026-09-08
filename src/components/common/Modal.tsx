import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { FiX } from 'react-icons/fi'
import './modal.css'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  closeDisabled?: boolean
  role?: 'dialog' | 'alertdialog'
}

export default function Modal({ title, children, onClose, closeDisabled = false, role = 'dialog' }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog?.close(); document.body.style.overflow = overflow }
  }, [])

  return (
    <dialog ref={dialogRef} className="app-modal" aria-labelledby={titleId} role={role}
      onCancel={(event) => { event.preventDefault(); if (!closeDisabled) onClose() }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.target === event.currentTarget && !closeDisabled &&
          (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose()
      }}>
      <div className="app-modal__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="Đóng hộp thoại" className="app-icon-button" disabled={closeDisabled} onClick={onClose}><FiX aria-hidden="true" /></button>
      </div>
      <div className="app-modal__body">{children}</div>
    </dialog>
  )
}
