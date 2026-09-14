import path from 'node:path'

/**
 * Hosting defaults for the Vercel function. Imported for its side effects
 * BEFORE the app, because `config.ts` reads these at module load.
 *
 * - Data comes from the `demo-data/` subset bundled into the function via
 *   `includeFiles`, never the full Backend-Data corpus.
 * - Image URLs are same-origin under `/api`, so they resolve on any
 *   deployment URL without knowing the hostname.
 */
process.env.BACKEND_DATA_DIR ??= path.join(process.cwd(), 'demo-data')
process.env.PUBLIC_BASE_URL ??= '/api'
