import fs from 'node:fs/promises'
import path from 'node:path'
import { FRAME_MATCH_TOLERANCE_MS } from '../config'
import { nearestIndex, readDataDat } from '../parsers/dataDat'
import type { CatalogEntry } from './catalog'
import { getLayerSeries, type LayerSeries } from './layers'

export interface IndexedFrame {
  /** Position within its layer, 0-based. */
  position: number
  file: string
  tMs: number
  zMm: number
  /** Values the machine logged for the matched row. */
  meltpoolSizePx: number
  meltpoolTempC: number
  /** Raw-count threshold the controller used for this row (typically 497). */
  thresholdCount: number
}

export interface IndexedLayer {
  layer: number
  zMm: number
  frames: IndexedFrame[]
}

export interface FrameIndex {
  buildId: string
  layers: IndexedLayer[]
  byLayer: Map<number, IndexedLayer>
  /** Melt threshold in °C from the run header, for labelling. */
  meltThresholdC: number
  totalFrames: number
  matchedFrames: number
}

const FRAME_T_RE = /__(\d+)\.dat$/

async function build(
  entry: CatalogEntry,
  series: LayerSeries,
): Promise<FrameIndex> {
  if (!entry.dataDatFile || !entry.framesDir) {
    throw new Error(`${entry.id} has no thermal frames`)
  }

  const table = await readDataDat(entry.dataDatFile)
  const t = table.data.t
  const z = table.data.z
  const size = table.data.meltpoolSize
  const temp = table.data.meltpoolTemp
  const threshold = table.data.meltpoolThreshold

  const files = await fs.readdir(entry.framesDir)

  // Layer z-positions come from the same spreadsheet the process pipeline
  // uses, so both modes share one layer index.
  const layerZ = series.points.map((p) => p.zMm)
  const tolerance = entry.layerHeightMm / 2

  const byLayer = new Map<number, IndexedLayer>()
  let matched = 0

  const candidates: { file: string; tMs: number }[] = []
  for (const name of files) {
    const m = FRAME_T_RE.exec(name)
    if (m) candidates.push({ file: name, tMs: Number(m[1]) })
  }
  candidates.sort((a, b) => a.tMs - b.tMs)

  for (const c of candidates) {
    const row = nearestIndex(t, c.tMs)
    if (row < 0) continue
    if (Math.abs(t[row] - c.tMs) > FRAME_MATCH_TOLERANCE_MS) continue
    // Rows with no detected melt pool are idle travel, not deposition.
    if (size[row] <= 0) continue

    const frameZ = z[row]
    let best = -1
    let bestDelta = Infinity
    for (let i = 0; i < layerZ.length; i++) {
      const d = Math.abs(layerZ[i] - frameZ)
      if (d < bestDelta) {
        bestDelta = d
        best = i
      }
    }
    if (best < 0 || bestDelta > tolerance) continue

    const layerNo = best + 1
    let bucket = byLayer.get(layerNo)
    if (!bucket) {
      bucket = { layer: layerNo, zMm: layerZ[best], frames: [] }
      byLayer.set(layerNo, bucket)
    }
    bucket.frames.push({
      position: bucket.frames.length,
      file: path.join(entry.framesDir, c.file),
      tMs: c.tMs,
      zMm: frameZ,
      meltpoolSizePx: size[row],
      meltpoolTempC: temp[row],
      thresholdCount: threshold[row],
    })
    matched += 1
  }

  const layers = [...byLayer.values()].sort((a, b) => a.layer - b.layer)
  const meltThresholdC = Number(table.meta['TemperatureMeltThreshold'] ?? 1560)

  return {
    buildId: entry.id,
    layers,
    byLayer,
    meltThresholdC: Number.isFinite(meltThresholdC) ? meltThresholdC : 1560,
    totalFrames: candidates.length,
    matchedFrames: matched,
  }
}

const cache = new Map<string, Promise<FrameIndex>>()

/**
 * Built lazily on first thermal request, never at boot: it costs a ~22k-row
 * parse plus a readdir over ~20k files.
 */
export function getFrameIndex(entry: CatalogEntry): Promise<FrameIndex> {
  let hit = cache.get(entry.id)
  if (!hit) {
    hit = getLayerSeries(entry)
      .then((series) => build(entry, series))
      .catch((err) => {
        cache.delete(entry.id)
        throw err
      })
    cache.set(entry.id, hit)
  }
  return hit
}
