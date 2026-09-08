import { Select } from '../common'
import type { SelectProps } from '../common'
import type { FieldPathByValue, FieldValues } from 'react-hook-form'
import type { ValidationProps } from './types'
import { useValidationField } from './useValidationField'

export type SelectValidationProps<
  TValues extends FieldValues,
  TName extends FieldPathByValue<TValues, string> = FieldPathByValue<TValues, string>,
> = ValidationProps<TValues, TName, SelectProps>

export default function SelectValidation<
  TValues extends FieldValues,
  TName extends FieldPathByValue<TValues, string> = FieldPathByValue<TValues, string>,
>({
  name, control, rules, defaultValue, shouldUnregister, disabled, exact,
  error, required, onChange, onBlur, ...props
}: SelectValidationProps<TValues, TName>) {
  const binding = useValidationField<TValues, TName>({
    name, control, rules, defaultValue, shouldUnregister, disabled, exact, error, required,
  })

  return (
    <Select {...props} {...binding.field}
      value={binding.field.value ?? ''}
      error={binding.error}
      required={binding.required}
      onChange={(value) => {
        binding.field.onChange(value)
        onChange?.(value)
      }}
      onBlur={(event) => {
        binding.field.onBlur()
        onBlur?.(event)
      }} />
  )
}
