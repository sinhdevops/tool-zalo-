import { Dropdown } from '../common'
import type { DropdownProps, OptionValue } from '../common'
import type { FieldPathByValue, FieldValues, FieldPathValue } from 'react-hook-form'
import type { ValidationProps } from './types'
import { useValidationField } from './useValidationField'

export type DropdownValidationProps<
  TValues extends FieldValues,
  TName extends FieldPathByValue<TValues, OptionValue> = FieldPathByValue<TValues, OptionValue>,
> = ValidationProps<TValues, TName, DropdownProps<FieldPathValue<TValues, TName> & OptionValue>>

export default function DropdownValidation<
  TValues extends FieldValues,
  TName extends FieldPathByValue<TValues, OptionValue> = FieldPathByValue<TValues, OptionValue>,
>({
  name, control, rules, defaultValue, shouldUnregister, disabled, exact,
  error, required, onChange, onBlur, ...props
}: DropdownValidationProps<TValues, TName>) {
  const binding = useValidationField<TValues, TName>({
    name, control, rules, defaultValue, shouldUnregister, disabled, exact, error, required,
  })

  return (
    <Dropdown<FieldPathValue<TValues, TName> & OptionValue> {...props} {...binding.field}
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
