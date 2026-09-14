import { ramp } from '../../../src/domain/thermalColor.js'

export { ramp }

/**
 * Precomputed 4096-entry ramp, indexed by raw camera count.
 *
 * Colour is a function of TEMPERATURE, not of the raw count. The two are far
 * from interchangeable: the calibration curve is steep at the bottom, so count
 * 497 is only 12% of the count range but 56% of the temperature range. Ramping
 * by count crushed everything below the 1560 °C melt threshold into the first
 * eighth of the ramp, rendering all sub-melt structure as one flat colour.
 *
 * The domain is FIXED to the calibration table's full range rather than
 * auto-scaled per frame: scrubbing ~380 frames within a layer would otherwise
 * shimmer as each frame renormalised, and colours could not be compared
 * between layers.
 */
export function rampTableForCounts(lut: ArrayLike<number>): Uint8Array {
  const min = lut[0]
  const max = lut[lut.length - 1]
  const span = max - min || 1

  const table = new Uint8Array(4096 * 3)
  for (let i = 0; i < 4096; i++) {
    const [r, g, b] = ramp((lut[i] - min) / span)
    table[i * 3] = r
    table[i * 3 + 1] = g
    table[i * 3 + 2] = b
  }
  return table
}
