import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form'

/** RHF owns registration and value; keep each control's native event types. */
export type ValidationProps<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
  TControlProps,
> = Omit<TControlProps, 'name' | 'value' | 'defaultValue' | 'ref' | 'disabled'> &
  UseControllerProps<TValues, TName>
