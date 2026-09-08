import FormField from './FormField'
import { normalizeOptions } from './options'
import type { ComponentPropsWithRef } from 'react'
import type { FieldPresentationProps } from './types'
import type { Option } from './options'

export type SelectProps = Omit<ComponentPropsWithRef<'select'>, 'children' | 'multiple'> &
  FieldPresentationProps & {
    options?: readonly Option[]
    placeholder?: string | null
  }

/** Native select: onChange receives the native React change event (string value). */
export default function Select({
  ref, id, label, helperText, error, required, disabled, options = [],
  placeholder = 'Chọn một giá trị', className = '', wrapperClassName,
  'aria-describedby': describedBy, ...props
}: SelectProps) {
  return (
    <FormField {...{ id, label, helperText, error, required, disabled }}
      className={wrapperClassName} aria-describedby={describedBy}>
      {(fieldProps) => (
        <select {...props} {...fieldProps} ref={ref} required={required}
          className={`form-control form-control--select ${className}`}>
          {placeholder !== null && <option value="">{placeholder}</option>}
          {normalizeOptions(options).map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  )
}
