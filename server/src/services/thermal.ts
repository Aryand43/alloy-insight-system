import { ROI_CENTER_COL, ROI_CENTER_ROW, ROI_RADIUS } from '../config'
import { countToCelsius } from './calibration'
import { rampTableForCounts } from './colormap'
import { encodePng } from './png'
import { readFrame, type ThermalFrame } from '../parsers/frame'
import type { IndexedFrame } from './frameIndex'

/** Melt-pool overlay styling. Shubham asked for a bolder, less transparent red. */
const MELT_FILL_ALPHA = 0.55
const MELT_RGB: [number, number, number] = [214, 69, 69]
const BOUNDARY_RGB: [number, number, number] = [255, 92, 92]
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
  if (!rampTable) rampTable = rampTableForCounts()
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
    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        const i = r * width + c
        if (!mask[i]) continue

        // A masked pixel touching an unmasked one is on the boundary.
        const edge =
          r === 0 ||
          c === 0 ||
          r === height - 1 ||
          c === width - 1 ||
          !mask[i - 1] ||
          !mask[i + 1] ||
          !mask[i - width] ||
          !mask[i + width]

        const o = i * 3
        if (edge) {
          rgb[o] = BOUNDARY_RGB[0]
          rgb[o + 1] = BOUNDARY_RGB[1]
          rgb[o + 2] = BOUNDARY_RGB[2]
        } else {
          rgb[o] = blend(rgb[o], MELT_RGB[0], MELT_FILL_ALPHA)
          rgb[o + 1] = blend(rgb[o + 1], MELT_RGB[1], MELT_FILL_ALPHA)
          rgb[o + 2] = blend(rgb[o + 2], MELT_RGB[2], MELT_FILL_ALPHA)
        }
      }
    }
  }

  return encodePng(rgb, width, height)
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

  const frame = await readFrame(ref.file)
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
  const frame = await readFrame(ref.file)
  return computeStats(frame, ref, meltThresholdC)
}
