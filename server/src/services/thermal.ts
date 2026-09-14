import { ROI_CENTER_COL, ROI_CENTER_ROW, ROI_RADIUS } from '../config.js'
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

export function computeStats(
  frame: ThermalFrame,
  ref: IndexedFrame,
  meltThresholdC: number,
): FrameStats {
  const mask = meltPoolMask(frame, ref.thresholdCount)
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
    thresholdCount: ref.thresholdCount,
    thresholdC: meltThresholdC,
  }
}

function blend(base: number, over: number, alpha: number): number {
  return Math.round(base * (1 - alpha) + over * alpha)
}

export interface RenderOptions {
  overlay: boolean
  /** Draw the circle the controller actually evaluates. */
  showRoi?: boolean
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
  const key = `${ref.file}|${options.overlay ? 1 : 0}|${options.showRoi ? 1 : 0}`
  const hit = pngCache.get(key)
  if (hit) {
    pngCache.delete(key)
    pngCache.set(key, hit)
    return hit
  }

  const frame = await loadFrame(ref.file)
  const png = renderFrame(frame, ref.thresholdCount, options)

  pngCache.set(key, png)
  if (pngCache.size > CACHE_LIMIT) {
    const oldest = pngCache.keys().next().value
    if (oldest !== undefined) pngCache.delete(oldest)
  }
  return png
}

export async function statsForIndexedFrame(
  ref: IndexedFrame,
  meltThresholdC: number,
): Promise<FrameStats> {
  const frame = await loadFrame(ref.file)
  return computeStats(frame, ref, meltThresholdC)
}
