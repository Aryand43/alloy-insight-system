import { create } from 'zustand'
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type Theme,
} from '../domain/theme'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

/**
 * The active theme, in a store rather than component state.
 *
 * The toggle is in the header but the server-rendered charts need to know
 * too: they are images, so their colours are baked in when they are
 * requested, and the panels that request them have to re-render when the
 * theme changes.
 *
 * The initial value comes from the attribute the inline script in index.html
 * already set, so React never disagrees with what is on screen.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme:
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'light'
      : typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
        ? 'dark'
        : readStoredTheme(),
  setTheme: (theme) => {
    applyTheme(theme)
    storeTheme(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))
