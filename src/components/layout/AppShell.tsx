import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
    >
      <rect width="32" height="32" rx="4" fill="#1a222c" />
      <circle cx="16" cy="16" r="10" stroke="#8a9aab" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="5" stroke="#c5d0db" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="1.5" fill="#e8b84a" />
    </svg>
  )
}

interface AppShellProps {
  children: ReactNode
  compact?: boolean
  trailing?: ReactNode
}

export function AppShell({ children, compact = false, trailing }: AppShellProps) {
  const demoNote = import.meta.env.VITE_DEMO_NOTE
  return (
    <div className="app-atmosphere relative min-h-dvh">
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header
          className={[
            'flex items-center justify-between gap-4 border-b border-steel-700/30',
            compact ? 'px-4 py-2.5' : 'px-6 py-4 sm:px-10',
          ].join(' ')}
        >
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <BrandMark size={compact ? 24 : 32} />
            <span
              className={[
                'font-semibold tracking-tight text-steel-50',
                compact ? 'text-sm' : 'text-base sm:text-lg',
              ].join(' ')}
            >
              Process Insight
            </span>
          </Link>
          {trailing}
        </header>
        {demoNote && (
          <div className="border-b border-steel-700/40 bg-steel-900/70 px-4 py-2 text-center text-xs text-steel-300">
            {demoNote}
          </div>
        )}
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}

export { BrandMark }
