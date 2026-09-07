import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import { BACKEND_DATA_DIR, PORT, PUBLIC_BASE_URL } from './config'
import { assetsRouter } from './routes/assets'
import { catalogRouter } from './routes/catalog'
import { HttpError } from './routes/helpers'
import { sessionsRouter } from './routes/sessions'
import { thermalRouter } from './routes/thermal'
import { getCatalog } from './services/catalog'

const app = express()

app.use(cors())
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

async function main(): Promise<void> {
  try {
    const catalog = await getCatalog()
    const withKiv = catalog.filter((b) => b.hasKivImages).length
    const withRaw = catalog.filter((b) => b.hasRawFrames).length
    console.log(
      `[server] catalog ready: ${catalog.length} builds (${withKiv} with KIV images, ${withRaw} with raw frames)`,
    )
  } catch (err) {
    console.error(`[server] could not read Backend-Data: ${String(err)}`)
    console.error(`[server] looked in: ${BACKEND_DATA_DIR}`)
    console.error('[server] set BACKEND_DATA_DIR to override.')
  }

  app.listen(PORT, () => {
    console.log(`[server] Alloy Insight data bridge on ${PUBLIC_BASE_URL}`)
  })
}

void main()
