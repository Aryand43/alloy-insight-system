/**
 * Colour ramp for measured quantities that are not temperatures.
 *
 * Deliberately different from `thermalColor`: the thermal ramp means °C
 * everywhere in this app, so reusing it for thermal gradient or solidification
 * rate would read as a temperature. These stops run dark blue → teal → green →
 * yellow, which is luminance-monotonic (so it survives greyscale printing and
 * projector washout) and distinguishable with the common colour-vision
 * deficiencies.
 */
const STOPS_DARK: [number, number, number][] = [
  [38, 48, 96], // low
  [38, 92, 130],
  [31, 134, 133],
  [60, 172, 110],
  [138, 200, 72],
  [231, 221, 60], // high
]

/**
 * The same hues, re-weighted for a pale background.
 *
 * The dark ramp ends in a bright yellow that is almost invisible on white, so
 * the light variant keeps the hue progression but carries the lightness the
 * other way: low values stay light and high values go dark. The ordering a
 * reader perceives is therefore the same in both themes, and the legend bar
 * beside every map is drawn from whichever ramp is in use.
 */
const STOPS_LIGHT: [number, number, number][] = [
  [186, 214, 226], // low
  [120, 180, 205],
  [56, 142, 160],
  [34, 120, 96],
  [86, 120, 32],
  [92, 84, 12], // high
]

export type Rgb = [number, number, number]

export type MetricTheme = 'dark' | 'light'

function stopsFor(theme: MetricTheme): [number, number, number][] {
  return theme === 'light' ? STOPS_LIGHT : STOPS_DARK
}

export function metricRamp(t: number, theme: MetricTheme = 'dark'): Rgb {
  const stops = stopsFor(theme)
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  const scaled = clamped * (stops.length - 1)
  const i = Math.min(Math.floor(scaled), stops.length - 2)
  const f = scaled - i
  const a = stops[i]
  const b = stops[i + 1]
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

export function metricColor(
  value: number,
  min: number,
  max: number,
  theme: MetricTheme = 'dark',
): string {
  const span = max - min || 1
  const [r, g, b] = metricRamp((value - min) / span, theme)
  return `rgb(${r} ${g} ${b})`
}

/** CSS gradient for a legend bar, matching `metricRamp`. */
export function metricGradientCss(theme: MetricTheme = 'dark'): string {
  const stops = stopsFor(theme)
  const parts = stops.map(
    (s, i) => `rgb(${s[0]} ${s[1]} ${s[2]}) ${(i / (stops.length - 1)) * 100}%`,
  )
  return `linear-gradient(to right, ${parts.join(', ')})`
}
