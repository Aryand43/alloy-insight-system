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
const STOPS: [number, number, number][] = [
  [38, 48, 96], // low
  [38, 92, 130],
  [31, 134, 133],
  [60, 172, 110],
  [138, 200, 72],
  [231, 221, 60], // high
]

export type Rgb = [number, number, number]

export function metricRamp(t: number): Rgb {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  const scaled = clamped * (STOPS.length - 1)
  const i = Math.min(Math.floor(scaled), STOPS.length - 2)
  const f = scaled - i
  const a = STOPS[i]
  const b = STOPS[i + 1]
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ]
}

export function metricColor(value: number, min: number, max: number): string {
  const span = max - min || 1
  const [r, g, b] = metricRamp((value - min) / span)
  return `rgb(${r} ${g} ${b})`
}

/** CSS gradient for a legend bar, matching `metricRamp`. */
export function metricGradientCss(): string {
  const stops = STOPS.map((s, i) => `rgb(${s[0]} ${s[1]} ${s[2]}) ${(i / (STOPS.length - 1)) * 100}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}
