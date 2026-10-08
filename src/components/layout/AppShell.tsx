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
      <rect width="32" height="32" rx="3" fill="#16202b" stroke="#2d3d4e" />
      <circle cx="16" cy="16" r="10" stroke="#64788d" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="5" stroke="#a8b5c4" strokeWidth="1.25" />
      <circle cx="16" cy="16" r="1.75" fill="#45c3d4" />
    </svg>
  )
}

/**
 * What PRISM stands for. Kept in one place because it appears as the setup
 * heading and as the header's tooltip, and the two must not drift.
 *
 * Note this is the product name. "Process Insight" and "Alloy Insight" remain
 * the names of the two analyses, which is what the run buttons and the mode
 * pill refer to.
 */
export const PRISM_EXPANSION = 'PRedictive Imaging for Solidification and Microstructure'

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
            'flex items-center justify-between gap-4',
            'border-b border-[color:var(--border-hairline)] bg-steel-950/55 backdrop-blur-sm',
            compact ? 'px-3 py-2.5 sm:px-4' : 'px-6 py-4 sm:px-10',
          ].join(' ')}
        >
          <Link
            to="/"
            title={`PRISM — ${PRISM_EXPANSION}`}
            className="focus-ring flex items-center gap-2.5 no-underline transition-opacity hover:opacity-90"
          >
            <BrandMark size={compact ? 22 : 30} />
            {/* The acronym alone in the header: the full name would crowd out
                the build summary that sits beside it on the analysis page. */}
            <span
              className={[
                'font-semibold tracking-tight text-steel-50',
                compact ? 'text-sm' : 'text-base sm:text-lg',
              ].join(' ')}
            >
              PRISM
            </span>
          </Link>
          {trailing}
        </header>
        {demoNote && (
          <div className="border-b border-[color:var(--border-hairline)] bg-steel-900/60 px-4 py-1.5 text-center text-xs leading-relaxed text-steel-400">
            {demoNote}
          </div>
        )}
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  )
}

export { BrandMark }
