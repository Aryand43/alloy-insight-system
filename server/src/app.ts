import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { BACKEND_DATA_DIR } from './config'
import { assetsRouter } from './routes/assets'
import { catalogRouter } from './routes/catalog'
import { HttpError } from './routes/helpers'
import { sessionsRouter } from './routes/sessions'
import { thermalRouter } from './routes/thermal'

/**
 * The Express app, shared by the local dev server (`index.ts`) and the Vercel
 * function (`api/index.ts`). Routes live at the root; a host that serves them
 * under a prefix strips it before requests arrive here.
 */
export const app = express()

app.use(
  cors({
    // The field endpoint reports its dimensions in headers; without this the
    // browser hides them from fetch().
    exposedHeaders: ['X-Frame-Width', 'X-Frame-Height', 'X-Frame-Stride'],
  }),
)
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, backendDataDir: BACKEND_DATA_DIR })
})

app.use(catalogRouter)
app.use(sessionsRouter)
app.use(thermalRouter)
app.use(assetsRouter)

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` })
})

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500
  const message = err instanceof Error ? err.message : 'Internal error'
  if (status >= 500) console.error('[server]', err)
  // apiFetch surfaces the raw body as the error message, so send plain text.
  res.status(status).type('text/plain').send(message)
})
