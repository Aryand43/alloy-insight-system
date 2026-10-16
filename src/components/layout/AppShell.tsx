import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'
import { useThemeStore } from '../../store/themeStore'
import wordmarkLight from '../../assets/prism-wordmark.png'
import wordmarkDark from '../../assets/prism-wordmark-dark.png'

/**
 * The wordmark, cut from the supplied logo artwork with its white ground
 * keyed out. The artwork's navy ink disappears against the dark interface, so
 * the dark-theme copy is the same cut with its lightness inverted, which keeps
 * the prism glyph's spectrum.
 */
function Wordmark({ compact }: { compact: boolean }) {
  const theme = useThemeStore((t) => t.theme)
  return (
    <img
      src={theme === 'light' ? wordmarkLight : wordmarkDark}
      alt="PRISM"
      width={compact ? 70 : 96}
      height={compact ? 19 : 26}
      className={compact ? 'h-[19px] w-auto' : 'h-[22px] w-auto sm:h-[26px]'}
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
            compact ? 'px-3 py-2.5 sm:px-4' : 'px-6 py-4 sm:px-10',
          ].join(' ')}
        >
          <Link
            to="/"
            title={`PRISM: ${PRISM_EXPANSION}`}
            className="focus-ring flex items-center gap-2.5 no-underline transition-opacity hover:opacity-90"
          >
            {/* The wordmark alone in the header: the full name would crowd out
                the build summary that sits beside it on the analysis page. */}
            <Wordmark compact={compact} />
          </Link>
          <div className="flex items-center gap-2">
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

