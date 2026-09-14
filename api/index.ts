// Must stay the first import: config.ts reads these defaults at load time.
import '../server/src/vercelEnv'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from '../server/src/app'

/**
 * Vercel function entry. vercel.json rewrites every /api/* request here; the
 * app's routes live at the root, so strip the prefix before handing over.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url) {
    const stripped = req.url.replace(/^\/api(?=[/?]|$)/, '')
    req.url = stripped.startsWith('/') ? stripped : `/${stripped}`
  }
  return app(req, res)
}
