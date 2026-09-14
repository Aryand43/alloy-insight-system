import type { Frame } from '../../../src/domain/types.js'
import { PUBLIC_BASE_URL } from '../config.js'
import type { CatalogEntry } from './catalog.js'
import type { LayerSeries } from './layers.js'

function assetBase(buildId: string, layer: number): string {
  return `${PUBLIC_BASE_URL}/builds/${encodeURIComponent(buildId)}/layers/${layer}`
}

export function kivTempUrl(buildId: string, layer: number): string {
  return `${assetBase(buildId, layer)}/kiv/temp.png`
}

export function kivSizeUrl(buildId: string, layer: number): string {
  return `${assetBase(buildId, layer)}/kiv/size.png`
}

/**
 * One frame per layer.
 *
 * Builds with KIV histogram PNGs get the real plotted distribution for that
 * layer. The other 24 builds only have a mean per layer in the spreadsheets,
 * so they get a generated layer-profile chart instead — `measured` says which
 * of the two a frame is, so the UI never passes a generated chart off as a
 * captured one.
 */
export function buildFrames(entry: CatalogEntry, series: LayerSeries): Frame[] {
  return series.points.map((p) => ({
    id: `L${p.layer}`,
    index: p.layer - 1,
    label: `Layer ${p.layer}`,
    imageUrl: entry.hasKivImages
      ? kivTempUrl(entry.id, p.layer)
      : `${assetBase(entry.id, p.layer)}/chart.svg?kind=temp`,
    thumbnailUrl: `${assetBase(entry.id, p.layer)}/thumb.svg?kind=temp`,
    // The corpus indexes layers by height, not time — there is no per-layer
    // timestamp to report, so zMm carries the real axis.
    timestampMs: 0,
    layer: p.layer,
    zMm: Math.round(p.zMm * 1000) / 1000,
    measured: entry.hasKivImages,
  }))
}
