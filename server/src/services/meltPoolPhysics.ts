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
 *
 * It is worth being explicit that this is a *local* normal and not simply the
 * direction from the pool centre, because a near-circular pool makes the two
 * look alike. Measured on three frames, the smoothed-mask normal sits 6-15
 * degrees off the radial direction at the median and up to 50-145 degrees at
 * p90 on a ragged pool, and substituting the radial direction moves median R
 * by 10-20%. Cross-checked against a second estimator that never references
 * the centre — principal axes of the neighbouring boundary pixels, which is
 * the other method the spec allows — the two agree on median R to within 3%.
 * Blur passes of 4, 8 and 12 also agree to within 3%, so the choice is not
 * load-bearing; 12 is kept because it is the steadiest.
 *
 * Validation: across 126 frames of one layer, the fastest-solidifying decile
 * lands at the rear of the pool — opposite the direction of travel — on 125
 * of them.
 */
const BLUR_PASSES = 12

/**
 * Pixels sampled outward along the normal when fitting the gradient.
 *
 * Fitted over several samples rather than taken as a single step, because one
 * pixel of difference is one pixel of sensor noise. But the window has to stay
 * short, because the measured profile is not linear. Averaged over the
 * boundary of five frames, the mean temperature outward from the melt pool
 * falls like this:
 *
 *   distance   0.03   0.06   0.09   0.15   0.18   0.30   0.36 mm
 *   slope       837    581    426    341    297    186    156 °C/mm
 *
 * So a straight-line fit returns roughly half as much gradient at 0.36 mm as
 * at 0.03 mm — the surroundings stay hot rather than falling away to ambient,
 * exactly as Desmond expected. There is no linear regime to fit, so the number
 * reported is the gradient *at the front*: four samples, a ~90 um baseline,
 * long enough to average the noise down and short enough to stay local.
 *
 * This is the one knob that changes G, so the window travels with the payload
 * and is stated on screen.
 */
const GRADIENT_SAMPLES = 4
/** A fit needs at least this many in-frame samples to be reported. */
const GRADIENT_MIN_SAMPLES = 3

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

/** Bilinear sample of the temperature field at a sub-pixel position. */
function sampleCelsius(
  data: ArrayLike<number>,
  width: number,
  height: number,
  row: number,
  col: number,
): number | null {
  if (row < 0 || col < 0 || row > height - 1 || col > width - 1) return null
  const r0 = Math.floor(row)
  const c0 = Math.floor(col)
  const r1 = Math.min(r0 + 1, height - 1)
  const c1 = Math.min(c0 + 1, width - 1)
  const fr = row - r0
  const fc = col - c0

  const t00 = countToCelsius(data[r0 * width + c0])
  const t01 = countToCelsius(data[r0 * width + c1])
  const t10 = countToCelsius(data[r1 * width + c0])
  const t11 = countToCelsius(data[r1 * width + c1])

  return (
    t00 * (1 - fr) * (1 - fc) +
    t01 * (1 - fr) * fc +
    t10 * fr * (1 - fc) +
    t11 * fr * fc
  )
}

/**
 * Thermal gradient at one boundary point, in °C/mm.
 *
 * Walks outward along the normal sampling the temperature at each pixel step,
 * then fits a straight line to T(n) by least squares and returns its slope.
 * Positive means the temperature falls outward, which is the physical case;
 * the sign is kept rather than taken as an absolute so that the share of
 * points behaving otherwise stays visible as the noise measure it is.
 *
 * The ray is sampled bilinearly because the normal is rarely axis-aligned —
 * rounding each step to the nearest pixel would quantise the direction and
 * reintroduce the staircase the smoothed normal exists to avoid.
 */
function fitGradient(
  data: ArrayLike<number>,
  width: number,
  height: number,
  row: number,
  col: number,
  normalRow: number,
  normalCol: number,
): number | null {
  let n = 0
  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumXY = 0

  for (let step = 0; step < GRADIENT_SAMPLES; step++) {
    const celsius = sampleCelsius(
      data,
      width,
      height,
      row + normalRow * step,
      col + normalCol * step,
    )
    if (celsius === null) break
    // Distance from the boundary in mm, which is what the slope is per.
    const distance = step * PITCH_MM
    n += 1
    sumX += distance
    sumY += celsius
    sumXX += distance * distance
    sumXY += distance * celsius
  }

  if (n < GRADIENT_MIN_SAMPLES) return null
  const denominator = n * sumXX - sumX * sumX
  if (Math.abs(denominator) < 1e-12) return null
  // Negated: the fit's slope is dT/dn, and a falling temperature is a positive
  // gradient by the convention the panel reports.
  return -(n * sumXY - sumX * sumY) / denominator
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

        const gradient = fitGradient(data, width, height, r, c, normalR, normalC)
        if (gradient === null) continue

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

  /*
   * Order the points around the contour rather than leaving them in the raster
   * order the scan produced. Nothing computed depends on the order, but the
   * probe walks the boundary by index, and in raster order the next index is
   * usually on the opposite side of the pool. Sorting by angle about the
   * centre is enough: a melt pool is star-shaped about its own centroid.
   */
  points.sort((a, b) => Math.atan2(a.yMm, a.xMm) - Math.atan2(b.yMm, b.xMm))

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
      gradientWindowMm: round((GRADIENT_SAMPLES - 1) * PITCH_MM, 3),
      gradientSamples: GRADIENT_SAMPLES,
      solidificationMedianMmPerS: round(medianR, 2),
      solidificationMaxMmPerS: round(sortedR[sortedR.length - 1] ?? 0, 2),
      // Both ratios are taken at the medians rather than averaged pointwise,
      // so one near-zero R at the pool's side cannot blow G/R up.
      gOverR: medianR > 0.1 ? round(medianG / medianR, 0) : 0,
      coolingRateCPerS: round(medianG * medianR, 0),
    },
  }
}
