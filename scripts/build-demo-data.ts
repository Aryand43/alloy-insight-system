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
  KIV_DIR,
  MEANSIZE_DIR,
  MEANTEMP_DIR,
  REPO_ROOT,
} from '../server/src/config'
import { getBuild, getCatalog } from '../server/src/services/catalog'
import { getFrameIndex } from '../server/src/services/frameIndex'

const OUT = path.join(REPO_ROOT, 'demo-data')

/** Best of the 10-pass group, and free of the corrupt frames found in 60106308r3. */
const THERMAL_BUILD = '60105609r5'
/**
 * Cold start into the adjacent layer (so layer roll-over can be shown), steady
 * state, final layer — every 3rd frame, ~3.4 Hz of the camera's 10.3 Hz.
 *
 * Sized so the whole CLI upload stays under Vercel Hobby's 100 MB source
 * limit: ~80 MB of data plus ~0.5 MB of code. Keeping layer 3 as well pushes
 * the upload to ~98 MB, which is too close.
 */
const LAYERS = [1, 2, 28, 56]
const FRAME_STEP = 3

/** The banner text lives in .env.demo; the script rewrites it so it cannot drift from the data. */
const ENV_DEMO = path.join(REPO_ROOT, '.env.demo')

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

  // Alloy Insight — one build, selected layers, every other frame.
  const entry = await getBuild(THERMAL_BUILD)
  if (!entry?.hasThermal || !entry.dataDatFile) {
    throw new Error(`${THERMAL_BUILD} has no thermal frames in ${BACKEND_DATA_DIR}`)
  }
  await copyInto(entry.dataDatFile)

  const index = await getFrameIndex(entry)
  const layers: { layer: number; framesAvailable: number; framesIncluded: number }[] = []
  for (const n of LAYERS) {
    const layer = index.byLayer.get(n)
    if (!layer) throw new Error(`${THERMAL_BUILD} has no frames for layer ${n}`)
    const picked = layer.frames.filter((_, i) => i % FRAME_STEP === 0)
    for (const frame of picked) await copyInto(frame.file)
    layers.push({
      layer: n,
      framesAvailable: layer.frames.length,
      framesIncluded: picked.length,
    })
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    note: 'Demo subset of Backend-Data. Unpublished research data — do not commit to a public repository.',
    thermal: { buildId: THERMAL_BUILD, frameStep: FRAME_STEP, layers },
    totals: { files, bytes },
  }
  await fs.writeFile(
    path.join(OUT, 'DEMO_MANIFEST.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  const buildCount = (await getCatalog()).length
  const note = `Demo dataset: thermal frames for build ${THERMAL_BUILD} (layers ${LAYERS.join(', ')}; every ${ordinal(FRAME_STEP)} frame). All ${buildCount} builds are available in Process Insight.`
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
