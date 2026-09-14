import type {
  ClassifiedVoxel,
  ColorClass,
  MeshPayload,
  MeshVertex,
  ThresholdContour,
  ThresholdOverlay,
  ThresholdStats,
  ThreeColorPayload,
} from '../../../src/domain/types.js'
import type { CatalogEntry } from './catalog.js'
import type { LayerPoint, LayerSeries } from './layers.js'

/** Overall build height the normalised meshes are scaled to fill, in scene units. */
const SCENE_HEIGHT = 1.8
/** Cells across the coupon length in the three-colour wall. */
const VOXEL_COLUMNS = 12
/** Threshold panel canvas, in the units its SVG viewBox uses. */
const OVERLAY_W = 320
const OVERLAY_H = 240
const OVERLAY_PX_PER_MM = 34

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

function round(n: number, dp = 4): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/**
 * Equivalent bead width for a melt-pool area, as the diameter of a circle of
 * the same area. The corpus records melt-pool area in mm² and nothing about
 * wall thickness, so this is a single-track estimate — it is deliberately not
 * multiplied by the pass count, which would imply a geometry the data does
 * not support.
 */
export function beadWidthMm(areaMm2: number): number {
  return 2 * Math.sqrt(Math.max(areaMm2, 0) / Math.PI)
}

/* ------------------------------------------------------------------ mesh -- */

function pushBox(
  vertices: MeshVertex[],
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
): void {
  const base = vertices.length
  const hw = w / 2
  const hh = h / 2
  const hd = d / 2

  vertices.push(
    { x: round(cx - hw), y: round(cy - hh), z: round(cz - hd) },
    { x: round(cx + hw), y: round(cy - hh), z: round(cz - hd) },
    { x: round(cx + hw), y: round(cy + hh), z: round(cz - hd) },
    { x: round(cx - hw), y: round(cy + hh), z: round(cz - hd) },
    { x: round(cx - hw), y: round(cy - hh), z: round(cz + hd) },
    { x: round(cx + hw), y: round(cy - hh), z: round(cz + hd) },
    { x: round(cx + hw), y: round(cy + hh), z: round(cz + hd) },
    { x: round(cx - hw), y: round(cy + hh), z: round(cz + hd) },
  )

  // front, back, bottom, top, left, right — wound so normals face outward
  const faces = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    2, 6, 7, 2, 7, 3,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
  ]
  for (const f of faces) indices.push(base + f)
}

/**
 * Stacks one slab per layer. Slab length is the coupon length, slab height is
 * the layer increment, and slab thickness follows that layer's measured
 * melt-pool area — so the wobble down the stack is the real size variation.
 */
export function buildReconstruction(
  entry: CatalogEntry,
  series: LayerSeries,
  thicknessExaggeration = 1,
): MeshPayload {
  const points = series.points
  const heightMm = points.length * entry.layerHeightMm
  const scale = SCENE_HEIGHT / heightMm

  const thicknesses = points.map((p) => beadWidthMm(p.meanSizeMm2))
  const lengthUnits = entry.lengthMm * scale

  const vertices: MeshVertex[] = []
  const indices: number[] = []

  const hUnits = entry.layerHeightMm * scale
  for (let i = 0; i < points.length; i++) {
    const tUnits = thicknesses[i] * scale * thicknessExaggeration
    const cy = -SCENE_HEIGHT / 2 + (i + 0.5) * hUnits
    pushBox(vertices, indices, 0, cy, 0, lengthUnits, hUnits, tUnits)
  }

  return {
    vertices,
    indices,
    color: '#7a8a9a',
    meta: {
      lengthMm: entry.lengthMm,
      heightMm: round(heightMm, 2),
      layers: points.length,
      minThicknessMm: round(Math.min(...thicknesses), 2),
      maxThicknessMm: round(Math.max(...thicknesses), 2),
      thicknessExaggeration,
    },
  }
}

/* ---------------------------------------------------------- three colour -- */

const SEVERITY = { stable: 0, transition: 1, alert: 2 } as const

/**
 * Green only when both temperature and size sit in their stable bands;
 * otherwise the dominant deviation decides, red for hot/oversized and blue for
 * cold/undersized.
 */
export function classifyLayer(point: LayerPoint): ColorClass {
  const tempSeverity = SEVERITY[point.level]
  const sizeSeverity = SEVERITY[point.sizeLevel]
  if (tempSeverity === 0 && sizeSeverity === 0) return 'green'
  const useTemp = tempSeverity >= sizeSeverity
  const drift = useTemp ? point.tempDriftPct : point.sizeDriftPct
  return drift >= 0 ? 'red' : 'blue'
}

