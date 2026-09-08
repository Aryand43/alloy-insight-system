/**
 * Thermal colour map, shared by the server's PNG renderer and the client's 3D
 * views.
 *
 * This module is deliberately dependency-free — no DOM, no Node — because the
 * server compiles with `types: ["node"]` and the app with DOM libs. Keeping the
 * stops here is what stops the rendered PNGs and the WebGL surfaces from
 * drifting apart, the same way `types.ts` keeps the API contract honest.
 *
 * Direction: **red is hottest**, pale yellow is coolest. Note this is the
 * inverse of a blackbody/inferno ramp, where white-yellow marks the peak. It is
 * intentional: the audience reads red as hot, and an inverted map was actively
 * misleading — red used to sit at 1551 °C, barely above the melt threshold,
 * while the hottest pixels rendered pale yellow.
 */
const STOPS: [number, number, number][] = [
  [255, 250, 214], // coolest — pale yellow
  [253, 231, 148],
  [252, 205, 86],
  [249, 170, 46],
  [242, 133, 30],
  [228, 96, 30],
  [206, 63, 36],
  [173, 36, 38],
  [130, 18, 33],
  [82, 8, 22], // hottest — deep red
]

/** Calibration range of the camera, in °C. The colour domain is fixed to it. */
export const TEMP_MIN_C = 980
export const TEMP_MAX_C = 2008

export type Rgb = [number, number, number]

/** Maps a normalised 0-1 value to RGB. 0 = coolest, 1 = hottest. */
export function ramp(t: number): Rgb {
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

/** Normalises a temperature onto the fixed calibration domain. */
export function normaliseC(
  celsius: number,
  min = TEMP_MIN_C,
  max = TEMP_MAX_C,
): number {
  if (max <= min) return 0
  return (celsius - min) / (max - min)
}

export function celsiusToRgb(
  celsius: number,
  min = TEMP_MIN_C,
  max = TEMP_MAX_C,
): Rgb {
  return ramp(normaliseC(celsius, min, max))
}

export function rgbToCss([r, g, b]: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`
}
