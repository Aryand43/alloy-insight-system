import { app } from './app.js'
import { BACKEND_DATA_DIR, PORT, PUBLIC_BASE_URL } from './config.js'
import { getCatalog } from './services/catalog.js'

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
