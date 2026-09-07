/**
 * Build-id decoding for the Backend-Data corpus.
 *
 * A coupon id such as `60106308r3` decodes as:
 *   60  length of the sample in mm
 *   10  number of passes
 *   63  number of layers
 *   08  layer increment (layer height) in 0.1 mm units -> 0.8 mm
 *   r3  run / replicate
 *
 * Source: `Backend-Data/part naming convention.txt`, confirmed by the data
 * owner and verified against all 26 builds — `meantemp_<id>.xlsx` has exactly
 * one column per layer and its `b_<z>` labels step by the layer increment.
 *
 * Design invariant: layers x increment ~= 50 mm for every coupon, so layer
 * count and increment always co-vary.
 */
export interface DecodedBuildId {
  id: string
  lengthMm: number
  passes: number
  layers: number
  layerHeightMm: number
  run: number
  /** Key used by the LAYER INFO COMPARE workbooks, e.g. `7r2_4pass`. */
  shorthand: string
  /** First 8 digits — the coupon family, ignoring the run suffix. */
  family: string
}

const BUILD_ID_RE = /^(\d{2})(\d{2})(\d{2})(\d{2})r(\d+)$/i

export function decodeBuildId(raw: string): DecodedBuildId | null {
  const m = BUILD_ID_RE.exec(raw.trim())
  if (!m) return null

  const [, lengthRaw, passesRaw, layersRaw, heightRaw, runRaw] = m
  const passes = Number(passesRaw)
  const layers = Number(layersRaw)
  const run = Number(runRaw)
  // `07` -> 7, `10` -> 10 — the workbook shorthand drops the leading zero.
  const heightTenths = Number(heightRaw)

  if (layers <= 0 || heightTenths <= 0) return null

  return {
    id: raw.trim(),
    lengthMm: Number(lengthRaw),
    passes,
    layers,
    layerHeightMm: heightTenths / 10,
    run,
    shorthand: `${heightTenths}r${run}_${passes}pass`,
    family: `${lengthRaw}${passesRaw}${layersRaw}${heightRaw}`,
  }
}

export function describeBuild(d: DecodedBuildId): string {
  return `${d.id} · ${d.layerHeightMm.toFixed(1)} mm × ${d.layers} layers · ${d.passes}-pass · R${d.run}`
}

/** Nominal built height in mm — the ~50 mm design invariant. */
export function targetHeightMm(d: DecodedBuildId): number {
  return Number((d.layers * d.layerHeightMm).toFixed(2))
}
