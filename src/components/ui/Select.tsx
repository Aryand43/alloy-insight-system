import type { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[]
}

export function Select({ options, className = '', ...rest }: SelectProps) {
  return (
    <select
      className={[
        'ctl select-chevron w-full appearance-none px-3 py-2',
        'font-mono text-sm text-steel-100',
        'disabled:opacity-45',
        className,
      ].join(' ')}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
