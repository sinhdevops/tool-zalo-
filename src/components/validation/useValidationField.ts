import { useController, useFormContext } from 'react-hook-form'
import type { FieldPath, FieldValues, UseControllerProps } from 'react-hook-form'
import type { FieldPresentationProps } from '../common'

/** Shared RHF binding for controls with different DOM elements and event types. */
export function useValidationField<
  TValues extends FieldValues,
  TName extends FieldPath<TValues>,
>({
  error, required, ...controllerProps
}: UseControllerProps<TValues, TName> & Pick<FieldPresentationProps, 'error' | 'required'>) {
  const methods = useFormContext<TValues>()
  const { field, fieldState } = useController<TValues, TName>({
    ...controllerProps,
    control: controllerProps.control ?? methods?.control,
  })
  const requiredRule = controllerProps.rules?.required

  return {
    field,
    error: error ?? fieldState.error,
    required: required ?? Boolean(typeof requiredRule === 'object' ? requiredRule.value : requiredRule),
  }
}
