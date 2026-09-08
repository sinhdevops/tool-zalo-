import type { AriaAttributes, ReactNode } from 'react'

export type FieldError = string | { message?: string } | boolean | null

export interface FieldPresentationProps {
  label?: ReactNode
  helperText?: ReactNode
  error?: FieldError
  required?: boolean
  disabled?: boolean
  wrapperClassName?: string
}

export interface FieldControlProps extends Pick<AriaAttributes,
  'aria-invalid' | 'aria-required' | 'aria-describedby'> {
  id: string
  disabled?: boolean
}

export interface FormFieldProps extends Omit<FieldPresentationProps, 'wrapperClassName'> {
  id?: string
  className?: string
  'aria-describedby'?: string
  children: (props: FieldControlProps) => ReactNode
}
