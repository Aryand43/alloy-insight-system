import type { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[]
}

export function Select({ options, className = '', ...rest }: SelectProps) {
  return (
    <select
      className={[
        'w-full appearance-none rounded border border-steel-600/50 bg-steel-900/80 px-3 py-2.5',
        'text-sm text-steel-100 font-mono',
        'focus:border-signal-yellow/50 focus:outline-none focus:ring-1 focus:ring-signal-yellow/30',
        className,
      ].join(' ')}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
