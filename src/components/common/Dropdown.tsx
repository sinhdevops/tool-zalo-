import { useEffect, useRef, useState } from 'react'
import FormField from './FormField'
import { normalizeOptions } from './options'
import type { ComponentPropsWithRef, KeyboardEvent } from 'react'
import type { FieldPresentationProps } from './types'
import type { Option, OptionValue } from './options'

export type DropdownProps<TValue extends OptionValue = OptionValue> =
  Omit<ComponentPropsWithRef<'button'>, 'children' | 'value' | 'defaultValue' | 'onChange' | 'type'> &
  FieldPresentationProps & {
    options?: readonly Option<TValue>[]
    value?: TValue | ''
    defaultValue?: TValue | ''
    onChange?: (value: TValue) => void
    placeholder?: string
    emptyText?: string
  }

/** Single selection dropdown: onChange receives the option value, not an event. */
export default function Dropdown<TValue extends OptionValue = OptionValue>({
  ref, id, name, label, helperText, error, required, disabled,
  options = [], value, defaultValue = '', onChange, onBlur,
  placeholder = 'Chọn một giá trị', emptyText = 'Không có lựa chọn',
  className = '', wrapperClassName, 'aria-describedby': describedBy, ...props
}: DropdownProps<TValue>) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const searchRef = useRef({ text: '', time: 0 })
  const [internalValue, setInternalValue] = useState(defaultValue)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const items = normalizeOptions(options)
  const selectedValue = value !== undefined ? value : internalValue
  const selectedIndex = items.findIndex((item) => item.value === selectedValue)
  const open = isOpen && !disabled
  const enabledIndexes = items.flatMap((item, index) => item.disabled ? [] : [index])
  const activeItem = items[activeIndex]
  const activeEnabled = activeItem && !activeItem.disabled

  useEffect(() => {
    if (!open) return
    function handleOutside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    return () => document.removeEventListener('pointerdown', handleOutside)
  }, [open])

  useEffect(() => {
    if (open) listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, activeIndex])

  function showList(last = false) {
    setActiveIndex(selectedIndex >= 0 && !items[selectedIndex]?.disabled
      ? selectedIndex
      : (last ? enabledIndexes.at(-1) : enabledIndexes[0]) ?? -1)
    setIsOpen(true)
  }

  function choose(index: number) {
    const item = items[index]
    if (!item || item.disabled) return
    if (value === undefined) setInternalValue(item.value)
    onChange?.(item.value)
    setIsOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    props.onKeyDown?.(event)
    if (event.defaultPrevented) return
    const { key } = event
    if (key === 'Tab' || key === 'Escape') {
      setIsOpen(false)
      if (key === 'Escape' && open) event.preventDefault()
      return
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault()
      if (key === 'Enter' || key === ' ') {
        if (open) choose(activeIndex)
        else showList()
      } else if (key === 'Home' || key === 'End') {
        setIsOpen(true)
        setActiveIndex((key === 'Home' ? enabledIndexes[0] : enabledIndexes.at(-1)) ?? -1)
      } else if (!open) {
        showList(key === 'ArrowUp')
      } else if (enabledIndexes.length) {
        const position = enabledIndexes.indexOf(activeIndex)
        const next = position + (key === 'ArrowDown' ? 1 : -1)
        setActiveIndex(enabledIndexes[(next + enabledIndexes.length) % enabledIndexes.length] ?? -1)
      }
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      const now = Date.now()
      const text = (now - searchRef.current.time < 600 ? searchRef.current.text : '') + key
      searchRef.current = { text, time: now }
      const match = enabledIndexes.find((index) => (
        items[index]?.label.toLocaleLowerCase().startsWith(text.toLocaleLowerCase())
      ))
      setIsOpen(true)
      if (match !== undefined) setActiveIndex(match)
    }
  }

  return (
    <FormField {...{ id, label, helperText, error, required, disabled }}
      className={wrapperClassName} aria-describedby={describedBy}>
      {(fieldProps) => (
        <div className="dropdown" ref={rootRef}>
          {name && <input type="hidden" name={name} value={selectedValue ?? ''} disabled={disabled} />}
          <button {...props} {...fieldProps} ref={ref} type="button" role="combobox"
            aria-haspopup="listbox" aria-expanded={open}
            aria-controls={open ? `${fieldProps.id}-listbox` : undefined}
            aria-activedescendant={open && activeEnabled ? `${fieldProps.id}-option-${activeIndex}` : undefined}
            className={`form-control dropdown__trigger ${className}`}
            onClick={(event) => {
              props.onClick?.(event)
              if (!event.defaultPrevented) {
                if (open) setIsOpen(false)
                else showList()
              }
            }}
            onKeyDown={handleKeyDown}
            onBlur={(event) => {
              setIsOpen(false)
              onBlur?.(event)
            }}>
            <span className={selectedIndex < 0 ? 'dropdown__placeholder' : undefined}>
              {items[selectedIndex]?.label ?? placeholder}
            </span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          {open && (
            <ul ref={listRef} id={`${fieldProps.id}-listbox`} role="listbox"
              aria-labelledby={fieldProps.id} className="dropdown__list">
              {items.length === 0 && <li role="presentation" className="dropdown__empty">{emptyText}</li>}
              {items.map((item, index) => (
                <li key={item.value} id={`${fieldProps.id}-option-${index}`} role="option"
                  aria-selected={index === selectedIndex} aria-disabled={item.disabled || undefined}
                  data-active={index === activeIndex || undefined} className="dropdown__option"
                  onPointerDown={(event) => event.preventDefault()}
                  onPointerMove={() => { if (!item.disabled) setActiveIndex(index) }}
                  onClick={() => choose(index)}>
                  <span>{item.label}</span>
                  {index === selectedIndex && <span aria-hidden="true">✓</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </FormField>
  )
}
