/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_USE_MOCK: string
  /** Set only for hosted demo builds; shown as a banner so viewers know the data is a subset. */
  readonly VITE_DEMO_NOTE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
