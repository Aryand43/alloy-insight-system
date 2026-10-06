import fs from 'node:fs/promises'
import path from 'node:path'
import type { BuildSummary } from '../../../src/domain/types.js'
import { decodeBuildId, describeBuild, targetHeightMm } from '../buildId.js'
import { readCouponQuality, readGomHeights } from '../parsers/xlsx.js'
import {
  COUPON_QUALITY_XLSX,
  DMG_DIR,
  GOM_DIR,
  GOM_FILES,
  KIV_DIR,
  MEANSIZE_DIR,
  MEANTEMP_DIR,
} from '../config.js'

export interface CatalogEntry extends BuildSummary {
  meanTempFile: string
  meanSizeFile: string
  /** Absolute path to the KIV folder holding per-layer histogram PNGs. */
  kivTempDir: string | null
  kivSizeDir: string | null
  /** Absolute path to the DMG MORI run folder, when one exists. */
  runDir: string | null
  /** Absolute path to the run's Data.dat, when present. */
  dataDatFile: string | null
  /** Absolute path to the run's Frames/ folder, when non-empty. */
  framesDir: string | null
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function isNonEmptyDir(p: string): Promise<boolean> {
  let dir
  try {
    dir = await fs.opendir(p)
  } catch {
    return false
  }
  // Read a single entry rather than listing — some Frames/ folders hold ~29k files.
  try {
    const first = await dir.read()
    return first !== null
  } finally {
    await dir.close().catch(() => {})
  }
}

async function loadQuality(): Promise<Map<string, 'best' | 'worst'>> {
  const map = new Map<string, 'best' | 'worst'>()
  if (!(await exists(COUPON_QUALITY_XLSX))) return map
  try {
    for (const row of await readCouponQuality(COUPON_QUALITY_XLSX)) {
      map.set(row.bestFamily, 'best')
      map.set(row.worstFamily, 'worst')
    }
  } catch (err) {
    console.warn(`[catalog] could not read COUPON QUALITY.xlsx: ${String(err)}`)
  }
  return map
}

/**
 * Measured top-face deviation per build, from the GOM reports.
 *
 * The reports are organised by pass group and sample label rather than by
 * build id: workbook `6010` plus sample `Z0.9R5` is build `60105609r5`. The
 * key here is `<layerHeightMm>|<run>` within a pass group, which is enough to
 * identify the build because a group never repeats an increment and run.
 */
async function loadGeometry(): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  for (const file of GOM_FILES) {
    const full = path.join(GOM_DIR, file)
    if (!(await exists(full))) continue
    // `GOM6004.xlsx` and `6010GOM.xlsx` — the group is the only 4-digit run.
    const group = /(\d{4})/.exec(file)?.[1]
    if (!group) continue
    try {
      for (const row of await readGomHeights(full)) {
        map.set(`${group}|${row.layerHeightMm}|${row.run}`, row.heightMm)
      }
    } catch (err) {
      console.warn(`[catalog] could not read ${file}: ${String(err)}`)
    }
  }
  return map
}

/** Maps `60047207r2` -> the `20230309_1947_60047207r2` run folder, if present. */
async function loadRunDirs(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  let entries: string[]
  try {
    entries = await fs.readdir(DMG_DIR)
  } catch {
    return map
  }
  for (const name of entries) {
    const m = /^\d{8}_\d{4}_(\w+)$/.exec(name)
    if (m) map.set(m[1].toLowerCase(), path.join(DMG_DIR, name))
  }
  return map
}

async function build(): Promise<CatalogEntry[]> {
  const files = await fs.readdir(MEANTEMP_DIR)
  const [quality, runDirs, geometry] = await Promise.all([
    loadQuality(),
    loadRunDirs(),
    loadGeometry(),
  ])

  const entries: CatalogEntry[] = []

  for (const file of files.sort()) {
    const m = /^meantemp_(\w+)\.xlsx$/i.exec(file)
    if (!m) continue

    const decoded = decodeBuildId(m[1])
    if (!decoded) {
      console.warn(`[catalog] skipping undecodable build id: ${m[1]}`)
      continue
    }

    const meanSizeFile = path.join(MEANSIZE_DIR, `meansize_${decoded.id}.xlsx`)
    if (!(await exists(meanSizeFile))) {
      console.warn(`[catalog] ${decoded.id}: no meansize file, skipping`)
      continue
    }

    const kivTempDir = path.join(KIV_DIR, `${decoded.id} temp`)
    const kivSizeDir = path.join(KIV_DIR, `${decoded.id} size`)
    const hasKivTemp = await exists(kivTempDir)
    const hasKivSize = await exists(kivSizeDir)

    const runDir = runDirs.get(decoded.id.toLowerCase()) ?? null
    const framesDir = runDir ? path.join(runDir, 'Frames') : null
    const hasRawFrames = framesDir ? await isNonEmptyDir(framesDir) : false

    // Frames alone are not enough: without Data.dat there is no z column, so
    // frames cannot be assigned to layers.
    const dataDatFile = runDir ? path.join(runDir, 'Data.dat') : null
    const hasDataDat = dataDatFile ? await exists(dataDatFile) : false
    const hasThermal = hasRawFrames && hasDataDat

    entries.push({
      id: decoded.id,
      label: describeBuild(decoded),
      lengthMm: decoded.lengthMm,
      passes: decoded.passes,
      layers: decoded.layers,
      layerHeightMm: decoded.layerHeightMm,
      run: decoded.run,
      shorthand: decoded.shorthand,
      targetHeightMm: targetHeightMm(decoded),
      hasKivImages: hasKivTemp,
      hasRawFrames,
      hasThermal,
      quality: quality.get(decoded.family) ?? null,
      geometryHeightDeviationMm:
        geometry.get(
          // Pass group is the length and pass digits, e.g. `6010`.
          `${decoded.lengthMm}${String(decoded.passes).padStart(2, '0')}|${decoded.layerHeightMm}|${decoded.run}`,
        ) ?? null,
      meanTempFile: path.join(MEANTEMP_DIR, file),
      meanSizeFile,
      kivTempDir: hasKivTemp ? kivTempDir : null,
      kivSizeDir: hasKivSize ? kivSizeDir : null,
      runDir,
      dataDatFile: hasDataDat ? dataDatFile : null,
      framesDir: hasRawFrames ? framesDir : null,
    })
  }

  if (!entries.length) {
    throw new Error(
      `No builds found under ${MEANTEMP_DIR}. Is BACKEND_DATA_DIR pointing at the Backend-Data folder?`,
    )
  }
  return entries
}

let cached: Promise<CatalogEntry[]> | null = null

export function getCatalog(): Promise<CatalogEntry[]> {
  if (!cached) {
    cached = build().catch((err) => {
      cached = null // let the next request retry rather than caching the failure
      throw err
    })
  }
  return cached
}

export async function getBuild(id: string): Promise<CatalogEntry | null> {
  const all = await getCatalog()
  const needle = id.trim().toLowerCase()
  return all.find((b) => b.id.toLowerCase() === needle) ?? null
}

/** Strips server-only fields before the catalog goes over the wire. */
export function toSummary(entry: CatalogEntry): BuildSummary {
  const {
    meanTempFile,
    meanSizeFile,
    kivTempDir,
    kivSizeDir,
    runDir,
    dataDatFile,
    framesDir,
    ...rest
  } = entry
  void meanTempFile
  void meanSizeFile
  void kivTempDir
  void kivSizeDir
  void runDir
  void dataDatFile
  void framesDir
  return rest
}
