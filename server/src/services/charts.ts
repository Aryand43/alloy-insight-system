import type { AnomalyReport } from '../../../src/domain/types.js'
import { buildAnomalyReport } from './anomaly.js'
import type { LayerPoint, LayerSeries } from './layers.js'

const BG = '#0d1117'
const GRID = '#243040'
const AXIS = '#4a5d72'
const TEXT = '#8a9aab'
const TEXT_BRIGHT = '#e2e8ef'
const LINE = '#3d7ab5'

const LEVEL_COLOR = {
  stable: '#3d9a6a',
  transition: '#e8b84a',
  alert: '#d64545',
} as const

/** Ramp-up shading — deliberately cool and quiet, so it reads as context. */
const TRANSITION_FILL = '#2b3a52'
const ANOMALY_COLOR = { watch: '#e8b84a', alert: '#d64545' } as const

function esc(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&#39;',
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

export type ChartKind = 'temp' | 'size'

function seriesValues(series: LayerSeries, kind: ChartKind): number[] {
  return series.points.map((p) => (kind === 'temp' ? p.meanTempC : p.meanSizeMm2))
}

function reference(series: LayerSeries, kind: ChartKind): number {
  return kind === 'temp' ? series.referenceTempC : series.referenceSizeMm2
}

function stableBandPct(series: LayerSeries, kind: ChartKind): number {
  return kind === 'temp'
    ? series.thresholds.tempStablePct
    : series.thresholds.sizeStablePct
}

/**
 * Full-size per-layer chart, used as the "raw image" for the 24 builds that
 * have no KIV histogram PNGs.
 *
 * The corpus only stores one mean per layer for these builds, so there is no
 * distribution to draw. Showing the whole layer profile with the selected
 * layer marked is the honest equivalent: it carries the trend, the build's
 * steady-state reference, and where this layer sits against it.
 */
export function layerProfileSvg(
  series: LayerSeries,
  layer: number,
  kind: ChartKind = 'temp',
  report: AnomalyReport = buildAnomalyReport(series),
): string {
  const W = 640
  const H = 420
  // Sized for legibility when the 640px chart is drawn at panel size.
  const L = 84
  const R = 24
  const T = 72
  const B = 56
  const pw = W - L - R
  const ph = H - T - B

  const values = seriesValues(series, kind)
  const n = values.length
  const point: LayerPoint | undefined = series.points[layer - 1]

  const ref = reference(series, kind)
  const band = (stableBandPct(series, kind) / 100) * ref

  const lo = Math.min(...values, ref - band)
  const hi = Math.max(...values, ref + band)
  const pad = (hi - lo) * 0.08 || 1
  const yMin = lo - pad
  const yMax = hi + pad

  const x = (i: number) => (n <= 1 ? L + pw / 2 : L + (i / (n - 1)) * pw)
  const y = (v: number) => T + (1 - (v - yMin) / (yMax - yMin)) * ph

  const unit = kind === 'temp' ? '°C' : 'mm²'
  const decimals = kind === 'temp' ? 0 : 2
  const title = kind === 'temp' ? 'Mean layer temperature' : 'Mean melt-pool size'

  const gridLines: string[] = []
  const ticks = 5
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + ((yMax - yMin) * i) / ticks
    const yy = round(y(v))
    gridLines.push(
      `<line x1="${L}" y1="${yy}" x2="${L + pw}" y2="${yy}" stroke="${GRID}" stroke-width="1"/>`,
      `<text x="${L - 10}" y="${yy + 6}" fill="${TEXT}" font-size="17" text-anchor="end">${v.toFixed(decimals)}</text>`,
    )
  }

  const xTicks: string[] = []
  const step = Math.max(1, Math.round(n / 8))
  for (let i = 0; i < n; i += step) {
    const xx = round(x(i))
    xTicks.push(
      `<line x1="${xx}" y1="${T + ph}" x2="${xx}" y2="${T + ph + 4}" stroke="${AXIS}" stroke-width="1"/>`,
      `<text x="${xx}" y="${T + ph + 26}" fill="${TEXT}" font-size="17" text-anchor="middle">${i + 1}</text>`,
    )
  }

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))} ${round(y(v))}`)
    .join(' ')

  const bandTop = round(y(ref + band))
  const bandBottom = round(y(ref - band))

  /*
   * Ramp-up region. Shaded rather than hidden: the operator should see that
   * the first layers were excluded from anomaly detection, and why.
   */
  const transitionEnd = report.transition.endLayer
  const transition =
    transitionEnd > 0 && transitionEnd < n
      ? (() => {
          const right = round(x(transitionEnd - 1))
          const label =
            right - L > 150
              ? `<text x="${round(L + (right - L) / 2)}" y="${T + 20}" fill="${TEXT}" font-size="16" text-anchor="middle">transition · not scored</text>`
              : ''
          return `
  <rect x="${L}" y="${T}" width="${round(right - L)}" height="${ph}" fill="${TRANSITION_FILL}" opacity="0.45"/>
  <line x1="${right}" y1="${T}" x2="${right}" y2="${T + ph}" stroke="${AXIS}" stroke-width="1" stroke-dasharray="3 3"/>
  ${label}`
        })()
      : ''

  /*
   * Flagged layers. Rings, not filled dots, so the profile line still reads
   * through them where a run of layers is flagged.
   */
  const anomalyMarks = report.anomalies
    .map((a) => {
      const i = a.layer - 1
      const value = values[i]
      if (value === undefined) return ''
      const colour = ANOMALY_COLOR[a.severity]
      const cx = round(x(i))
      const cy = round(y(value))
      const r = a.severity === 'alert' ? 6 : 4
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colour}" stroke-width="2.5" opacity="0.95"/>`
    })
    .join('\n  ')

  /* Onset of each run of flagged layers, which is the point worth naming. */
  const onsetMarks = report.events
    .map((e) => {
      const i = e.onsetLayer - 1
      const value = values[i]
      if (value === undefined) return ''
      const cx = round(x(i))
      const colour = ANOMALY_COLOR[e.severity]
      return `
  <path d="M${cx} ${T + ph + 2} l-6 10 l12 0 z" fill="${colour}"/>
  <text x="${cx}" y="${T - 6}" fill="${colour}" font-size="15" text-anchor="middle">L${e.onsetLayer}</text>`
    })
    .join('')

  const marker = point
    ? (() => {
        const mx = round(x(layer - 1))
        const mv = kind === 'temp' ? point.meanTempC : point.meanSizeMm2
        const my = round(y(mv))
        const level = kind === 'temp' ? point.level : point.sizeLevel
        const colour = LEVEL_COLOR[level]
        const drift = kind === 'temp' ? point.tempDriftPct : point.sizeDriftPct
        const labelRight = mx < L + pw * 0.65
        return `
  <line x1="${mx}" y1="${T}" x2="${mx}" y2="${T + ph}" stroke="${colour}" stroke-width="2" stroke-dasharray="5 4"/>
  <circle cx="${mx}" cy="${my}" r="7" fill="${colour}" stroke="${BG}" stroke-width="1.5"/>
  <text x="${labelRight ? mx + 14 : mx - 14}" y="${Math.max(T + 22, my - 18)}"
        fill="${TEXT_BRIGHT}" font-size="21" text-anchor="${labelRight ? 'start' : 'end'}">
    L${layer} · ${mv.toFixed(decimals)} ${unit}
  </text>
  <text x="${labelRight ? mx + 14 : mx - 14}" y="${Math.max(T + 46, my + 10)}"
        fill="${colour}" font-size="18" text-anchor="${labelRight ? 'start' : 'end'}">
    ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}% vs median
  </text>`
      })()
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="IBM Plex Sans, system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <text x="${L}" y="30" fill="${TEXT_BRIGHT}" font-size="24">${esc(title)}</text>
  <text x="${L}" y="56" fill="${TEXT}" font-size="17">${esc(series.buildId)} · ${n} layers · median ${ref.toFixed(decimals)} ${unit}${report.anomalies.length ? ` · ${report.anomalies.length} flagged layer${report.anomalies.length === 1 ? '' : 's'}` : ' · no layers flagged'}</text>
  ${transition}
  <rect x="${L}" y="${bandTop}" width="${pw}" height="${round(bandBottom - bandTop)}" fill="${LEVEL_COLOR.stable}" opacity="0.10"/>
  <line x1="${L}" y1="${round(y(ref))}" x2="${L + pw}" y2="${round(y(ref))}" stroke="${LEVEL_COLOR.stable}" stroke-width="1" stroke-dasharray="6 4" opacity="0.7"/>
  ${gridLines.join('\n  ')}
  <path d="${path}" fill="none" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>
  ${anomalyMarks}
  ${onsetMarks}
  ${xTicks.join('\n  ')}
  <line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${AXIS}" stroke-width="1"/>
  <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="${AXIS}" stroke-width="1"/>
  <text x="${L + pw / 2}" y="${H - 8}" fill="${TEXT}" font-size="17" text-anchor="middle">Layer</text>
  ${marker}
