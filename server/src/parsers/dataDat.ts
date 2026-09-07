import fs from 'node:fs/promises'

/**
 * Columns the DMG MORI controller writes. Mirrors `EXPECTED_COLUMNS` in
 * `Backend-Data/DMG MORI DATA/preprocess_and_train.py`, which was written
 * against the same files.
 */
export const DATA_DAT_COLUMNS = [
  't',
  'x',
  'y',
  'z',
  'a',
  'c',
  'meltpoolSize',
  'meltpoolTemp',
  'LaserPower',
  'stirrerValue_1',
  'revolutionSpeed_1',
  'powderGasFlow_1',
  'stirrerValue_2',
  'revolutionSpeed_2',
  'powderGasFlow_2',
  'flowWatch',
  'meltpoolThreshold',
  'protectionGlasTemperature',
] as const

export interface DataDatTable {
  columns: string[]
  rowCount: number
  /** Column-major storage — one Float64Array per column, sorted by `t`. */
  data: Record<string, Float64Array>
  /** Values from the leading `# Key: value` header block. */
  meta: Record<string, string>
}

/**
 * Parses a run's `Data.dat`.
 *
 * Layout: a block of `# Key: value` lines, then a single comma-separated
 * header row, then whitespace-separated numeric rows. Rows whose field count
 * does not match the header are skipped rather than failing the parse.
 */
export async function readDataDat(file: string): Promise<DataDatTable> {
  const text = await fs.readFile(file, 'utf8')
  const lines = text.split('\n')

  const meta: Record<string, string> = {}
  let columns: string[] | null = null
  const rows: number[][] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line.startsWith('#')) {
      const m = /^#\s*([^:]+):\s*(.*)$/.exec(line)
      if (m) meta[m[1].trim()] = m[2].trim()
      continue
    }

    if (!columns) {
      columns = line.split(',').map((c) => c.trim())
      continue
    }

    const parts = line.split(/\s+/)
    if (parts.length !== columns.length) continue

    const values = new Array<number>(parts.length)
    let ok = true
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i])
      if (!Number.isFinite(n)) {
        ok = false
        break
      }
      values[i] = n
    }
    if (ok) rows.push(values)
  }

  if (!columns) throw new Error(`No header row found in ${file}`)

  const missing = DATA_DAT_COLUMNS.filter((c) => !columns!.includes(c))
  if (missing.length) {
    throw new Error(`${file} is missing expected columns: ${missing.join(', ')}`)
  }

  // Sort by t so frame timestamps can be matched with a binary search.
  const tIndex = columns.indexOf('t')
  rows.sort((a, b) => a[tIndex] - b[tIndex])

  const data: Record<string, Float64Array> = {}
  columns.forEach((name, col) => {
    const arr = new Float64Array(rows.length)
    for (let r = 0; r < rows.length; r++) arr[r] = rows[r][col]
    data[name] = arr
  })

  return { columns, rowCount: rows.length, data, meta }
}

/** Index of the value in a sorted array closest to `query`. */
export function nearestIndex(sorted: Float64Array, query: number): number {
  if (!sorted.length) return -1
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid] < query) lo = mid + 1
    else hi = mid
  }
  if (lo <= 0) return 0
  if (lo >= sorted.length) return sorted.length - 1
  return query - sorted[lo - 1] <= sorted[lo] - query ? lo - 1 : lo
}
