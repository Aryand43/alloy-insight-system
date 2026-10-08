import type { BoundaryPoint, MeltPoolPhysics } from '../../../src/domain/types.js'
import { PIXEL_PITCH_UM } from '../config.js'
import { countToCelsius } from './calibration.js'
import { meltPoolMask, type ThresholdChoice } from './thermal.js'
import type { ThermalFrame } from '../parsers/frame.js'
import type { IndexedFrame } from './frameIndex.js'

/**
 * Melt-pool boundary physics: thermal gradient and solidification rate.
 *
 * Both are measured on the boundary the chosen threshold defines — the
 * operator's threshold when they set one, not the machine's — because that
 * boundary is what the solidification front is taken to be.
 *
 *   G = (T_boundary − T_one_pixel_outward) / pixel pitch      [°C/mm]
 *   R = V · |cos θ|                                           [mm/s]
 *
 * θ is the angle between the outward boundary normal and the direction of
 * travel, and V the deposition speed. R only means anything on the trailing
 * half of the pool, which is where the melt is freezing; at the very back the
 * normal is antiparallel to travel, |cos θ| = 1 and R = V, and at the sides
 * the normal is perpendicular and R falls to zero.
 */

const PITCH_MM = PIXEL_PITCH_UM / 1000

/** Fallback when the log cannot give a local speed, in mm/s (1000 mm/min). */
const NOMINAL_SPEED_MM_PER_S = 1000 / 60

/** 3x3 binomial kernel — smooths the binary mask before differencing it. */
const BLUR = [1, 2, 1, 2, 4, 2, 1, 2, 1].map((v) => v / 16)

/**
 * How many blur passes the mask gets before its gradient is taken.
 *
 * This sets the scale the boundary normal is measured at, and it matters: the
 * segmented edge is ragged at pixel scale, and a single 3x3 pass leaves normals
 * scattered enough that the rear of the pool is not where the maximum
 * solidification rate lands. Twelve passes is roughly a Gaussian of sigma 2.4
 * px, which follows the pool's shape rather than its pixel staircase while
 * staying far smaller than the ~120 px pool.
 */
const BLUR_PASSES = 12

function smoothMask(mask: Uint8Array, width: number, height: number): Float32Array {
  let current = Float32Array.from(mask)
  let next = new Float32Array(width * height)

  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    next.fill(0)
    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        let acc = 0
        let k = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            acc += BLUR[k++] * current[(r + dr) * width + c + dc]
          }
        }
        next[r * width + c] = acc
      }
    }
    const swap = current
    current = next
    next = swap
  }
  return current
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

export interface TravelVector {
  /** Unit direction of travel in the image: dx along columns, dy along rows. */
  dx: number
  dy: number
  speedMmPerS: number
  speedSource: 'measured' | 'nominal'
}

/**
 * Direction and speed of travel at a frame, from the machine's own x/y/t.
 *
 * Taken across the neighbouring frames rather than from a nominal feedrate:
 * the log shows a median of 1000 mm/min on every run in this corpus, and the
 * speed drops at each turnaround, which is exactly where the pool shape
 * changes most.
 */
export function travelAt(frames: IndexedFrame[], index: number): TravelVector {
  const previous = frames[index - 1]
  const next = frames[index + 1] ?? frames[index]
  const from = previous ?? frames[index]
  const to = next

  const dxMm = to.xMm - from.xMm
  const dyMm = to.yMm - from.yMm
  const dtS = (to.tMs - from.tMs) / 1000
  const distance = Math.hypot(dxMm, dyMm)

  if (!distance || dtS <= 0) {
    // Standing still, or a gap in the log: direction is unknown, so fall back
    // to travelling along the coupon's long axis at the nominal speed.
    return { dx: 1, dy: 0, speedMmPerS: NOMINAL_SPEED_MM_PER_S, speedSource: 'nominal' }
  }

  /*
   * Machine x runs along the coupon and maps to image columns; machine y is
   * across the wall. The camera is coaxial, so the image axes follow the
   * machine's, and y is inverted because image rows increase downward.
   */
  return {
    dx: dxMm / distance,
    dy: -dyMm / distance,
    speedMmPerS: distance / dtS,
    speedSource: 'measured',
  }
}

