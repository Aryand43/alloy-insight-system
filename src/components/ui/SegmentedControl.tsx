interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  name: string
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
}

export function SegmentedControl<T extends string>({
  name,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className="flex flex-col gap-1.5"
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <label
            key={opt.value}
            className={[
              'flex cursor-pointer items-center gap-2.5 rounded-sm border px-3 py-2 text-sm transition-colors duration-100',
              'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-400',
              selected
                ? 'border-accent-600/60 bg-accent-500/10 text-steel-50'
                : 'border-[color:var(--border-hairline)] bg-steel-900/40 text-steel-300 hover:border-[color:var(--border-control-hover)] hover:text-steel-100',
            ].join(' ')}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            <span
              className={[
                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                selected ? 'border-accent-400 bg-accent-500' : 'border-steel-500',
              ].join(' ')}
              aria-hidden
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-steel-950" />}
            </span>
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}
