import { useThemeStore } from '../../store/themeStore'

/**
 * Switches the interface between light and dark.
 *
 * The attribute is already set before React runs, by a small script in
 * index.html, so this starts from whatever is on the document rather than
 * re-deciding and causing a flash.
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[color:var(--border-hairline)] bg-steel-900/40 text-steel-300 transition-colors hover:border-[color:var(--border-control-hover)] hover:text-steel-50"
    >
      {theme === 'dark' ? (
        // Sun: what the control switches to.
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="3.1" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M8 1v1.8M8 13.2V15M15 8h-1.8M2.8 8H1M12.9 3.1l-1.3 1.3M4.4 11.6l-1.3 1.3M12.9 12.9l-1.3-1.3M4.4 4.4L3.1 3.1"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // Moon.
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M13.5 9.6A5.9 5.9 0 0 1 6.4 2.5a5.9 5.9 0 1 0 7.1 7.1Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
