import path from 'node:path'
import fs from 'node:fs/promises'
import { Router } from 'express'
import { layerProfileSvg, layerThumbnailSvg, type ChartKind } from '../services/charts'
import { getLayerSeries } from '../services/layers'
import { HttpError, requireBuild, thresholdsFrom } from './helpers'

export const assetsRouter = Router()

const IMMUTABLE = 'public, max-age=3600'

function parseKind(raw: unknown): ChartKind {
  return raw === 'size' ? 'size' : 'temp'
}

function parseLayer(raw: string, max: number): number {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new HttpError(`Layer ${raw} out of range (1-${max})`, 404)
  }
  return n
}

/**
 * Serves a KIV histogram PNG.
 *
 * Every path segment is validated first — the build against the catalog, the
 * layer against that build's layer count, the kind against a fixed pair — so
 * the filename is assembled only from known-good values.
 */
assetsRouter.get('/builds/:buildId/layers/:layer/kiv/:kind.png', async (req, res) => {
  const entry = await requireBuild(req.params.buildId)
  const kind = parseKind(req.params.kind)
  const layer = parseLayer(req.params.layer, entry.layers)

  const dir = kind === 'temp' ? entry.kivTempDir : entry.kivSizeDir
  if (!dir) {
    throw new HttpError(`${entry.id} has no KIV ${kind} images`, 404)
  }

  const file = path.join(dir, `${entry.id}_L${layer}${kind}.png`)
  try {
    await fs.access(file)
  } catch {
    throw new HttpError(`No KIV ${kind} image for ${entry.id} layer ${layer}`, 404)
  }

  res.setHeader('Cache-Control', IMMUTABLE)
  res.sendFile(file)
})

assetsRouter.get('/builds/:buildId/layers/:layer/chart.svg', async (req, res) => {
  const entry = await requireBuild(req.params.buildId)
  const series = await getLayerSeries(entry, thresholdsFrom(req))
  const layer = parseLayer(req.params.layer, series.points.length)

  res.setHeader('Cache-Control', IMMUTABLE)
  res.type('image/svg+xml').send(layerProfileSvg(series, layer, parseKind(req.query.kind)))
})

assetsRouter.get('/builds/:buildId/layers/:layer/thumb.svg', async (req, res) => {
  const entry = await requireBuild(req.params.buildId)
  const series = await getLayerSeries(entry, thresholdsFrom(req))
  const layer = parseLayer(req.params.layer, series.points.length)

  res.setHeader('Cache-Control', IMMUTABLE)
  res.type('image/svg+xml').send(layerThumbnailSvg(series, layer, parseKind(req.query.kind)))
})
