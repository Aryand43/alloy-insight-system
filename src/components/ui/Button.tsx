import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-signal-yellow text-steel-950 hover:bg-[#f0c55e] font-semibold shadow-[0_0_0_1px_rgba(232,184,74,0.3)]',
  secondary:
    'bg-steel-800 text-steel-100 border border-steel-600/60 hover:bg-steel-700',
  ghost: 'bg-transparent text-steel-300 hover:text-steel-100 hover:bg-steel-800/60',
}

export function Button({
  variant = 'primary',
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 rounded px-4 py-2.5 text-sm transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-yellow/60',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
