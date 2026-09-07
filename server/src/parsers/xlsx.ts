import ExcelJS from 'exceljs'

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : null
  }
  // ExcelJS wraps formula cells as { result } and rich text as { richText }.
  if (value && typeof value === 'object' && 'result' in value) {
    return toNumber((value as { result: unknown }).result)
  }
  return null
}

function toText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (value && typeof value === 'object') {
    if ('text' in value) return String((value as { text: unknown }).text).trim()
    if ('result' in value) return toText((value as { result: unknown }).result)
  }
  return null
}

async function openFirstSheet(file: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error(`No worksheet in ${file}`)
  return ws
}

export interface LayerSheet {
  /** Column labels, e.g. `b_14.705` — the z-height of that layer in mm. */
  labels: string[]
  /** One mean value per layer, in layer order. */
  values: number[]
}

/**
 * Reads a `meantemp_<id>.xlsx` / `meansize_<id>.xlsx` sheet.
 *
 * These files are exactly two rows: a row of `b_<z>` column labels and a row
 * of per-layer means. Column count equals the build's layer count, and the
 * label step equals the layer increment.
 */
export async function readLayerSheet(file: string): Promise<LayerSheet> {
  const ws = await openFirstSheet(file)

  const labels: string[] = []
  const values: number[] = []

  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    const text = toText(cell.value)
    if (text) labels[col - 1] = text
  })
  ws.getRow(2).eachCell({ includeEmpty: false }, (cell, col) => {
    const n = toNumber(cell.value)
    if (n !== null) values[col - 1] = n
  })

  // Trim to the dense prefix both rows share — guards against stray cells.
  const n = Math.min(labels.length, values.length)
  const outLabels: string[] = []
  const outValues: number[] = []
  for (let i = 0; i < n; i++) {
    if (labels[i] === undefined || values[i] === undefined) break
    outLabels.push(labels[i])
    outValues.push(values[i])
  }

  if (!outValues.length) throw new Error(`No layer values found in ${file}`)
  return { labels: outLabels, values: outValues }
}

/** Parses `b_14.705` -> 14.705 (the layer's z-height in mm). */
export function zFromLabel(label: string): number | null {
  const m = /^b_(-?[\d.]+)$/i.exec(label.trim())
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export interface CouponQualityRow {
  passes: number
  bestFamily: string
  worstFamily: string
}

/**
 * Reads `DMG MORI DATA/COUPON QUALITY.xlsx`.
 *
 * A 7-row sheet naming the best and worst coupon family per pass count. The
 * cells hold 8-digit families (no run suffix), so the verdict applies to every
 * run of that family.
 */
export async function readCouponQuality(
  file: string,
): Promise<CouponQualityRow[]> {
  const ws = await openFirstSheet(file)
  const rows: CouponQualityRow[] = []

  ws.eachRow({ includeEmpty: false }, (row) => {
    const label = toText(row.getCell(2).value)
    const passes = label ? /^(\d+)\s*pass/i.exec(label)?.[1] : undefined
    if (!passes) return

    const best = toText(row.getCell(3).value)
    const worst = toText(row.getCell(4).value)
    if (!best || !worst) return

    rows.push({
      passes: Number(passes),
      bestFamily: best.trim(),
      worstFamily: worst.trim(),
    })
  })

  return rows
}
