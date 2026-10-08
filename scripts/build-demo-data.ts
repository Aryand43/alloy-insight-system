/**
 * Builds a small, representative copy of Backend-Data for a hosted demo.
 *
 * The full corpus is ~33 GB and cannot ship in a Vercel function (250 MB
 * limit). This copies:
 *   - every build's per-layer spreadsheets, KIV images and the quality sheet,
 *     so Process Insight works for all 26 builds (~6 MB);
 *   - one thermal build, a handful of layers, a sample of frames, so Alloy
 *     Insight has real frames to scrub (~72 MB).
 *
 * Frames are chosen with the app's own frame index, so the demo assigns
 * frames to layers exactly as the full dataset does. Output mirrors the
 * Backend-Data layout, so the server reads it unchanged via BACKEND_DATA_DIR.
 *
 * Run: npx tsx scripts/build-demo-data.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BACKEND_DATA_DIR,
  CAMERA_CALIBRATION,
  COUPON_QUALITY_XLSX,
  GOM_DIR,
  GOM_FILES,
  KIV_DIR,
  MEANSIZE_DIR,
  MEANTEMP_DIR,
  REPO_ROOT,
} from '../server/src/config'
import { getBuild, getCatalog } from '../server/src/services/catalog'
import { getFrameIndex } from '../server/src/services/frameIndex'
import { getLayerSeries } from '../server/src/services/layers'
import { buildAnomalyReport } from '../server/src/services/anomaly'
import type { AnomalyReport } from '../src/domain/types'

const OUT = path.join(REPO_ROOT, 'demo-data')

/** Best of the 10-pass group, and free of the corrupt frames found in 60106308r3. */
const THERMAL_BUILD = '60105609r5'
/**
 * How many layers of frames to ship, and at what sampling.
 *
 * Four layers at every 3rd frame (~3.4 Hz of the camera's 10.3 Hz) is what
 * fits: the whole CLI upload has to stay under Vercel Hobby's 100 MB source
 * limit, which is ~80 MB of data plus ~0.5 MB of code. A fifth layer pushes
 * the upload to ~98 MB, which is too close.
 *
 * Which four is decided by the anomaly model rather than fixed here — see
 * pickLayers.
 */
const LAYER_BUDGET = 4
const FLAGGED_LAYERS = 2
const FRAME_STEP = 3

/** The banner text lives in .env.demo; the script rewrites it so it cannot drift from the data. */
const ENV_DEMO = path.join(REPO_ROOT, '.env.demo')

/**
 * Which layers earn their place in the demo.
 *
 * The old fixed list (1, 2, 28, 56) was chosen before there was anything to
 * detect, and layer 1 is the cold start where the camera and the machine log
 * agree least. Now the model picks: the highest-scoring flagged layers, so the
 * demo opens on something worth looking at, plus layers well inside the build's
 * steady state to compare them against.
 *
 * Only layers that actually have frames are eligible.
 */
function pickLayers(
  report: AnomalyReport,
  available: number[],
): { layer: number; why: 'flagged' | 'steady' }[] {
  const eligible = new Set(available)
  const chosen: { layer: number; why: 'flagged' | 'steady' }[] = []

  for (const a of [...report.anomalies].sort((x, y) => y.score - x.score)) {
    if (chosen.length >= FLAGGED_LAYERS) break
    if (!eligible.has(a.layer) || chosen.some((c) => c.layer === a.layer)) continue
    chosen.push({ layer: a.layer, why: 'flagged' })
  }

  // Steady layers: spread through the part of the build past the ramp-up that
  // the model did not flag, so the comparison is not all from one height.
  const flaggedSet = new Set(report.anomalies.map((a) => a.layer))
  const steady = available
    .filter((l) => l > report.transition.endLayer && !flaggedSet.has(l))
    .sort((a, b) => a - b)
  const wanted = LAYER_BUDGET - chosen.length
  for (let i = 0; i < wanted && steady.length; i++) {
    const at = Math.round(((i + 1) / (wanted + 1)) * (steady.length - 1))
    const layer = steady[at]
    if (!chosen.some((c) => c.layer === layer)) chosen.push({ layer, why: 'steady' })
  }

  return chosen.sort((a, b) => a.layer - b.layer)
}

