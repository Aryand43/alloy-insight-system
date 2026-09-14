import fs from 'node:fs'
import { CAMERA_CALIBRATION } from '../config.js'

/**
 * The camera's raw counts are 12-bit, so the calibration is a dense 4096-entry
 * table rather than a curve to fit.
 */
const TABLE_SIZE = 4096

let table: Float64Array | null = null

function load(): Float64Array {
  const text = fs.readFileSync(CAMERA_CALIBRATION, 'utf8')
  const lut = new Float64Array(TABLE_SIZE)
  let seen = 0

  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/\s+/)
    if (parts.length < 2) continue
    const index = Number(parts[0])
    const celsius = Number(parts[1])
    if (!Number.isInteger(index) || index < 0 || index >= TABLE_SIZE) continue
    if (!Number.isFinite(celsius)) continue
    lut[index] = celsius
    seen += 1
  }

  if (seen < TABLE_SIZE) {
    throw new Error(
      `${CAMERA_CALIBRATION}: expected ${TABLE_SIZE} calibration rows, read ${seen}`,
    )
  }
  return lut
}

export function calibration(): Float64Array {
  if (!table) table = load()
  return table
}

export function countToCelsius(count: number): number {
  const lut = calibration()
  const i = count < 0 ? 0 : count >= TABLE_SIZE ? TABLE_SIZE - 1 : count | 0
  return lut[i]
}

/** Lowest raw count at or above the given temperature, for thresholding. */
export function celsiusToCount(celsius: number): number {
  const lut = calibration()
  for (let i = 0; i < TABLE_SIZE; i++) if (lut[i] >= celsius) return i
  return TABLE_SIZE - 1
}
