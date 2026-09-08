import FormField from './FormField'
import type { ComponentPropsWithRef } from 'react'
import type { FieldPresentationProps } from './types'

export type TextareaProps = Omit<ComponentPropsWithRef<'textarea'>, 'children'> & FieldPresentationProps

export default function Textarea({
  ref, id, label, helperText, error, required, disabled,
  className = '', wrapperClassName, rows = 4,
  'aria-describedby': describedBy, ...props
}: TextareaProps) {
  return (
    <FormField {...{ id, label, helperText, error, required, disabled }}
      className={wrapperClassName} aria-describedby={describedBy}>
      {(fieldProps) => (
        <textarea {...props} {...fieldProps} ref={ref} rows={rows} required={required}
          className={`form-control form-control--textarea ${className}`} />
      )}
    </FormField>
  )
}
