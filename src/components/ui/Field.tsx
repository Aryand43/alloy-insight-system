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
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="eyebrow">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs leading-relaxed text-steel-400">{hint}</p>
      )}
      {/* Errors sit in the same slot as the hint, so nothing shifts when one replaces the other. */}
      {error && (
        <p className="text-xs leading-relaxed text-signal-red-text">{error}</p>
      )}
    </div>
  )
}
