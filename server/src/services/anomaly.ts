import type {
  AnomalyEvent,
  AnomalyReport,
  AnomalySeverity,
  FrameAnomaly,
  LayerAnomaly,
  LayerFrameAnomalies,
} from '../../../src/domain/types.js'
import { FRAME_MODEL, LAYER_MODEL, MODEL_META } from '../models/anomalyModel.js'
import { score, type GaussianModel } from './mahalanobis.js'
import {
  frameFeatures,
  layerFeatures,
  transitionRegion,
} from './anomalyFeatures.js'
import type { FrameReference } from './anomalyFeatures.js'
import type { IndexedLayer } from './frameIndex.js'
import type { LayerSeries } from './layers.js'

function severityFor(value: number, model: GaussianModel): AnomalySeverity | null {
  if (value > model.alertThreshold) return 'alert'
  if (value > model.watchThreshold) return 'watch'
  return null
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function describe(event: Omit<AnomalyEvent, 'summary'>, drift: number): string {
  const span =
    event.onsetLayer === event.endLayer
      ? `Layer ${event.onsetLayer}`
      : `Layers ${event.onsetLayer}-${event.endLayer}`
  const direction = drift >= 0 ? 'above' : 'below'
  return `${span}: ${Math.abs(drift).toFixed(1)}% ${direction} the build's steady state, from z ${event.onsetZMm.toFixed(1)} mm.`
}

/**
 * Scores every layer past the ramp-up and groups the flags into events.
 *
 * Only the layer-level model is quality-correlated: held out by coupon family,
 * it flags 0-3.8% of layers in the coupons Desmond ranked best and 2.3-75.6%
 * in the ones he ranked worst. The 10-pass worst coupon is the weak case, at
 * ~7%, which overlaps the best range — so a low flag rate is not proof of a
 * good part, and the UI says so.
 */
export function buildAnomalyReport(series: LayerSeries): AnomalyReport {
  const f = layerFeatures(series)
  const points = series.points
  const n = points.length

  const transition = transitionRegion(series, f.transition)

  const anomalies: LayerAnomaly[] = []
  let scored = 0
  for (let i = f.transition; i < n; i++) {
    scored += 1
    const value = score(LAYER_MODEL, f.vectors[i])
    const severity = severityFor(value, LAYER_MODEL)
    if (!severity) continue
    anomalies.push({
      layer: points[i].layer,
      zMm: round(points[i].zMm),
      score: round(value),
      severity,
      meanTempC: round(points[i].meanTempC),
      tempDriftPct: round(f.driftTempPct[i]),
      sizeDriftPct: round(f.driftSizePct[i]),
    })
  }

  // Consecutive flagged layers are one event: a drift that lasts five layers
  // is one process excursion, not five independent findings.
  const events: AnomalyEvent[] = []
  for (const a of anomalies) {
    const last = events[events.length - 1]
    if (last && a.layer === last.endLayer + 1) {
      last.endLayer = a.layer
      if (a.score > last.peakScore) {
        last.peakScore = a.score
        last.peakLayer = a.layer
      }
      if (a.severity === 'alert') last.severity = 'alert'
      continue
    }
    events.push({
      onsetLayer: a.layer,
      endLayer: a.layer,
      onsetZMm: a.zMm,
      peakLayer: a.layer,
      peakScore: a.score,
      severity: a.severity,
      summary: '',
    })
  }
  for (const e of events) {
    const peak = anomalies.find((a) => a.layer === e.peakLayer)
    e.summary = describe(e, peak?.tempDriftPct ?? 0)
  }

  const alerts = anomalies.filter((a) => a.severity === 'alert')
  const flaggedPct = scored ? (100 * alerts.length) / scored : 0
  const watchPct = scored ? (100 * (anomalies.length - alerts.length)) / scored : 0

  // A single flagged layer is a point to check, not a failing build. It takes
  // either a sustained excursion — two consecutive flagged layers — or a
  // flagged share above the rate the best-ranked coupons show.
  const sustained = events.some(
    (e) => alerts.filter((a) => a.layer >= e.onsetLayer && a.layer <= e.endLayer).length >= 2,
  )

  let verdict: AnomalyReport['verdict'] = 'clean'
  if (flaggedPct >= 5 || sustained) verdict = 'alert'
  else if (alerts.length || watchPct >= 15) verdict = 'watch'

  return {
    buildId: series.buildId,
    model: {
      name: MODEL_META.name,
      trainedOn: MODEL_META.layerTrainedOn,
      validation: MODEL_META.layerValidation,
      alertThreshold: round(LAYER_MODEL.alertThreshold),
      watchThreshold: round(LAYER_MODEL.watchThreshold),
    },
    transition,
    layersAnalysed: n,
    layersScored: scored,
    anomalies,
    events,
    flaggedPct: round(flaggedPct, 1),
    verdict,
  }
}

/**
 * Where inside one layer the melt pool left the build's steady state.
 *
 * This answers "where did consistency break down", in machine XYZ. It is not
 * a quality predictor: measured across the seven runs with frame data, the
 * flag rate is ~1% whether the coupon was ranked best or worst, so the note
 * travels with the payload.
 */
export function layerFrameAnomalies(
  layer: IndexedLayer,
  ref: FrameReference,
): LayerFrameAnomalies {
  const vectors = frameFeatures(layer.frames, ref)
  const scores = vectors.map((v) => round(score(FRAME_MODEL, v), 2))

  const anomalies: FrameAnomaly[] = []
  layer.frames.forEach((fr, i) => {
    const severity = severityFor(scores[i], FRAME_MODEL)
    if (severity !== 'alert') return
    anomalies.push({
      position: fr.position,
      tMs: fr.tMs,
      score: scores[i],
      severity,
      xMm: round(fr.xMm, 2),
      yMm: round(fr.yMm, 2),
      zMm: round(fr.zMm, 2),
      sizeDriftPct: round(vectors[i][0]),
      tempDriftPct: round(vectors[i][1]),
    })
  })

  const worst = anomalies.reduce<FrameAnomaly | null>(
    (best, a) => (!best || a.score > best.score ? a : best),
    null,
  )

  return {
    layer: layer.layer,
    zMm: round(layer.zMm),
    frameCount: layer.frames.length,
    anomalies,
    flaggedPct: layer.frames.length
      ? round((100 * anomalies.length) / layer.frames.length, 1)
      : 0,
    scores,
    alertThreshold: round(FRAME_MODEL.alertThreshold),
    worst,
    note: MODEL_META.frameValidation,
  }
}
