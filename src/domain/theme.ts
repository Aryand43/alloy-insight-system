/**
 * Light and dark presentation.
 *
 * The whole interface is built on one ramp of greys, so a theme is a set of
 * token values rather than a second stylesheet: `index.css` flips the ramp
 * under `[data-theme='light']` and every utility already in the markup lands
 * on the right side of the new background. This module only decides which
 * value the attribute holds and remembers the choice.
 */

export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'prism-theme'

/** Dark is the default: it is what the instrument has always looked like. */
export const DEFAULT_THEME: Theme = 'dark'

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/**
 * The stored preference, or the system's, or dark.
 *
 * Storage can throw in a private window or with site data blocked, so every
 * read is guarded; a theme is not worth failing a page load over.
 */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isTheme(stored)) return stored
  } catch {
    // Fall through to the system preference.
  }
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light'
  } catch {
    // Fall through to the default.
  }
  return DEFAULT_THEME
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A preference that cannot be saved is still applied for this visit.
  }
}
