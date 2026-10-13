import type { MeltPoolPhysics } from './types'

/**
 * The frame's boundary curve as CSV, one row per point on the contour.
 *
 * Written so that files from different frames concatenate: every row repeats
 * the build, layer, frame and the conditions the numbers were measured under.
 * Without that, a folder of exports is a pile of anonymous coordinates, and
 * G in particular cannot be compared across files unless the threshold and
 * the fitting window travel with it.
 *
 * Pure text, no DOM: this is also what any future server-side export would
 * emit, so the two cannot disagree.
 */

export interface BoundaryCsvContext {
  buildId: string
  layer: number
  position: number
  thresholdC: number
}

const COLUMNS = [
  'build_id',
  'layer',
  'frame',
  'threshold_C',
  'x_mm',
  'y_mm',
  'G_C_per_mm',
  'theta_deg',
  'R_mm_per_s',
  'edge',
  'travel_speed_mm_per_s',
  'travel_heading_deg',
  'gradient_window_mm',
] as const

/** Excel reads CRLF reliably; plain LF trips some of its importers. */
const EOL = '\r\n'

function cell(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  // Quote anything that could be read as a delimiter.
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function boundaryCsv(
  physics: MeltPoolPhysics,
  context: BoundaryCsvContext,
): string {
  const rows = physics.points.map((p) =>
    [
      context.buildId,
      context.layer,
      context.position,
      context.thresholdC,
      p.xMm,
      p.yMm,
      p.gradientCPerMm,
      p.thetaDeg,
      // Blank rather than zero on the leading edge: there is no growth rate
      // there, and a zero would average into any downstream statistic.
      p.solidificationMmPerS,
      p.trailing ? 'trailing' : 'leading',
      physics.travel.speedMmPerS,
      physics.travel.headingDeg,
      physics.summary.gradientWindowMm,
    ]
      .map(cell)
      .join(','),
  )
  return [COLUMNS.join(','), ...rows].join(EOL) + EOL
}

export function boundaryCsvFilename(context: BoundaryCsvContext): string {
  return [
    'prism',
    context.buildId,
    `layer${context.layer}`,
    `frame${context.position}`,
    `${Math.round(context.thresholdC)}C`,
    'boundary.csv',
  ].join('_')
}
