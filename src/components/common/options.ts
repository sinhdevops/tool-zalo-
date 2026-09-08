export type OptionValue = string | number

export interface SelectOption<TValue extends OptionValue = OptionValue> {
  value: TValue
  label: string
  disabled?: boolean
}

export type Option<TValue extends OptionValue = OptionValue> = TValue | SelectOption<TValue>

// Values must be unique strings or numbers; an empty string represents no selection.
export function normalizeOptions<TValue extends OptionValue>(
  options: readonly Option<TValue>[] = [],
): SelectOption<TValue>[] {
  return options.map((option) => (
    typeof option === 'object' && option !== null
      ? option
      : { value: option, label: String(option) }
  ))
}
