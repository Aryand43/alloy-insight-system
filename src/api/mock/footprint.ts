import type { LayerFootprint } from '../../domain/types'

/** Overlapping circles along a few tracks, so the view renders without data. */
export async function mockGetLayerFootprint(layer: number): Promise<LayerFootprint> {
  await new Promise((r) => setTimeout(r, 200))
  const outlines = []
  for (let track = 0; track < 6; track++) {
    for (let step = 0; step < 14; step++) {
      const cx = -24 + step * 3.6
      const cy = 5 - track * 1.05
      const points: [number, number][] = Array.from({ length: 40 }, (_, i) => {
        const a = (i / 40) * Math.PI * 2
        return [
          Math.round((cx + Math.cos(a) * 2) * 100) / 100,
          Math.round((cy + Math.sin(a) * 2) * 100) / 100,
        ]
      })
      outlines.push({ position: outlines.length, centreXMm: cx, centreYMm: cy, points })
    }
  }
  return {
    layer,
    zMm: layer * 0.9,
    frames: outlines.length,
    framesUsed: outlines.length,
    framesUnreadable: 0,
    thresholdC: 1450,
    thresholdSource: 'user',
    bounds: { minXMm: -26, maxXMm: 26, minYMm: -3, maxYMm: 7 },
    outlines,
    gaps: [],
    gapCount: 0,
    gapsAssessed: true,
    stepMm: 1.6,
    poolWidthMm: 4,
    coveredAreaMm2: 0,
    gapAreaMm2: 0,
    cellMm: 0.1,
  }
}