function ordinal(n: number): string {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

let files = 0
let bytes = 0

async function copyInto(src: string): Promise<void> {
  const rel = path.relative(BACKEND_DATA_DIR, src)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to copy a file outside Backend-Data: ${src}`)
  }
  const dest = path.join(OUT, rel)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
  files += 1
  bytes += (await fs.stat(src)).size
}

async function copyTree(dir: string): Promise<void> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    // Skip .DS_Store and Office lock files.
    if (entry.name.startsWith('.') || entry.name.startsWith('~$')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await copyTree(full)
    else if (entry.isFile()) await copyInto(full)
  }
}

async function main(): Promise<void> {
  if (path.basename(OUT) !== 'demo-data') {
    throw new Error(`Unexpected output directory: ${OUT}`)
  }
  await fs.rm(OUT, { recursive: true, force: true })

  // Process Insight — all builds.
  await copyTree(MEANTEMP_DIR)
  await copyTree(MEANSIZE_DIR)
  await copyTree(KIV_DIR)
  await copyInto(COUPON_QUALITY_XLSX)
  await copyInto(CAMERA_CALIBRATION)
  // Measured geometry for all 26 builds — a few hundred KB, and the only
  // ground truth in the demo that is independent of anything thermal.
  for (const file of GOM_FILES) await copyInto(path.join(GOM_DIR, file))

  // Alloy Insight — one build, selected layers, every other frame.
  const entry = await getBuild(THERMAL_BUILD)
  if (!entry?.hasThermal || !entry.dataDatFile) {
    throw new Error(`${THERMAL_BUILD} has no thermal frames in ${BACKEND_DATA_DIR}`)
  }
  await copyInto(entry.dataDatFile)

  const index = await getFrameIndex(entry)
  const report = buildAnomalyReport(await getLayerSeries(entry))
  const chosen = pickLayers(report, [...index.byLayer.keys()])
  console.log(
    `[demo] layers: ${chosen.map((c) => `${c.layer} (${c.why})`).join(', ')}`,
  )

  const layers: {
    layer: number
    why: string
    framesAvailable: number
    framesIncluded: number
  }[] = []
  for (const choice of chosen) {
    const layer = index.byLayer.get(choice.layer)
    if (!layer) throw new Error(`${THERMAL_BUILD} has no frames for layer ${choice.layer}`)
    const picked = layer.frames.filter((_, i) => i % FRAME_STEP === 0)
    for (const frame of picked) await copyInto(frame.file)
    layers.push({
      layer: choice.layer,
      why: choice.why,
      framesAvailable: layer.frames.length,
      framesIncluded: picked.length,
    })
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    note: 'Demo subset of Backend-Data. Unpublished research data: do not commit to a public repository.',
    thermal: { buildId: THERMAL_BUILD, frameStep: FRAME_STEP, layers },
    anomalyVerdict: report.verdict,
    totals: { files, bytes },
  }
  await fs.writeFile(
    path.join(OUT, 'DEMO_MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  const buildCount = (await getCatalog()).length
  const flaggedList = layers.filter((l) => l.why === 'flagged').map((l) => l.layer)
  const steadyList = layers.filter((l) => l.why !== 'flagged').map((l) => l.layer)
  const note = `Demo dataset: thermal frames for build ${THERMAL_BUILD}, layers ${flaggedList.join(', ')} flagged by the anomaly model and ${steadyList.join(', ')} within steady state, every ${ordinal(FRAME_STEP)} frame. All ${buildCount} builds are available in Process Insight.`
  const env = await fs.readFile(ENV_DEMO, 'utf8')
  const line = `VITE_DEMO_NOTE="${note}"`
  await fs.writeFile(
    ENV_DEMO,
    /^VITE_DEMO_NOTE=.*$/m.test(env)
      ? env.replace(/^VITE_DEMO_NOTE=.*$/m, line)
      : `${env.trimEnd()}\n${line}\n`,
  )

  console.log(`demo-data: ${files} files, ${(bytes / 1e6).toFixed(1)} MB`)
  console.log(`banner: ${note}`)
  for (const l of layers) {
    console.log(`  ${THERMAL_BUILD} layer ${l.layer}: ${l.framesIncluded} of ${l.framesAvailable} frames`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
