import type { ReactNode } from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-xs font-medium uppercase tracking-[0.08em] text-steel-400"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-steel-400 leading-relaxed">{hint}</p>
      )}
      {error && <p className="text-xs text-signal-red">{error}</p>}
    </div>
  )
}
