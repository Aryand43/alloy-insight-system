import { PIXEL_PITCH_UM, ROI_CENTER_COL, ROI_CENTER_ROW, ROI_RADIUS } from '../config.js'
import type { MeltPoolDimensions } from '../../../src/domain/types.js'
import { calibration, countToCelsius } from './calibration.js'
import { rampTableForCounts } from './colormap.js'
import { encodePng } from './png.js'
import { readFrame, type ThermalFrame } from '../parsers/frame.js'
import type { IndexedFrame } from './frameIndex.js'

/**
 * Melt-pool overlay styling.
 *
 * The contour is CYAN, not red. Now that the colour map runs pale-yellow (cool)
 * to deep red (hot), the molten region is already red — a red contour drawn on
 * it would be invisible. Cyan sits outside the ramp's warm hues entirely, so it
 * reads as an annotation rather than as a temperature.
 *
 * The fill tint is also gone: tinting the interior would corrupt the very
 * temperatures this panel exists to show. Shubham's intent — "the hot region
 * should look red" — is now carried by the colour map itself.
 */
const BOUNDARY_RGB: [number, number, number] = [34, 231, 238]
const BOUNDARY_HALO: [number, number, number] = [8, 60, 70]
const ROI_RGB: [number, number, number] = [90, 110, 130]

let rampTable: Uint8Array | null = null

export interface FrameStats {
  /** Pixels above the melt threshold inside the evaluated region. */
  maskPixels: number
  meanTempC: number
  maxTempC: number
  /** What the machine logged for the matched row, for comparison. */
  loggedSizePx: number
  loggedTempC: number
  thresholdCount: number
  thresholdC: number
  thresholdSource: 'machine' | 'user'
  dimensions: MeltPoolDimensions | null
}

/** Steady-state pool the current frame's dimensions are compared against. */
export interface PoolReference {
  lengthMm: number
  widthMm: number
}

export interface ThresholdChoice {
  /** Raw camera count the mask is cut at. */
  count: number
  /** The same threshold in °C, for labelling. */
  celsius: number
  source: 'machine' | 'user'
}

function inRoi(row: number, col: number): boolean {
  const dr = row - ROI_CENTER_ROW
  const dc = col - ROI_CENTER_COL
  return dr * dr + dc * dc <= ROI_RADIUS * ROI_RADIUS
}

/**
 * Melt-pool mask: raw count above the controller's threshold, inside the
 * circular region it evaluates.
 *
 * The ROI matters. Measured over three builds, this reproduces the machine's
 * logged `meltpoolSize` at a ratio of 0.995-1.001 (sd <= 0.017); counting the
 * whole frame instead overshoots by 17-31%.
 *
 * Note the axes: the header's FilterCenterX indexes the ROW and FilterCenterY
 * the COLUMN. The other orientation lands at ~0.81 and is much noisier.
 */
export function meltPoolMask(frame: ThermalFrame, thresholdCount: number): Uint8Array {
  const { width, height, data } = frame
  const mask = new Uint8Array(width * height)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c
      if (data[i] > thresholdCount && inRoi(r, c)) mask[i] = 1
    }
  }
  return mask
}

/**
 * Width and length of the segmented pool, measured rather than inferred.
 *
 * Area alone cannot give both: the old equivalent-diameter estimate assumed a
 * circle. Here the mask's own orientation is recovered from the second moments
 * of its pixels, and the pool is then measured end to end along its long and
 * short axes. `length` is the long axis, which runs with the direction of
 * travel, and `width` the short one across the bead.
 */
