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
 * Always the layer-profile chart, for every build. The two builds with KIV
 * histogram PNGs used to show those here, which meant the left panel repeated
 * the distribution the right panel already shows; the profile is the view that
 * carries the trend, the ramp-up region and the model's flags. The histograms
 * are still served, and the deviation panel still shows them.
 *
 * `measured: false` says the image is drawn from the per-layer means rather
 * than captured, so a generated chart is never passed off as a camera frame.
 */
export function buildFrames(entry: CatalogEntry, series: LayerSeries): Frame[] {
  return series.points.map((p) => ({
    id: `L${p.layer}`,
    index: p.layer - 1,
    label: `Layer ${p.layer}`,
    imageUrl: `${assetBase(entry.id, p.layer)}/chart.svg?kind=temp`,
    thumbnailUrl: `${assetBase(entry.id, p.layer)}/thumb.svg?kind=temp`,
    // The corpus indexes layers by height, not time — there is no per-layer
    // timestamp to report, so zMm carries the real axis.
    timestampMs: 0,
    layer: p.layer,
    zMm: Math.round(p.zMm * 1000) / 1000,
    measured: false,
  }))
}
