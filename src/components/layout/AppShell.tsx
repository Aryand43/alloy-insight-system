import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { useThemeStore } from '../../store/themeStore'
import logoLight from '../../assets/prism-logo.webp'
import logoDark from '../../assets/prism-logo-dark.webp'

/**
 * The supplied logo, white ground keyed out so it sits on the header rather
 * than in a white box. The artwork is drawn for paper: its ink is navy and
 * its ground is white, both of which fail on the dark interface, so the
 * dark-theme copy is the same art with its lightness inverted — which turns
 * the ground transparent and the wordmark pale while leaving the prism's
 * spectrum intact.
 */
function Logo({ compact }: { compact: boolean }) {
  const theme = useThemeStore((t) => t.theme)
  return (
    <img
      src={theme === 'light' ? logoLight : logoDark}
      alt="PRISM"
      width={compact ? 150 : 240}
      height={compact ? 75 : 120}
      // Narrower on a phone, where the controls beside it have little room.
      className={compact ? 'h-auto w-[116px] sm:w-[150px]' : 'h-auto w-[180px] sm:w-[240px]'}
      decoding="async"
    />
  )
}


/**
 * What PRISM stands for. Kept in one place because it appears as the setup
 * heading and as the header's tooltip, and the two must not drift.
 *
 * Note this is the product name. "Process Insight" and "Microstructure Insight" remain
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
            compact ? 'px-3 py-2 sm:px-4' : 'px-6 py-3 sm:px-10',
          ].join(' ')}
        >
          {/* Three columns rather than two, so the logo is centred on the
              header itself and does not shift as the controls beside it
              change from page to page. */}
          <div aria-hidden className="min-w-0 flex-1" />
          <Link
            to="/"
            title={`PRISM: ${PRISM_EXPANSION}`}
            className="focus-ring shrink-0 no-underline transition-opacity hover:opacity-90"
          >
            <Logo compact={compact} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            {trailing}
            <ThemeToggle />
          </div>
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

