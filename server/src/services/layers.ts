import type { AlertLevel } from '../../../src/domain/types'
import { readLayerSheet, zFromLabel } from '../parsers/xlsx'
import {
  DEFAULT_SIZE_STABLE_PCT,
  DEFAULT_SIZE_TRANSITION_PCT,
  DEFAULT_TEMP_STABLE_PCT,
  DEFAULT_TEMP_TRANSITION_PCT,
} from '../config'
import type { CatalogEntry } from './catalog'

export interface Thresholds {
  tempStablePct: number
  tempTransitionPct: number
  sizeStablePct: number
  sizeTransitionPct: number
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  tempStablePct: DEFAULT_TEMP_STABLE_PCT,
  tempTransitionPct: DEFAULT_TEMP_TRANSITION_PCT,
  sizeStablePct: DEFAULT_SIZE_STABLE_PCT,
  sizeTransitionPct: DEFAULT_SIZE_TRANSITION_PCT,
}

export interface LayerPoint {
  /** 1-based layer number. */
  layer: number
  /** Height above the build plate in mm, from the sheet's `b_<z>` label. */
  zMm: number
  meanTempC: number
  meanSizeMm2: number
  /** Signed percent drift from the build's median layer value. */
  tempDriftPct: number
  sizeDriftPct: number
  /** Classification on temperature alone — this is what the stats strip counts. */
  level: AlertLevel
  sizeLevel: AlertLevel
}

export interface LayerSeries {
  buildId: string
  points: LayerPoint[]
  /**
   * Median layer temperature. Median rather than mean because every build
   * ramps up over its first layers, which drags a mean away from the
   * steady-state the rest of the build sits at.
   */
  referenceTempC: number
  referenceSizeMm2: number
  thresholds: Thresholds
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function classify(driftPct: number, stable: number, transition: number): AlertLevel {
  const magnitude = Math.abs(driftPct)
  if (magnitude < stable) return 'stable'
  if (magnitude < transition) return 'transition'
  return 'alert'
}

async function computeSeries(
  entry: CatalogEntry,
  thresholds: Thresholds,
): Promise<LayerSeries> {
  const [temp, size] = await Promise.all([
    readLayerSheet(entry.meanTempFile),
    readLayerSheet(entry.meanSizeFile),
  ])

  const n = Math.min(temp.values.length, size.values.length)
  if (n !== entry.layers) {
    // Not fatal — the id is the source of truth for the label, the sheet for the data.
    console.warn(
      `[layers] ${entry.id}: id encodes ${entry.layers} layers but sheets hold ${n}`,
    )
  }

  const referenceTempC = median(temp.values.slice(0, n))
  const referenceSizeMm2 = median(size.values.slice(0, n))

  const points: LayerPoint[] = []
  for (let i = 0; i < n; i++) {
    const meanTempC = temp.values[i]
    const meanSizeMm2 = size.values[i]
    const tempDriftPct = ((meanTempC - referenceTempC) / referenceTempC) * 100
    const sizeDriftPct = ((meanSizeMm2 - referenceSizeMm2) / referenceSizeMm2) * 100

    points.push({
      layer: i + 1,
      // Fall back to the id's increment when a label is missing or malformed.
      zMm: zFromLabel(temp.labels[i] ?? '') ?? i * entry.layerHeightMm,
      meanTempC,
      meanSizeMm2,
      tempDriftPct,
      sizeDriftPct,
      level: classify(
        tempDriftPct,
        thresholds.tempStablePct,
        thresholds.tempTransitionPct,
      ),
      sizeLevel: classify(
        sizeDriftPct,
        thresholds.sizeStablePct,
        thresholds.sizeTransitionPct,
      ),
    })
  }

  return { buildId: entry.id, points, referenceTempC, referenceSizeMm2, thresholds }
}

const cache = new Map<string, Promise<LayerSeries>>()

function keyFor(id: string, t: Thresholds): string {
  return `${id}|${t.tempStablePct}|${t.tempTransitionPct}|${t.sizeStablePct}|${t.sizeTransitionPct}`
}

export function getLayerSeries(
  entry: CatalogEntry,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Promise<LayerSeries> {
  const key = keyFor(entry.id, thresholds)
  let hit = cache.get(key)
  if (!hit) {
    hit = computeSeries(entry, thresholds).catch((err) => {
      cache.delete(key)
      throw err
    })
    cache.set(key, hit)
  }
  return hit
}

/** Resolves a frame id such as `L22` or `frame_21` to a 1-based layer number. */
export function layerFromFrameId(frameId: string, layerCount: number): number | null {
  const digits = frameId.replace(/\D/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isInteger(n) || n < 1 || n > layerCount) return null
  return n
}