export function boundaryPhysics(
  frame: ThermalFrame,
  threshold: ThresholdChoice,
  travel: TravelVector,
  layer: number,
  position: number,
): MeltPoolPhysics {
  const { width, height, data } = frame
  const mask = meltPoolMask(frame, threshold.count)
  const smooth = smoothMask(mask, width, height)

  // Pool centroid, so boundary coordinates are relative to the pool itself
  // rather than to wherever in the frame it happened to sit.
  let n = 0
  let sumR = 0
  let sumC = 0
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!mask[r * width + c]) continue
      n += 1
      sumR += r
      sumC += c
    }
  }

  const points: BoundaryPoint[] = []
  const gradients: number[] = []
  const rates: number[] = []

  if (n >= 12) {
    const centreR = sumR / n
    const centreC = sumC / n

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const i = r * width + c
        if (!mask[i]) continue
        // Boundary: a mask pixel with at least one 4-neighbour outside.
        const interior =
          mask[i - 1] && mask[i + 1] && mask[i - width] && mask[i + width]
        if (interior) continue

        /*
         * Outward normal. The smoothed mask falls from 1 inside to 0 outside,
         * so its gradient points inward and the outward normal is its
         * negative. Central differences keep it symmetric.
         */
        let normalC = -(smooth[i + 1] - smooth[i - 1]) / 2
        let normalR = -(smooth[i + width] - smooth[i - width]) / 2
        const length = Math.hypot(normalR, normalC)
        if (length < 1e-6) continue
        normalR /= length
        normalC /= length

        // One pixel outward, which is what the gradient is measured over.
        const outR = Math.round(r + normalR)
        const outC = Math.round(c + normalC)
        if (outR < 0 || outR >= height || outC < 0 || outC >= width) continue

        const gradient =
          (countToCelsius(data[i]) - countToCelsius(data[outR * width + outC])) / PITCH_MM

        // θ between the outward normal and travel. Image y is inverted, which
        // travelAt has already accounted for.
        const cosTheta = normalC * travel.dx + -normalR * travel.dy
        const trailing = cosTheta < 0
        const rate = trailing ? travel.speedMmPerS * Math.abs(cosTheta) : null

        points.push({
          xMm: round((c - centreC) * PITCH_MM, 3),
          yMm: round((r - centreR) * PITCH_MM, 3),
          gradientCPerMm: round(gradient, 1),
          thetaDeg: round((Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180) / Math.PI, 1),
          solidificationMmPerS: rate === null ? null : round(rate, 3),
          trailing,
        })
        gradients.push(gradient)
        if (rate !== null) rates.push(rate)
      }
    }
  }

  const sortedG = [...gradients].sort((a, b) => a - b)
  const sortedR = [...rates].sort((a, b) => a - b)
  const medianG = quantile(sortedG, 0.5)
  const medianR = quantile(sortedR, 0.5)

  return {
    layer,
    position,
    thresholdC: threshold.celsius,
    thresholdSource: threshold.source,
    points,
    travel: {
      headingDeg: round((Math.atan2(travel.dy, travel.dx) * 180) / Math.PI, 1),
      speedMmPerS: round(travel.speedMmPerS, 2),
      speedSource: travel.speedSource,
    },
    summary: {
      boundaryPoints: points.length,
      trailingPoints: rates.length,
      gradientMedianCPerMm: round(medianG, 0),
      gradientP10CPerMm: round(quantile(sortedG, 0.1), 0),
      gradientP90CPerMm: round(quantile(sortedG, 0.9), 0),
      gradientNegativePct: gradients.length
        ? round((100 * gradients.filter((g) => g < 0).length) / gradients.length, 1)
        : 0,
      solidificationMedianMmPerS: round(medianR, 2),
      solidificationMaxMmPerS: round(sortedR[sortedR.length - 1] ?? 0, 2),
      // Both ratios are taken at the medians rather than averaged pointwise,
      // so one near-zero R at the pool's side cannot blow G/R up.
      gOverR: medianR > 0.1 ? round(medianG / medianR, 0) : 0,
      coolingRateCPerS: round(medianG * medianR, 0),
    },
  }
}
