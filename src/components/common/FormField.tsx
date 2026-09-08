import { useId } from 'react'
import type { FormFieldProps } from './types'
import './form-controls.css'

/** Shared label, hint and error layout. children receives accessible control props. */
export default function FormField({
  id, label, helperText, error, required, disabled, className = '', children,
  'aria-describedby': describedBy,
}: FormFieldProps) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const invalid = Boolean(error)
  const message = typeof error === 'string' ? error : typeof error === 'object' ? error?.message : undefined
  const description = [
    describedBy,
    helperText ? `${fieldId}-hint` : null,
    invalid ? `${fieldId}-error` : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className={`form-field ${className}`} data-disabled={disabled || undefined}>
      {label && (
        <label className="form-field__label" htmlFor={fieldId}>
          {label}{required && <span className="form-field__required" aria-hidden="true"> *</span>}
        </label>
      )}
      {children({
        id: fieldId,
        disabled,
        'aria-invalid': invalid || undefined,
        'aria-required': required || undefined,
        'aria-describedby': description,
      })}
      {helperText && <p id={`${fieldId}-hint`} className="form-field__hint">{helperText}</p>}
      {invalid && (
        <p id={`${fieldId}-error`} className="form-field__error" role="alert">
          {message || 'Giá trị không hợp lệ.'}
        </p>
      )}
    </div>
  )
}
