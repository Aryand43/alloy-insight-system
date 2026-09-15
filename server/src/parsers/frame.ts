import fs from 'node:fs/promises'
import path from 'node:path'

export interface ThermalFrame {
  width: number
  height: number
  /** Raw 12-bit camera counts, row-major. Convert with the calibration LUT. */
  data: Uint16Array
}

export class CorruptFrameError extends Error {
  /** Diagnostic detail for server logs — never sent to the browser. */
  readonly detail: string

  constructor(
    public file: string,
    reason: string,
  ) {
    super('This frame is unreadable in the source data. Skip to the next frame.')
    this.name = 'CorruptFrameError'
    this.detail = `${path.basename(file)}: ${reason}`
  }
}

const ZERO = 48
const NINE = 57

/**
 * Parses one `Frames/*.dat` — a whitespace-separated integer matrix of raw
 * camera counts (164 x 218 across this corpus, values 0-4095).
 *
 * Scans bytes directly rather than splitting strings: a layer holds ~380
 * frames and these are rendered on demand.
 *
 * Validation is not optional. At least 38 files in
 * `20230308_1130_60106308r3/Frames/` are binary garbage rather than text, so a
 * frame that is not a clean numeric matrix must fail loudly and be skipped —
 * never rendered as noise.
 */
export async function readFrame(file: string): Promise<ThermalFrame> {
  const buf = await fs.readFile(file)

  const values: number[] = []
  const rowWidths: number[] = []
  let current = 0
  let inNumber = false
  let widthSoFar = 0

  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]

    if (byte >= ZERO && byte <= NINE) {
      current = current * 10 + (byte - ZERO)
      inNumber = true
      continue
    }

    const isNewline = byte === 10 || byte === 13
    const isSpace = byte === 32 || byte === 9

    if (!isNewline && !isSpace) {
      throw new CorruptFrameError(
        file,
        `unexpected byte 0x${byte.toString(16).padStart(2, '0')} at offset ${i} (not a numeric matrix)`,
      )
    }

    if (inNumber) {
      values.push(current)
      widthSoFar += 1
      current = 0
      inNumber = false
    }
    if (isNewline && widthSoFar > 0) {
      rowWidths.push(widthSoFar)
      widthSoFar = 0
    }
  }

  if (inNumber) {
    values.push(current)
    widthSoFar += 1
  }
  if (widthSoFar > 0) rowWidths.push(widthSoFar)

  if (!rowWidths.length) throw new CorruptFrameError(file, 'no rows')

  const height = rowWidths.length
  const width = Math.min(...rowWidths)
  if (width === 0) throw new CorruptFrameError(file, 'zero-width row')

  // Rows should be uniform; tolerate ragged trailing whitespace only.
  const maxWidth = Math.max(...rowWidths)
  if (maxWidth - width > 1) {
    throw new CorruptFrameError(
      file,
      `ragged rows (${width}-${maxWidth} columns)`,
    )
  }

  const data = new Uint16Array(width * height)
  let read = 0
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < rowWidths[r]; c++) {
      const v = values[read++]
      if (c < width) data[r * width + c] = v
    }
  }

  return { width, height, data }
}
