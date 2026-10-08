import { Router } from 'express'
import type {
  AnalysisSession,
  AnomalyReport,
  BuildBrief,
  Frame,
  MeshPayload,
  ThresholdOverlay,
  QueryAnswer,
  ThresholdStats,
  ThreeColorPayload,
} from '../../../src/domain/types.js'
import {
  buildReconstruction,
  buildStats,
  buildThreeColor,
  buildThreshold,
} from '../services/analysis.js'
import { buildAnomalyReport, layerFrameAnomalies } from '../services/anomaly.js'
import { frameReference } from '../services/anomalyFeatures.js'
import { buildBrief } from '../services/brief.js'
import { buildFrames, kivSizeUrl, kivTempUrl } from '../services/frames.js'
import { getFrameIndex } from '../services/frameIndex.js'
import { answerQuestion, QueryUnavailableError } from '../services/queryAssistant.js'
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
  const report = buildAnomalyReport(series)

  /*
   * For builds with frame data, narrow each flagged layer to the part of the
   * pass that actually deviated. This needs only the logged melt-pool values
   * already in the frame index — no frame files are read — so it stays cheap
   * enough to do on every request.
   */
  let flaggedFrameX: Map<number, number[]> | undefined
  if (entry.hasThermal && report.anomalies.length) {
    try {
      const index = await getFrameIndex(entry)
      const reference = frameReference(index.layers, report.transition.endLayer)
      flaggedFrameX = new Map()
      for (const a of report.anomalies) {
        const layer = index.byLayer.get(a.layer)
        if (!layer) continue
        const detail = layerFrameAnomalies(layer, reference)
        if (detail.anomalies.length) {
          flaggedFrameX.set(a.layer, detail.anomalies.map((f) => f.xMm))
        }
      }
    } catch (err) {
      // Without frame detail the wall still colours by layer.
      console.warn(`[three-color] frame detail failed for ${entry.id}: ${String(err)}`)
    }
  }

  const body: ThreeColorPayload = buildThreeColor(entry, series, report, flaggedFrameX)
  res.json(body)
})

sessionsRouter.get('/sessions/:id/stats', async (req, res) => {
  const { series } = await resolveSession(req.params.id, thresholdsFrom(req))
  const body: ThresholdStats = buildStats(series)
  res.json(body)
})

/**
 * Anomaly detection for the whole build.
 *
 * Available in both modes and for all 26 builds: it needs only the per-layer
 * spreadsheets, not thermal frames.
 */
sessionsRouter.get('/sessions/:id/anomalies', async (req, res) => {
  const { series } = await resolveSession(req.params.id, thresholdsFrom(req))
  const body: AnomalyReport = buildAnomalyReport(series)
  res.json(body)
})

/** What was built, on what machine, and what the analysis found. */
sessionsRouter.get('/sessions/:id/brief', async (req, res) => {
  const { entry, series, session } = await resolveSession(
    req.params.id,
    thresholdsFrom(req),
  )
  const report = buildAnomalyReport(series)

  // Frame count comes from the index, which only exists for thermal builds.
  let monitoringFrames = 0
  if (entry.hasThermal) {
    try {
      monitoringFrames = (await getFrameIndex(entry)).matchedFrames
    } catch (err) {
      console.warn(`[brief] frame index failed for ${entry.id}: ${String(err)}`)
    }
  }

  const body: BuildBrief = await buildBrief(
    entry,
    session.config,
    report,
    monitoringFrames,
  )
  res.json(body)
})

/**
 * Natural-language questions over the dataset.
 *
 * POST because the question is request content, not a cache key — and so it
 * never lands in a URL, a log line or a browser history entry.
 */
sessionsRouter.post('/sessions/:id/query', async (req, res) => {
  const { entry, session } = await resolveSession(req.params.id, thresholdsFrom(req))
  const { question, history } = req.body ?? {}

  if (typeof question !== 'string') {
    throw new HttpError('Request body must be { question: string }', 400)
  }

  try {
    const body: QueryAnswer = await answerQuestion(
      entry,
      session.config,
      question,
      history,
    )
    res.json(body)
  } catch (err) {
    if (err instanceof QueryUnavailableError) {
      // 422: the message is written for the screen.
      throw new HttpError(err.message, 422)
    }
    throw err
  }
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
