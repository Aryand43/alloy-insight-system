import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  children: ReactNode
}

/**
 * Three weights of action, in one geometry.
 *
 * Primary carries the accent fill, so there is only ever one obvious next
 * step on a screen; secondary is a bordered surface for parallel actions; and
 * ghost is for inline, repeated actions where a bordered control would turn a
 * list into a grid of boxes.
 */
const variants: Record<Variant, string> = {
  primary: [
    'bg-accent-600 text-steel-50 font-semibold',
    'border border-accent-500/70',
    'shadow-[0_1px_0_rgba(242,245,249,0.12)_inset,0_6px_16px_-10px_rgba(41,168,186,0.9)]',
    'hover:bg-accent-500 hover:border-accent-400/70',
    'active:bg-accent-700',
  ].join(' '),
  secondary: [
    'bg-steel-800/70 text-steel-100 font-medium',
    'border border-[color:var(--border-control)]',
    'hover:bg-steel-800 hover:border-[color:var(--border-control-hover)]',
    'active:bg-steel-850',
  ].join(' '),
  ghost: [
    'bg-transparent text-steel-300 border border-transparent',
    'hover:text-steel-50 hover:bg-steel-800/60 hover:border-[color:var(--border-hairline)]',
    'active:bg-steel-850',
  ].join(' '),
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
        'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm',
        'transition-colors duration-100 select-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-400',
        'disabled:opacity-45 disabled:pointer-events-none',
        variants[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