export function buildThreeColor(
  entry: CatalogEntry,
  series: LayerSeries,
): ThreeColorPayload {
  const points = series.points
  const heightMm = points.length * entry.layerHeightMm
  const scale = SCENE_HEIGHT / heightMm

  const lengthUnits = entry.lengthMm * scale
  const layerUnits = entry.layerHeightMm * scale
  const depthUnits = beadWidthMm(series.referenceSizeMm2) * scale

  const cellW = lengthUnits / VOXEL_COLUMNS
  const voxels: ClassifiedVoxel[] = []
  const counts: Record<ColorClass, number> = { red: 0, blue: 0, green: 0 }

  points.forEach((p, i) => {
    const cls = classifyLayer(p)
    const cy = -SCENE_HEIGHT / 2 + (i + 0.5) * layerUnits
    for (let c = 0; c < VOXEL_COLUMNS; c++) {
      voxels.push({
        x: round(-lengthUnits / 2 + (c + 0.5) * cellW),
        y: round(cy),
        z: 0,
        size: round(Math.min(cellW, layerUnits)),
        class: cls,
      })
      counts[cls] += 1
    }
  })

  return {
    voxels,
    bounds: {
      width: round(lengthUnits),
      height: round(SCENE_HEIGHT),
      depth: round(depthUnits),
    },
    voxelSize: { x: round(cellW), y: round(layerUnits), z: round(depthUnits) },
    counts,
  }
}

/* ------------------------------------------------------------- threshold -- */

function ellipse(
  id: string,
  channel: 'red' | 'blue',
  areaMm2: number,
  opacity: number,
): ThresholdContour {
  const r = Math.sqrt(Math.max(areaMm2, 0) / Math.PI) * OVERLAY_PX_PER_MM
  return {
    id,
    channel,
    cx: OVERLAY_W / 2,
    cy: OVERLAY_H / 2,
    // Melt pools run long in the direction of travel; keep the drawn area equal
    // to the measured area by scaling the axes reciprocally.
    rx: round(r * 1.35, 2),
    ry: round(r / 1.35, 2),
    opacity,
  }
}

export function buildThreshold(
  series: LayerSeries,
  frameId: string,
  point: LayerPoint,
  images: { tempUrl?: string; sizeUrl?: string },
): ThresholdOverlay {
  const alertAt = series.thresholds.tempTransitionPct

  return {
    frameId,
    width: OVERLAY_W,
    height: OVERLAY_H,
    contours: [
      // Baseline: the build's own steady-state pool.
      ellipse('reference-pool', 'blue', series.referenceSizeMm2, 0.35),
      // This layer's measured pool, drawn over it.
      ellipse('layer-pool', 'red', point.meanSizeMm2, 0.45),
    ],
    redFraction: clamp01(Math.max(0, point.tempDriftPct) / alertAt),
    blueFraction: clamp01(Math.max(0, -point.tempDriftPct) / alertAt),
    imageUrl: images.tempUrl,
    sizeImageUrl: images.sizeUrl,
    layer: point.layer,
    meanTempC: round(point.meanTempC, 2),
    meanSizeMm2: round(point.meanSizeMm2, 3),
    tempDriftPct: round(point.tempDriftPct, 2),
    sizeDriftPct: round(point.sizeDriftPct, 2),
  }
}

/* ----------------------------------------------------------------- stats -- */

/** Rounds parts to whole percents that still total 100 (largest remainder). */
function toWholePercents(counts: number[], total: number): number[] {
  if (total === 0) return counts.map(() => 0)
  const exact = counts.map((c) => (c / total) * 100)
  const floored = exact.map(Math.floor)
  let remaining = 100 - floored.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (remaining <= 0) break
    floored[i] += 1
    remaining -= 1
  }
  return floored
}

export function buildStats(series: LayerSeries): ThresholdStats {
  const points = series.points
  const stable = points.filter((p) => p.level === 'stable').length
  const transition = points.filter((p) => p.level === 'transition').length
  const alert = points.filter((p) => p.level === 'alert').length

  const [stablePct, transitionPct, alertPct] = toWholePercents(
    [stable, transition, alert],
    points.length,
  )

  // Escalate on how much of the build left the stable band, not on any single layer.
  let level: ThresholdStats['level'] = 'stable'
  if (alertPct >= 10) level = 'alert'
  else if (transitionPct + alertPct >= 25) level = 'transition'

  return {
    stablePct,
    transitionPct,
    alertPct,
    level,
    stableThreshold: series.thresholds.tempStablePct,
    transitionThreshold: series.thresholds.tempTransitionPct,
    referenceTempC: round(series.referenceTempC, 2),
    layerCount: points.length,
  }
}
