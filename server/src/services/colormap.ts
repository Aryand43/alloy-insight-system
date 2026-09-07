/**
 * Thermal colour map.
 *
 * The domain is FIXED to the calibration table's full range rather than
 * auto-scaled per frame: scrubbing ~380 frames within a layer would otherwise
 * shimmer as each frame renormalised, and colours could not be compared
 * between layers.
 */
const STOPS: [number, number, number][] = [
  [0, 0, 4],
  [27, 12, 65],
  [74, 12, 107],
  [120, 28, 109],
  [165, 44, 96],
  [207, 68, 70],
  [237, 105, 37],
  [251, 155, 6],
  [247, 209, 61],
  [252, 255, 164],
]

/** Maps a normalised 0-1 value to RGB. */
export function ramp(t: number): [number, number, number] {
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

/** Precomputed 4096-entry ramp, indexed by raw camera count. */
export function rampTableForCounts(): Uint8Array {
  const table = new Uint8Array(4096 * 3)
  for (let i = 0; i < 4096; i++) {
    const [r, g, b] = ramp(i / 4095)
    table[i * 3] = r
    table[i * 3 + 1] = g
    table[i * 3 + 2] = b
  }
  return table
}
