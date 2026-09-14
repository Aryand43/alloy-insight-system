import { Router } from 'express'
import type {
  AnalysisSession,
  Frame,
  MeshPayload,
  ThresholdOverlay,
  ThresholdStats,
  ThreeColorPayload,
} from '../../../src/domain/types.js'
import {
  buildReconstruction,
  buildStats,
  buildThreeColor,
  buildThreshold,
} from '../services/analysis.js'
import { buildFrames, kivSizeUrl, kivTempUrl } from '../services/frames.js'
import { getLayerSeries, layerFromFrameId } from '../services/layers.js'
import { createSession } from '../services/sessions.js'
import { HttpError, requireBuild, resolveSession, thresholdsFrom } from './helpers.js'

export const sessionsRouter = Router()

/** POST /sessions — body { config } */
sessionsRouter.post('/sessions', async (req, res) => {
  const config = (req.body ?? {}).config
  if (!config || typeof config !== 'object') {
    throw new HttpError('Request body must be { config: SessionConfig }', 400)
  }

  const sampleId = typeof config.sampleId === 'string' ? config.sampleId.trim() : ''
  if (!sampleId) {
    throw new HttpError(
      'config.sampleId is required — pick a build from GET /catalog',
      400,
    )
  }

  const entry = await requireBuild(sampleId)

  // Don't trust the UI alone to gate this.
  if (config.mode === 'alloy' && !entry.hasThermal) {
    throw new HttpError(
      `${entry.id} has no thermal frames, so Alloy Insight cannot run on it.`,
      400,
    )
  }

  const session: AnalysisSession = createSession(entry, config)
  res.status(201).json(session)
})

sessionsRouter.get('/sessions/:id', async (req, res) => {
  const { session } = await resolveSession(req.params.id, thresholdsFrom(req))
  const body: AnalysisSession = session
  res.json(body)
})

sessionsRouter.get('/sessions/:id/frames', async (req, res) => {
  const { entry, series } = await resolveSession(req.params.id, thresholdsFrom(req))
  const body: Frame[] = buildFrames(entry, series)
  res.json(body)
})

sessionsRouter.get('/sessions/:id/threshold/:frameId', async (req, res) => {
  const { entry, series } = await resolveSession(req.params.id, thresholdsFrom(req))

  const layer = layerFromFrameId(req.params.frameId, series.points.length)
  if (layer === null) {
    throw new HttpError(
      `Frame ${req.params.frameId} is not a layer of ${entry.id} (1-${series.points.length})`,
      404,
    )
  }

  const point = series.points[layer - 1]
  const body: ThresholdOverlay = buildThreshold(series, req.params.frameId, point, {
    tempUrl: entry.hasKivImages ? kivTempUrl(entry.id, layer) : undefined,
    sizeUrl: entry.kivSizeDir ? kivSizeUrl(entry.id, layer) : undefined,
  })
  res.json(body)
})

sessionsRouter.get('/sessions/:id/reconstruction', async (req, res) => {
  const { entry, series } = await resolveSession(req.params.id, thresholdsFrom(req))
  const raw = Number(req.query.thicknessExaggeration)
  const exaggeration = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 20) : 1
  const body: MeshPayload = buildReconstruction(entry, series, exaggeration)
  res.json(body)
})

sessionsRouter.get('/sessions/:id/three-color', async (req, res) => {
  const { entry, series } = await resolveSession(req.params.id, thresholdsFrom(req))
  const body: ThreeColorPayload = buildThreeColor(entry, series)
  res.json(body)
})

sessionsRouter.get('/sessions/:id/stats', async (req, res) => {
  const { series } = await resolveSession(req.params.id, thresholdsFrom(req))
  const body: ThresholdStats = buildStats(series)
  res.json(body)
})

/** Layer detail for a build, independent of any session — handy for debugging. */
sessionsRouter.get('/builds/:buildId/layers', async (req, res) => {
  const entry = await requireBuild(req.params.buildId)
  const series = await getLayerSeries(entry, thresholdsFrom(req))
  res.json({
    buildId: series.buildId,
    referenceTempC: series.referenceTempC,
    referenceSizeMm2: series.referenceSizeMm2,
    thresholds: series.thresholds,
    points: series.points,
  })
})
