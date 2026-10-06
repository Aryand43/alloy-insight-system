import type { TransitionRegion } from '../../../src/domain/types.js'
import { median } from './mahalanobis.js'
import type { IndexedFrame, IndexedLayer } from './frameIndex.js'
import type { LayerSeries } from './layers.js'

/**
 * Minimum layer-over-layer temperature rise, as a percent of steady state,
 * that still counts as ramping up. Measured across all 26 builds the ramp
 * ends between layer 3 and layer 11 at this value — the first ~5 mm of
 * height — and no build has it swallow more than a sixth of the stack.
 */
const RAMP_SLOPE_PCT = 0.3
/** Window the slope is averaged over, so one flat layer does not end the ramp. */
const RAMP_WINDOW = 3

export const LAYER_FEATURES = [
  'tempDriftPct',
  'sizeDriftPct',
  'tempJumpPct',
  'sizeJumpPct',
  'tempCurvature',
]

export const FRAME_FEATURES = ['sizeDriftPct', 'tempDriftPct', 'roughnessPct']

/**
 * Length of the ramp-up region, in layers.
 *
 * Every build starts cold and climbs: layer 1 sits ~190 °C below the steady
 * state it settles at. Scoring those layers against steady state would flag
 * the start of every build, so they are classified as a transition region
 * instead. The boundary is where the climb stops, not a fixed layer count —
 * builds reach steady state at different rates.
 */
export function transitionLayers(temps: number[]): number {
  const n = temps.length
  if (n < 4) return 0
  const steady = median(temps.slice(Math.floor(n / 2)))
  if (!steady) return 0

  const deltas: number[] = []
  for (let i = 1; i < n; i++) deltas.push((100 * (temps[i] - temps[i - 1])) / steady)

  // Never claim more than half the build, however the temperature behaves.
  const limit = Math.min(deltas.length, Math.floor(n / 2))
  let k = 0
  for (let i = 0; i < limit; i++) {
    const window = deltas.slice(i, i + RAMP_WINDOW)
    const avg = window.reduce((a, b) => a + b, 0) / window.length
    if (avg < RAMP_SLOPE_PCT) {
      k = i
      break
    }
    k = i + 1
  }
  return k
}

export interface LayerFeatures {
  /** Layers 1..transition are the ramp-up. */
  transition: number
  /** Post-transition medians — what "normal" means for this build. */
  referenceTempC: number
  referenceSizeMm2: number
  /** One feature vector per layer, in layer order. */
  vectors: number[][]
  driftTempPct: number[]
  driftSizePct: number[]
}

/**
 * Per-layer features, referenced to the build's own steady state.
 *
 * Deliberately relative: absolute temperature differs between pass counts and
 * geometries, so a model trained on absolute values would only recognise the
 * coupons it was trained on.
 */
export function layerFeatures(series: LayerSeries): LayerFeatures {
  const temps = series.points.map((p) => p.meanTempC)
  const sizes = series.points.map((p) => p.meanSizeMm2)
  const n = temps.length
  const transition = transitionLayers(temps)

  const tail = (values: number[]) =>
    median(transition < n ? values.slice(transition) : values)
  const referenceTempC = tail(temps)
  const referenceSizeMm2 = tail(sizes)

  const driftTempPct = temps.map((v) => (100 * (v - referenceTempC)) / (referenceTempC || 1))
  const driftSizePct = sizes.map((v) => (100 * (v - referenceSizeMm2)) / (referenceSizeMm2 || 1))

  const vectors = temps.map((_, i) => {
    const jumpTemp = i > 0 ? driftTempPct[i] - driftTempPct[i - 1] : 0
    const jumpSize = i > 0 ? driftSizePct[i] - driftSizePct[i - 1] : 0
    const curvature =
      i > 0 && i < n - 1
        ? Math.abs(driftTempPct[i + 1] - 2 * driftTempPct[i] + driftTempPct[i - 1])
        : 0
    return [driftTempPct[i], driftSizePct[i], jumpTemp, jumpSize, curvature]
  })

  return { transition, referenceTempC, referenceSizeMm2, vectors, driftTempPct, driftSizePct }
}

/* ------------------------------------------------------- frame level -- */

/** Moving average over a window centred on each sample. */
function smooth(values: number[], window: number): number[] {
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    let sum = 0
    let count = 0
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= values.length) continue
      sum += values[j]
      count += 1
    }
    return count ? sum / count : 0
  })
}

export interface FrameReference {
  sizePx: number
  tempC: number
}

/**
 * The build's steady-state melt pool, from the frames of its post-transition
 * layers. Frames are referenced to this rather than to their own layer's
 * median — against a layer median, a layer that is uniformly wrong looks
 * perfectly consistent.
 */
export function frameReference(layers: IndexedLayer[], transition: number): FrameReference {
  const sizes: number[] = []
  const temps: number[] = []
  for (const l of layers) {
    if (l.layer <= transition) continue
    for (const fr of l.frames) {
      sizes.push(fr.meltpoolSizePx)
      temps.push(fr.meltpoolTempC)
    }
  }
  return { sizePx: median(sizes), tempC: median(temps) }
}

export function frameFeatures(frames: IndexedFrame[], ref: FrameReference): number[][] {
  const driftSize = frames.map((f) => (100 * (f.meltpoolSizePx - ref.sizePx)) / (ref.sizePx || 1))
  const driftTemp = frames.map((f) => (100 * (f.meltpoolTempC - ref.tempC)) / (ref.tempC || 1))
  const trend = smooth(driftSize, 5)
  return frames.map((_, i) => [driftSize[i], driftTemp[i], Math.abs(driftSize[i] - trend[i])])
}


/** The ramp-up, described for display. */
export function transitionRegion(series: LayerSeries, transition: number): TransitionRegion {
  const points = series.points
  const last = points[Math.max(transition - 1, 0)]
  const r = (n: number) => Math.round(n * 100) / 100
  return {
    endLayer: transition,
    startTempC: r(points[0]?.meanTempC ?? 0),
    endTempC: r(last?.meanTempC ?? 0),
    endZMm: r(last?.zMm ?? 0),
  }
}
