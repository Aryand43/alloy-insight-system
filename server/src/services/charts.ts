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
): string {
  const W = 640
  const H = 420
  const L = 64
  const R = 18
  const T = 46
  const B = 40
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
      `<text x="${L - 8}" y="${yy + 4}" fill="${TEXT}" font-size="11" text-anchor="end">${v.toFixed(decimals)}</text>`,
    )
  }

  const xTicks: string[] = []
  const step = Math.max(1, Math.round(n / 8))
  for (let i = 0; i < n; i += step) {
    const xx = round(x(i))
    xTicks.push(
      `<line x1="${xx}" y1="${T + ph}" x2="${xx}" y2="${T + ph + 4}" stroke="${AXIS}" stroke-width="1"/>`,
      `<text x="${xx}" y="${T + ph + 18}" fill="${TEXT}" font-size="11" text-anchor="middle">${i + 1}</text>`,
    )
  }

  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${round(x(i))} ${round(y(v))}`)
    .join(' ')

  const bandTop = round(y(ref + band))
  const bandBottom = round(y(ref - band))

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
  <line x1="${mx}" y1="${T}" x2="${mx}" y2="${T + ph}" stroke="${colour}" stroke-width="1.5" stroke-dasharray="4 3"/>
  <circle cx="${mx}" cy="${my}" r="5" fill="${colour}" stroke="${BG}" stroke-width="1.5"/>
  <text x="${labelRight ? mx + 10 : mx - 10}" y="${Math.max(T + 14, my - 12)}"
        fill="${TEXT_BRIGHT}" font-size="13" text-anchor="${labelRight ? 'start' : 'end'}">
    L${layer} · ${mv.toFixed(decimals)} ${unit}
  </text>
  <text x="${labelRight ? mx + 10 : mx - 10}" y="${Math.max(T + 30, my + 4)}"
        fill="${colour}" font-size="12" text-anchor="${labelRight ? 'start' : 'end'}">
    ${drift >= 0 ? '+' : ''}${drift.toFixed(1)}% vs median
  </text>`
      })()
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="IBM Plex Sans, system-ui, sans-serif">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <text x="${L}" y="22" fill="${TEXT_BRIGHT}" font-size="14">${esc(title)}</text>
  <text x="${L}" y="38" fill="${TEXT}" font-size="11">${esc(series.buildId)} · ${n} layers · median ${ref.toFixed(decimals)} ${unit} · generated from spreadsheet (no KIV image for this build)</text>
  <rect x="${L}" y="${bandTop}" width="${pw}" height="${round(bandBottom - bandTop)}" fill="${LEVEL_COLOR.stable}" opacity="0.10"/>
  <line x1="${L}" y1="${round(y(ref))}" x2="${L + pw}" y2="${round(y(ref))}" stroke="${LEVEL_COLOR.stable}" stroke-width="1" stroke-dasharray="6 4" opacity="0.7"/>
  ${gridLines.join('\n  ')}
  <path d="${path}" fill="none" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
  ${xTicks.join('\n  ')}
  <line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="${AXIS}" stroke-width="1"/>
  <line x1="${L}" y1="${T}" x2="${L}" y2="${T + ph}" stroke="${AXIS}" stroke-width="1"/>
  <text x="${L + pw / 2}" y="${H - 6}" fill="${TEXT}" font-size="11" text-anchor="middle">Layer</text>
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
  <path d="${path}" fill="none" stroke="${AXIS}" stroke-width="1.5"/>
  <line x1="${mx}" y1="${pad - 2}" x2="${mx}" y2="${S - pad + 2}" stroke="${colour}" stroke-width="1"/>
  <circle cx="${mx}" cy="${round(y(mv))}" r="3" fill="${colour}"/>
</svg>`
}
