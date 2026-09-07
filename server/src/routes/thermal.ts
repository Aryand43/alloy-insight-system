import { Router } from 'express'
import type {
  ThermalFrameStats,
  ThermalFrameWindow,
  ThermalLayerIndex,
} from '../../../src/domain/types'
import { PUBLIC_BASE_URL } from '../config'
import { calibration } from '../services/calibration'
import { getFrameIndex, type IndexedFrame, type IndexedLayer } from '../services/frameIndex'
import { renderIndexedFrame, statsForIndexedFrame } from '../services/thermal'
import type { CatalogEntry } from '../services/catalog'
import { HttpError, requireBuild, resolveSession, thresholdsFrom } from './helpers'
import { CorruptFrameError } from '../parsers/frame'

export const thermalRouter = Router()

const WINDOW_DEFAULT = 24
const WINDOW_MAX = 64

function requireThermal(entry: CatalogEntry): void {
  if (!entry.hasThermal) {
    throw new HttpError(
      `${entry.id} has no thermal frames. Only builds with both raw Frames/ and Data.dat can run Alloy Insight.`,
      400,
    )
  }
}

function frameUrl(buildId: string, layer: number, pos: number, overlay: boolean): string {
  const base = `${PUBLIC_BASE_URL}/builds/${encodeURIComponent(buildId)}/layers/${layer}/frames/${pos}/thermal.png`
  return overlay ? `${base}?overlay=1` : base
}

function pickLayer(index: { byLayer: Map<number, IndexedLayer> }, raw: string): IndexedLayer {
  const n = Number(raw)
  const layer = Number.isInteger(n) ? index.byLayer.get(n) : undefined
  if (!layer) throw new HttpError(`Layer ${raw} has no thermal frames`, 404)
  return layer
}

function pickFrame(layer: IndexedLayer, raw: string): IndexedFrame {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 0 || n >= layer.frames.length) {
    throw new HttpError(
      `Frame ${raw} out of range for layer ${layer.layer} (0-${layer.frames.length - 1})`,
      404,
    )
  }
  return layer.frames[n]
}

thermalRouter.get('/sessions/:id/thermal/layers', async (req, res) => {
  const { entry, series } = await resolveSession(req.params.id, thresholdsFrom(req))
  requireThermal(entry)
  const index = await getFrameIndex(entry)
  const lut = calibration()

  const body: ThermalLayerIndex = {
    buildId: entry.id,
    meltThresholdC: index.meltThresholdC,
    tempRangeC: [lut[0], lut[lut.length - 1]],
    frameSize: { width: 218, height: 164 },
    totalFrames: index.totalFrames,
    matchedFrames: index.matchedFrames,
    layers: index.layers.map((l) => {
      const point = series.points[l.layer - 1]
      return {
        layer: l.layer,
        zMm: l.zMm,
        frameCount: l.frames.length,
        meanTempC: point?.meanTempC ?? 0,
        meanSizeMm2: point?.meanSizeMm2 ?? 0,
        level: point?.level ?? 'stable',
        profileUrl: `${PUBLIC_BASE_URL}/builds/${encodeURIComponent(entry.id)}/layers/${l.layer}/chart.svg?kind=temp`,
      }
    }),
  }
  res.json(body)
})

thermalRouter.get('/sessions/:id/thermal/layers/:layer/frames', async (req, res) => {
  const { entry } = await resolveSession(req.params.id, thresholdsFrom(req))
  requireThermal(entry)
  const index = await getFrameIndex(entry)
  const layer = pickLayer(index, req.params.layer)

  const rawOffset = Number(req.query.offset)
  const rawLimit = Number(req.query.limit)
  const offset =
    Number.isInteger(rawOffset) && rawOffset > 0
      ? Math.min(rawOffset, Math.max(layer.frames.length - 1, 0))
      : 0
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, WINDOW_MAX)
      : WINDOW_DEFAULT

  const body: ThermalFrameWindow = {
    layer: layer.layer,
    zMm: layer.zMm,
    total: layer.frames.length,
    offset,
    limit,
    frames: layer.frames.slice(offset, offset + limit).map((f) => ({
      position: f.position,
      tMs: f.tMs,
      meltpoolSizePx: f.meltpoolSizePx,
      meltpoolTempC: f.meltpoolTempC,
      imageUrl: frameUrl(entry.id, layer.layer, f.position, true),
      plainUrl: frameUrl(entry.id, layer.layer, f.position, false),
    })),
  }
  res.json(body)
})

thermalRouter.get(
  '/sessions/:id/thermal/layers/:layer/frames/:pos/stats',
  async (req, res) => {
    const { entry } = await resolveSession(req.params.id, thresholdsFrom(req))
    requireThermal(entry)
    const index = await getFrameIndex(entry)
    const layer = pickLayer(index, req.params.layer)
    const frame = pickFrame(layer, req.params.pos)

    try {
      const body: ThermalFrameStats = await statsForIndexedFrame(
        frame,
        index.meltThresholdC,
      )
      res.json(body)
    } catch (err) {
      if (err instanceof CorruptFrameError) throw new HttpError(err.message, 422)
      throw err
    }
  },
)

/** PNG lives under /builds so it is cacheable and shared across sessions. */
thermalRouter.get(
  '/builds/:buildId/layers/:layer/frames/:pos/thermal.png',
  async (req, res) => {
    const entry = await requireBuild(req.params.buildId)
    requireThermal(entry)
    const index = await getFrameIndex(entry)
    const layer = pickLayer(index, req.params.layer)
    const frame = pickFrame(layer, req.params.pos)

    try {
      const png = await renderIndexedFrame(frame, {
        overlay: req.query.overlay === '1',
        showRoi: req.query.roi === '1',
      })
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.type('image/png').send(png)
    } catch (err) {
      if (err instanceof CorruptFrameError) throw new HttpError(err.message, 422)
      throw err
    }
  },
)