export function meltPoolDimensions(
  mask: Uint8Array,
  width: number,
  height: number,
  reference?: PoolReference | null,
): MeltPoolDimensions | null {
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
  // Below this the second moments are dominated by single pixels.
  if (n < 12) return null

  const mr = sumR / n
  const mc = sumC / n
  let srr = 0
  let scc = 0
  let src = 0
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!mask[r * width + c]) continue
      const dr = r - mr
      const dc = c - mc
      srr += dr * dr
      scc += dc * dc
      src += dr * dc
    }
  }
  srr /= n
  scc /= n
  src /= n

  // Principal axes of a symmetric 2x2 covariance, in closed form.
  const mid = (srr + scc) / 2
  const diff = Math.sqrt(((srr - scc) / 2) ** 2 + src * src)
  const major = { value: mid + diff }
  // Eigenvector for the larger eigenvalue, as (row, col).
  let vr: number
  let vc: number
  if (Math.abs(src) > 1e-9) {
    vr = major.value - scc
    vc = src
  } else {
    // Axis-aligned: pick whichever axis carries more spread.
    vr = srr >= scc ? 1 : 0
    vc = srr >= scc ? 0 : 1
  }
  const norm = Math.hypot(vr, vc) || 1
  vr /= norm
  vc /= norm

  // Caliper extent: project every mask pixel onto each axis and span it.
  let majMin = Infinity
  let majMax = -Infinity
  let minMin = Infinity
  let minMax = -Infinity
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!mask[r * width + c]) continue
      const dr = r - mr
      const dc = c - mc
      const a = dr * vr + dc * vc
      const b = -dr * vc + dc * vr
      if (a < majMin) majMin = a
      if (a > majMax) majMax = a
      if (b < minMin) minMin = b
      if (b > minMax) minMax = b
    }
  }

  // +1: a single-pixel-wide pool spans one pixel, not zero.
  const lengthPx = majMax - majMin + 1
  const widthPx = minMax - minMin + 1
  const mmPerPx = PIXEL_PITCH_UM / 1000
  const lengthMm = lengthPx * mmPerPx
  const widthMm = widthPx * mmPerPx

  const round = (v: number, dp = 3) => Math.round(v * 10 ** dp) / 10 ** dp
  const deviation = (value: number, ref: number | undefined) =>
    ref && ref > 0 ? round((100 * (value - ref)) / ref, 1) : null

  return {
    lengthMm: round(lengthMm),
    widthMm: round(widthMm),
    lengthPx: round(lengthPx, 1),
    widthPx: round(widthPx, 1),
    // Image convention: the long axis measured anticlockwise from horizontal.
    angleDeg: round((Math.atan2(vr, vc) * 180) / Math.PI, 1),
    aspect: widthMm > 0 ? round(lengthMm / widthMm, 2) : 0,
    lengthDeviationPct: deviation(lengthMm, reference?.lengthMm),
    widthDeviationPct: deviation(widthMm, reference?.widthMm),
  }
}

export function computeStats(
  frame: ThermalFrame,
  ref: IndexedFrame,
  threshold: ThresholdChoice,
  poolReference?: PoolReference | null,
): FrameStats {
  const mask = meltPoolMask(frame, threshold.count)
  let count = 0
  let sum = 0
  let max = -Infinity
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const c = countToCelsius(frame.data[i])
    count += 1
    sum += c
    if (c > max) max = c
  }
  return {
    maskPixels: count,
    meanTempC: count ? sum / count : 0,
    maxTempC: count ? max : 0,
    loggedSizePx: ref.meltpoolSizePx,
    loggedTempC: ref.meltpoolTempC,
    thresholdCount: threshold.count,
    thresholdC: threshold.celsius,
    thresholdSource: threshold.source,
    dimensions: meltPoolDimensions(mask, frame.width, frame.height, poolReference),
  }
}

function blend(base: number, over: number, alpha: number): number {
  return Math.round(base * (1 - alpha) + over * alpha)
}

export interface RenderOptions {
  overlay: boolean
  /** Draw the circle the controller actually evaluates. */
  showRoi?: boolean
  /** Overrides the machine's threshold when the operator set their own. */
  thresholdCount?: number
}

export function renderFrame(
  frame: ThermalFrame,
  thresholdCount: number,
  options: RenderOptions,
): Buffer {
  if (!rampTable) rampTable = rampTableForCounts(calibration())
  const table = rampTable
  const { width, height, data } = frame

  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0; i < data.length; i++) {
    const v = data[i] > 4095 ? 4095 : data[i]
    rgb[i * 3] = table[v * 3]
    rgb[i * 3 + 1] = table[v * 3 + 1]
    rgb[i * 3 + 2] = table[v * 3 + 2]
  }

  if (options.showRoi) {
    // One-pixel ring at the ROI edge.
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const dr = r - ROI_CENTER_ROW
        const dc = c - ROI_CENTER_COL
        const d = Math.sqrt(dr * dr + dc * dc)
        if (Math.abs(d - ROI_RADIUS) < 0.5) {
          const i = (r * width + c) * 3
          rgb[i] = blend(rgb[i], ROI_RGB[0], 0.5)
          rgb[i + 1] = blend(rgb[i + 1], ROI_RGB[1], 0.5)
          rgb[i + 2] = blend(rgb[i + 2], ROI_RGB[2], 0.5)
        }
      }
    }
  }

  if (options.overlay) {
    const mask = meltPoolMask(frame, thresholdCount)

    // Two passes: a dark halo first so the contour stays legible over both the
    // pale-yellow and deep-red ends of the ramp, then the contour itself.
    const isEdge = (r: number, c: number, i: number) =>
      mask[i] === 1 &&
      (r === 0 ||
        c === 0 ||
        r === height - 1 ||
        c === width - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - width] ||
        !mask[i + width])

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const i = r * width + c
        if (isEdge(r, c, i)) continue
        const touchesEdge =
          isEdge(r - 1, c, i - width) ||
          isEdge(r + 1, c, i + width) ||
          isEdge(r, c - 1, i - 1) ||
          isEdge(r, c + 1, i + 1)
        if (!touchesEdge) continue
        const o = i * 3
        rgb[o] = blend(rgb[o], BOUNDARY_HALO[0], 0.6)
        rgb[o + 1] = blend(rgb[o + 1], BOUNDARY_HALO[1], 0.6)
        rgb[o + 2] = blend(rgb[o + 2], BOUNDARY_HALO[2], 0.6)
      }
    }

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const i = r * width + c
        if (!isEdge(r, c, i)) continue
        const o = i * 3
        rgb[o] = BOUNDARY_RGB[0]
        rgb[o + 1] = BOUNDARY_RGB[1]
        rgb[o + 2] = BOUNDARY_RGB[2]
      }
    }
  }

  return encodePng(rgb, width, height)
}