</svg>`
}

/**
 * 64x64 sparkline used for the filmstrip, so selecting between 84 layers does
 * not pull 84 full-resolution images.
 */
export function layerThumbnailSvg(
  series: LayerSeries,
  layer: number,
  kind: ChartKind = 'temp',
): string {
  const S = 64
  const pad = 6
  const values = seriesValues(series, kind)
  const n = values.length
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1

  const x = (i: number) => (n <= 1 ? S / 2 : pad + (i / (n - 1)) * (S - pad * 2))
  const y = (v: number) => pad + (1 - (v - lo) / span) * (S - pad * 2)

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))} ${round(y(v))}`)
    .join(' ')

  const point = series.points[layer - 1]
  const colour = point ? LEVEL_COLOR[kind === 'temp' ? point.level : point.sizeLevel] : TEXT
  const mx = round(x(layer - 1))
  const mv = point ? (kind === 'temp' ? point.meanTempC : point.meanSizeMm2) : lo

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${BG}"/>
  <path d="${path}" fill="none" stroke="${TEXT}" stroke-width="2.5"/>
  <line x1="${mx}" y1="${pad - 2}" x2="${mx}" y2="${S - pad + 2}" stroke="${colour}" stroke-width="1"/>
  <circle cx="${mx}" cy="${round(y(mv))}" r="3" fill="${colour}"/>
</svg>`
}
