import { Router } from 'express'
import type {
  ThermalFrameStats,
  ThermalFrameWindow,
  ThermalLayerIndex,
} from '../../../src/domain/types.js'
import { PUBLIC_BASE_URL } from '../config.js'
import { calibration } from '../services/calibration.js'
import { getFrameIndex, type IndexedFrame, type IndexedLayer } from '../services/frameIndex.js'
import {
  loadFrame,
  renderIndexedFrame,
  statsForIndexedFrame,
} from '../services/thermal.js'
import type { CatalogEntry } from '../services/catalog.js'
import { HttpError, requireBuild, resolveSession, thresholdsFrom } from './helpers.js'
import { CorruptFrameError } from '../parsers/frame.js'

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
    frameSize: await (async () => {
      // Derive rather than hardcode — readFrame infers dimensions per file.
      const first = index.layers[0]?.frames[0]
      if (!first) return { width: 0, height: 0 }
      try {
        const f = await loadFrame(first.file)
        return { width: f.width, height: f.height }
      } catch {
        return { width: 0, height: 0 }
      }
    })(),
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
      if (err instanceof CorruptFrameError) {
        console.warn(`[thermal] unreadable frame ${err.detail}`)
        throw new HttpError(err.message, 422)
      }
      throw err
    }
  },
)

/** The calibration table, so the client can turn raw counts into °C itself. */
thermalRouter.get('/calibration', (_req, res) => {
  const lut = calibration()
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.json({
    minC: lut[0],
    maxC: lut[lut.length - 1],
    /** 4096 entries: index is the raw 12-bit count, value is °C. */
    celsius: Array.from(lut),
  })
})

/**
 * Raw temperature field for one frame, as Uint16LE camera counts.
 *
 * Sent as binary rather than JSON: the full field is 71.5 KB raw against
 * roughly 200 KB of JSON, and the client needs a typed array anyway to feed
 * vertex buffers. `stride` decimates for the 3D views — stride 2 gives
 * 82 x 109 (~12.5 KB) which is ample relief and sustains 10 Hz playback.
 */
thermalRouter.get(
  '/builds/:buildId/layers/:layer/frames/:pos/field.bin',
  async (req, res) => {
    const entry = await requireBuild(req.params.buildId)
    requireThermal(entry)
    const index = await getFrameIndex(entry)
    const layer = pickLayer(index, req.params.layer)
    const ref = pickFrame(layer, req.params.pos)

    const rawStride = Number(req.query.stride)
    const stride =
      Number.isInteger(rawStride) && rawStride >= 1 && rawStride <= 8
        ? rawStride
        : 1

    try {
      const frame = await loadFrame(ref.file)
      const cols = Math.ceil(frame.width / stride)
      const rows = Math.ceil(frame.height / stride)

      const out = new Uint16Array(cols * rows)
      let w = 0
      for (let r = 0; r < frame.height; r += stride) {
        for (let c = 0; c < frame.width; c += stride) {
          out[w++] = frame.data[r * frame.width + c]
        }
      }

      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('X-Frame-Width', String(cols))
      res.setHeader('X-Frame-Height', String(rows))
      res.setHeader('X-Frame-Stride', String(stride))
      res.type('application/octet-stream').send(Buffer.from(out.buffer))
    } catch (err) {
      if (err instanceof CorruptFrameError) {
        console.warn(`[thermal] unreadable frame ${err.detail}`)
        throw new HttpError(err.message, 422)
      }
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
      if (err instanceof CorruptFrameError) {
        console.warn(`[thermal] unreadable frame ${err.detail}`)
        throw new HttpError(err.message, 422)
      }
      throw err
    }
  },
)