/**
 * Parsed frames are shared by the PNG, stats and field routes. Without this
 * each scrub step re-parses the same 140 KB matrix up to three times.
 */
const FRAME_CACHE_LIMIT = 64
const frameCache = new Map<string, ThermalFrame>()

export async function loadFrame(file: string): Promise<ThermalFrame> {
  const hit = frameCache.get(file)
  if (hit) {
    frameCache.delete(file)
    frameCache.set(file, hit)
    return hit
  }
  const frame = await readFrame(file)
  frameCache.set(file, frame)
  if (frameCache.size > FRAME_CACHE_LIMIT) {
    const oldest = frameCache.keys().next().value
    if (oldest !== undefined) frameCache.delete(oldest)
  }
  return frame
}

/** Small LRU so scrubbing back and forth within a layer stays instant. */
const CACHE_LIMIT = 200
const pngCache = new Map<string, Buffer>()

export async function renderIndexedFrame(
  ref: IndexedFrame,
  options: RenderOptions,
): Promise<Buffer> {
  const cut = options.thresholdCount ?? ref.thresholdCount
  const key = `${ref.file}|${options.overlay ? 1 : 0}|${options.showRoi ? 1 : 0}|${cut}`
  const hit = pngCache.get(key)
  if (hit) {
    pngCache.delete(key)
    pngCache.set(key, hit)
    return hit
  }

  const frame = await loadFrame(ref.file)
  const png = renderFrame(frame, cut, options)

  pngCache.set(key, png)
  if (pngCache.size > CACHE_LIMIT) {
    const oldest = pngCache.keys().next().value
    if (oldest !== undefined) pngCache.delete(oldest)
  }
  return png
}

export async function statsForIndexedFrame(
  ref: IndexedFrame,
  threshold: ThresholdChoice,
  poolReference?: PoolReference | null,
): Promise<FrameStats> {
  const frame = await loadFrame(ref.file)
  return computeStats(frame, ref, threshold, poolReference)
}

/**
 * The build's steady-state pool size, for the deviation readout.
 *
 * Segmenting every frame to get a reference would cost minutes, so this
 * samples frames spread across the post-transition layers and takes the
 * median of each dimension. Cached per build and threshold, because changing
 * the threshold changes the reference too.
 */
const poolReferenceCache = new Map<string, Promise<PoolReference | null>>()

export function poolReference(
  buildId: string,
  thresholdCount: number,
  sample: IndexedFrame[],
): Promise<PoolReference | null> {
  const key = `${buildId}|${thresholdCount}`
  let hit = poolReferenceCache.get(key)
  if (!hit) {
    hit = (async () => {
      const lengths: number[] = []
      const widths: number[] = []
      for (const ref of sample) {
        try {
          const frame = await loadFrame(ref.file)
          const dims = meltPoolDimensions(
            meltPoolMask(frame, thresholdCount),
            frame.width,
            frame.height,
          )
          if (!dims) continue
          lengths.push(dims.lengthMm)
          widths.push(dims.widthMm)
        } catch {
          // A corrupt frame just drops out of the sample.
        }
      }
      if (lengths.length < 3) return null
      const mid = (values: number[]) => {
        const sorted = [...values].sort((a, b) => a - b)
        return sorted[sorted.length >> 1]
      }
      return { lengthMm: mid(lengths), widthMm: mid(widths) }
    })().catch(() => {
      poolReferenceCache.delete(key)
      return null
    })
    poolReferenceCache.set(key, hit)
  }
  return hit
}
