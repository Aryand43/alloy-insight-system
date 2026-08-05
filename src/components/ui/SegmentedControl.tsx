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
              'flex cursor-pointer items-center gap-3 rounded border px-3 py-2.5 text-sm transition-colors',
              selected
                ? 'border-signal-yellow/40 bg-steel-800/80 text-steel-50'
                : 'border-steel-700/40 bg-steel-900/40 text-steel-300 hover:border-steel-600/60',
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
                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-signal-yellow bg-signal-yellow'
                  : 'border-steel-500',
              ].join(' ')}
              aria-hidden
            >
              {selected && (
                <span className="h-1.5 w-1.5 rounded-full bg-steel-950" />
              )}
            </span>
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}
