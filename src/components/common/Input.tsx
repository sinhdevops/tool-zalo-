import FormField from './FormField'
import type { ComponentPropsWithRef } from 'react'
import type { FieldPresentationProps } from './types'

export type InputProps = Omit<ComponentPropsWithRef<'input'>, 'children'> & FieldPresentationProps

export default function Input({
  ref, id, label, helperText, error, required, disabled,
  className = '', wrapperClassName, type = 'text',
  'aria-describedby': describedBy, ...props
}: InputProps) {
  return (
    <FormField {...{ id, label, helperText, error, required, disabled }}
      className={wrapperClassName} aria-describedby={describedBy}>
      {(fieldProps) => (
        <input {...props} {...fieldProps} ref={ref} type={type} required={required}
          className={`form-control ${className}`} />
      )}
    </FormField>
  )
}
