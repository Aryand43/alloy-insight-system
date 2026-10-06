import type { Request } from 'express'
import { calibration } from '../services/calibration.js'
import { getBuild, type CatalogEntry } from '../services/catalog.js'
import {
  DEFAULT_THRESHOLDS,
  getLayerSeries,
  type LayerSeries,
  type Thresholds,
} from '../services/layers.js'
import { buildIdFromSessionId, getStoredSession, reviveSession } from '../services/sessions.js'
import type { AnalysisSession } from '../../../src/domain/types.js'

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function numParam(raw: unknown, fallback: number): number {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Thresholds are overridable per request so the bands stay tunable, not baked in. */
export function thresholdsFrom(req: Request): Thresholds {
  const q = req.query
  return {
    tempStablePct: numParam(q.tempStable, DEFAULT_THRESHOLDS.tempStablePct),
    tempTransitionPct: numParam(q.tempTransition, DEFAULT_THRESHOLDS.tempTransitionPct),
    sizeStablePct: numParam(q.sizeStable, DEFAULT_THRESHOLDS.sizeStablePct),
    sizeTransitionPct: numParam(q.sizeTransition, DEFAULT_THRESHOLDS.sizeTransitionPct),
  }
}

/**
 * The segmentation threshold the operator set in setup, in °C.
 *
 * Travels as a query parameter rather than being read from the stored session
 * because sessions are revived from their id after a restart — a threshold
 * held only in memory would silently revert to the machine's.
 *
 * Bounded by the camera calibration: outside 980-2008 °C the LUT cannot
 * express the threshold at all, so the request is rejected rather than
 * quietly clamped.
 */
export function meltThresholdFrom(req: Request): number | null {
  const raw = req.query.thresholdC
  if (raw === undefined) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) {
    throw new HttpError('thresholdC must be a temperature in °C', 400)
  }
  const lut = calibration()
  const min = lut[0]
  const max = lut[lut.length - 1]
  if (n < min || n > max) {
    throw new HttpError(
      `A threshold of ${n} °C is outside what this camera can measure (${min.toFixed(0)}-${max.toFixed(0)} °C).`,
      400,
    )
  }
  return n
}

export async function requireBuild(id: string): Promise<CatalogEntry> {
  const entry = await getBuild(id)
  if (!entry) throw new HttpError(`Unknown build: ${id}`, 404)
  return entry
}

export interface ResolvedSession {
  session: AnalysisSession
  entry: CatalogEntry
  series: LayerSeries
}

/**
 * Resolves a session id to its build and layer data, reviving sessions the
 * in-memory store has lost (server restart, shared link) from the build id
 * embedded in the session id.
 */
export async function resolveSession(
  sessionId: string,
  thresholds: Thresholds,
): Promise<ResolvedSession> {
  const stored = getStoredSession(sessionId)
  const buildId = stored?.config.sampleId ?? buildIdFromSessionId(sessionId)

  if (!buildId) {
    throw new HttpError(
      `Unknown session: ${sessionId}. Start a new analysis from the setup screen.`,
      404,
    )
  }

  const entry = await requireBuild(buildId)
  const session = stored ?? reviveSession(sessionId, entry)
  const series = await getLayerSeries(entry, thresholds)
  return { session, entry, series }
}
