import type { ChangeEvent } from 'react'
import type { DropdownProps, InputProps } from '../../src/components/common'
import type { DropdownValidationProps, InputValidationProps } from '../../src/components/validation'

interface FormValues {
  profile: { email: string }
  group: 'customers' | 'partners' | ''
  quantity: number
  active: boolean
}

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends (<T>() => T extends TRight ? 1 : 2) ? true : false
type Assert<T extends true> = T
type TextField = InputValidationProps<FormValues>
type GroupField = DropdownValidationProps<FormValues, 'group'>

// Compile-time regression checks: these fail tsc if the public types get widened.
export type FormControlContracts = [
  Assert<Equal<TextField['name'], 'profile.email' | 'group'>>,
  Assert<Equal<GroupField['defaultValue'], FormValues['group'] | undefined>>,
  Assert<Equal<Parameters<NonNullable<GroupField['onChange']>>[0], FormValues['group']>>,
  Assert<Equal<Parameters<NonNullable<InputProps['onChange']>>[0], ChangeEvent<HTMLInputElement>>>,
  Assert<Equal<Parameters<NonNullable<DropdownProps<number>['onChange']>>[0], number>>,
]

// @ts-expect-error A missing field name cannot be registered.
export type UnknownField = InputValidationProps<FormValues, 'profile.missing'>
// @ts-expect-error Text inputs emit strings, not numeric model values.
export type NumericTextField = InputValidationProps<FormValues, 'quantity'>
// @ts-expect-error A dropdown cannot bind a boolean field.
export type BooleanDropdown = DropdownValidationProps<FormValues, 'active'>
