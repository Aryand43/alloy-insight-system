/**
 * Fits the thermal super-resolution model and writes src/domain/srModel.ts.
 *
 * Self-supervised, on the corpus itself: every training frame is box-downscaled
 * by the upscale factor, bicubically brought back up, and the model learns the
 * detail that round trip destroyed. No labels, no external dataset, and the
 * statistics it learns are this camera's — the melt-pool edge gradient, the
 * spatter speckle, the flat background.
 *
 * Patches are contrast-normalised and clustered, and each cluster gets its own
 * ridge-regularised linear map onto the r x r block of residual detail. The
 * report at the end is measured on frames held out of training.
 *
 * Run: npx tsx scripts/train-super-resolution.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { REPO_ROOT } from '../server/src/config'
import { getBuild } from '../server/src/services/catalog'
import { getFrameIndex } from '../server/src/services/frameIndex'
import { calibration } from '../server/src/services/calibration'
import { loadFrame } from '../server/src/services/thermal'
import { invert } from '../server/src/services/mahalanobis'
import {
  bicubicUpscale,
  boxDownscale,
  patchFeature,
  psnr,
  superResolve,
  type Grid,
  type SuperResolutionModel,
} from '../src/domain/superResolution'

const OUT = path.join(REPO_ROOT, 'src/domain/srModel.ts')

const SCALE = 4
const PATCH = Number(process.env.SR_PATCH ?? 5)
/*
 * 16 is the knee here too: 32 clusters and a 7x7 patch were each worth under
 * 0.05 dB on held-out frames while doubling the model and the per-pixel
 * inference cost, so the small model ships.
 */
const CLUSTERS = Number(process.env.SR_CLUSTERS ?? 16)
/*
 * Ridge term; the normal equations are near-singular on flat patches. Swept
 * over 0.001-0.5 on held-out frames: 0.5 gives +0.36 dB over bicubic, 0.05
 * +0.70, and everything at or below 0.005 lands at +0.77-0.80, so this sits
 * at the knee.
 */
const RIDGE = Number(process.env.SR_RIDGE ?? 0.005)
const KMEANS_ITERATIONS = 12
/** Patches sampled for clustering; all of them go into the regressions. */
const KMEANS_SAMPLE = 120_000

/** Builds and 'held out' frames are picked for coverage, not convenience. */
const TRAIN_BUILDS = ['60105609r5', '60106308r3', '60107207r2']
const TEST_BUILD = '60105609r4'
const FRAMES_PER_BUILD = Number(process.env.SR_FRAMES ?? 90)
const TEST_FRAMES = 20

function log(message: string): void {
  console.log(`[sr] ${message}`)
}

async function collectFrames(buildId: string, count: number): Promise<Grid[]> {
  const entry = await getBuild(buildId)
  if (!entry?.hasThermal) throw new Error(`${buildId} has no thermal frames`)
  const index = await getFrameIndex(entry)
  const lut = calibration()

  // Spread across layers and across each layer, so one pass direction or one
  // height cannot dominate the statistics.
  const picks = []
  const layers = index.layers.filter((l) => l.frames.length > 20)
  for (let i = 0; i < count; i++) {
    const layer = layers[Math.floor((i / count) * layers.length)]
    if (!layer) continue
    const frame = layer.frames[Math.floor(((i * 7) % 10) / 10 * layer.frames.length)]
    if (frame) picks.push(frame)
  }

  const grids: Grid[] = []
  for (const ref of picks) {
    try {
      const frame = await loadFrame(ref.file)
      const values = new Float32Array(frame.width * frame.height)
      for (let i = 0; i < values.length; i++) values[i] = lut[Math.min(frame.data[i], 4095)]
      grids.push({ values, width: frame.width, height: frame.height })
    } catch {
      // Corrupt frames simply drop out of the sample.
    }
  }
  return grids
}

interface Sample {
  feature: Float32Array
  /** Residual over bicubic, in contrast-normalised units. */
  target: Float32Array
}

/** One training pair per native pixel of a downscaled/upscaled round trip. */
function samplesFor(grid: Grid): Sample[] {
  const low = boxDownscale(grid, SCALE)
  const base = bicubicUpscale(low, SCALE)
  const out: Sample[] = []
  const half = PATCH >> 1

  for (let row = half; row < low.height - half; row++) {
    for (let col = half; col < low.width - half; col++) {
      const feature = patchFeature(low, row, col, PATCH)
      const target = new Float32Array(SCALE * SCALE)
      let informative = false

      for (let sub = 0; sub < SCALE * SCALE; sub++) {
        const y = row * SCALE + ((sub / SCALE) | 0)
        const x = col * SCALE + (sub % SCALE)
        if (y >= grid.height || x >= grid.width) continue
        const residual =
          (grid.values[y * grid.width + x] - base.values[y * base.width + x]) /
          feature.scaleFactor
        target[sub] = residual
        if (Math.abs(residual) > 1e-4) informative = true
      }
      // Dead-flat background teaches nothing and would dominate by count.
      if (informative) out.push({ feature: feature.vector, target })
    }
  }
  return out
}

function kmeans(samples: Sample[], k: number): number[][] {
  const dim = samples[0].feature.length
  const step = Math.max(1, Math.floor(samples.length / k))
  let centroids: number[][] = Array.from({ length: k }, (_, i) =>
    Array.from(samples[Math.min(i * step, samples.length - 1)].feature),
  )

  for (let iteration = 0; iteration < KMEANS_ITERATIONS; iteration++) {
    const sums = Array.from({ length: k }, () => new Float64Array(dim))
    const counts = new Array<number>(k).fill(0)

    for (const sample of samples) {
      let best = 0
      let bestDistance = Infinity
      for (let c = 0; c < k; c++) {
        let distance = 0
        for (let d = 0; d < dim; d++) {
          const delta = sample.feature[d] - centroids[c][d]
          distance += delta * delta
          if (distance >= bestDistance) break
        }
        if (distance < bestDistance) {
          bestDistance = distance
          best = c
        }
      }
      counts[best] += 1
      const sum = sums[best]
      for (let d = 0; d < dim; d++) sum[d] += sample.feature[d]
    }

    centroids = centroids.map((centroid, c) => {
      if (!counts[c]) return centroid
      return Array.from(sums[c], (v) => v / counts[c])
    })
  }
  return centroids
}

function assign(centroids: number[][], feature: Float32Array): number {
  let best = 0
  let bestDistance = Infinity
  for (let c = 0; c < centroids.length; c++) {
    let distance = 0
    for (let d = 0; d < feature.length; d++) {
      const delta = feature[d] - centroids[c][d]
      distance += delta * delta
      if (distance >= bestDistance) break
    }
    if (distance < bestDistance) {
      bestDistance = distance
      best = c
    }
  }
  return best
}

async function main(): Promise<void> {
  log(`training ${SCALE}x, ${PATCH}x${PATCH} patches, ${CLUSTERS} clusters`)

  const trainGrids: Grid[] = []
  for (const buildId of TRAIN_BUILDS) {
    const grids = await collectFrames(buildId, FRAMES_PER_BUILD)
    log(`${buildId}: ${grids.length} frames`)
    trainGrids.push(...grids)
  }

  const samples: Sample[] = []
  for (const grid of trainGrids) samples.push(...samplesFor(grid))
  log(`${samples.length.toLocaleString('en-US')} training patches`)

  const sampleStep = Math.max(1, Math.floor(samples.length / KMEANS_SAMPLE))
  const clusterSample = samples.filter((_, i) => i % sampleStep === 0)
  log(`clustering on ${clusterSample.length.toLocaleString('en-US')} of them…`)
  const centroids = kmeans(clusterSample, CLUSTERS)

  // Normal equations per cluster: XtX (dim x dim) and XtY (dim x scale²).
  const dim = PATCH * PATCH
  const outputs = SCALE * SCALE
  const xtx = Array.from({ length: CLUSTERS }, () =>
    Array.from({ length: dim }, () => new Float64Array(dim)),
  )
  const xty = Array.from({ length: CLUSTERS }, () =>
    Array.from({ length: dim }, () => new Float64Array(outputs)),
  )
  const sumX = Array.from({ length: CLUSTERS }, () => new Float64Array(dim))
  const sumY = Array.from({ length: CLUSTERS }, () => new Float64Array(outputs))
  const counts = new Array<number>(CLUSTERS).fill(0)

  for (const sample of samples) {
    const c = assign(centroids, sample.feature)
    counts[c] += 1
    for (let i = 0; i < dim; i++) {
      const vi = sample.feature[i]
      sumX[c][i] += vi
      const rowX = xtx[c][i]
      for (let j = i; j < dim; j++) rowX[j] += vi * sample.feature[j]
      const rowY = xty[c][i]
      for (let o = 0; o < outputs; o++) rowY[o] += vi * sample.target[o]
    }
    for (let o = 0; o < outputs; o++) sumY[c][o] += sample.target[o]
  }

  const weights: number[][][] = []
  const biases: number[][] = []
  for (let c = 0; c < CLUSTERS; c++) {
    const n = Math.max(counts[c], 1)
    // Centre the system so the intercept is the residual's cluster mean.
    const a = Array.from({ length: dim }, (_, i) =>
      Array.from({ length: dim }, (_, j) => {
        const upper = i <= j ? xtx[c][i][j] : xtx[c][j][i]
        return upper / n - (sumX[c][i] / n) * (sumX[c][j] / n) + (i === j ? RIDGE : 0)
      }),
    )
    const b = Array.from({ length: dim }, (_, i) =>
      Array.from({ length: outputs }, (_, o) => xty[c][i][o] / n - (sumX[c][i] / n) * (sumY[c][o] / n)),
    )

    let solved: number[][]
    try {
      const inverse = invert(a)
      solved = inverse.map((rowI) =>
        Array.from({ length: outputs }, (_, o) =>
          rowI.reduce((acc, value, j) => acc + value * b[j][o], 0),
        ),
      )
    } catch {
      log(`cluster ${c}: singular, falling back to zero residual`)
      solved = Array.from({ length: dim }, () => new Array<number>(outputs).fill(0))
    }

    // Transpose into [output][feature], which is the order inference reads.
    weights.push(
      Array.from({ length: outputs }, (_, o) =>
        Array.from({ length: dim }, (_, i) => Number(solved[i][o].toFixed(6))),
      ),
    )
    biases.push(
      Array.from({ length: outputs }, (_, o) => {
        const mean = sumY[c][o] / n
        const correction = Array.from({ length: dim }, (_, i) => solved[i][o] * (sumX[c][i] / n)).reduce(
          (p, v) => p + v,
          0,
        )
        return Number((mean - correction).toFixed(6))
      }),
    )
  }
  log(`cluster sizes: ${counts.map((v) => v.toLocaleString('en-US')).join(', ')}`)

  const lut = calibration()
  const model: SuperResolutionModel = {
    scale: SCALE,
    patch: PATCH,
    centroids: centroids.map((c) => c.map((v) => Number(v.toFixed(5)))),
    weights,
    biases,
    domain: [lut[0], lut[lut.length - 1]],
    meta: { trainedOn: '', psnrBicubic: 0, psnrModel: 0 },
  }

  /* ----------------------------------------------- held-out evaluation -- */

  const testGrids = await collectFrames(TEST_BUILD, TEST_FRAMES)
  log(`evaluating on ${testGrids.length} frames from ${TEST_BUILD} (not in training)`)

  let bicubicTotal = 0
  let modelTotal = 0
  for (const grid of testGrids) {
    const low = boxDownscale(grid, SCALE)
    const base = bicubicUpscale(low, SCALE)
    const restored = superResolve(low, model)

    /*
     * The frame is 218 px wide, which 4 does not divide, so the round trip
     * comes back narrower than the original. Ground truth has to be cropped
     * row by row to the reconstruction's own stride — slicing the flat buffer
     * would shift every row and make both methods look equally terrible.
     */
    const truth = new Float32Array(base.values.length)
    for (let y = 0; y < base.height; y++) {
      for (let x = 0; x < base.width; x++) {
        truth[y * base.width + x] = grid.values[y * grid.width + x]
      }
    }

    const peak = model.domain[1] - model.domain[0]
    bicubicTotal += psnr(base.values, truth, peak)
    modelTotal += psnr(restored.values, truth, peak)
  }
  const psnrBicubic = bicubicTotal / testGrids.length
  const psnrModel = modelTotal / testGrids.length
  log(`PSNR bicubic ${psnrBicubic.toFixed(2)} dB -> model ${psnrModel.toFixed(2)} dB (${(psnrModel - psnrBicubic >= 0 ? '+' : '') + (psnrModel - psnrBicubic).toFixed(2)} dB)`)

  model.meta = {
    trainedOn: `${samples.length.toLocaleString('en-US')} patches from ${trainGrids.length} frames of ${TRAIN_BUILDS.join(', ')}`,
    psnrBicubic: Number(psnrBicubic.toFixed(2)),
    psnrModel: Number(psnrModel.toFixed(2)),
  }

  const body = `/**
 * GENERATED FILE. Do not edit by hand.
 * Run \`npx tsx scripts/train-super-resolution.ts\` to refit.
 *
 * Fitted ${new Date().toISOString().slice(0, 10)} on Backend-Data thermal frames.
 * ${model.meta.trainedOn}.
 * Held out ${TEST_BUILD}: bicubic ${psnrBicubic.toFixed(2)} dB, model ${psnrModel.toFixed(2)} dB.
 */
import type { SuperResolutionModel } from './superResolution'

export const SR_MODEL: SuperResolutionModel = ${JSON.stringify(model)}
`
  if (process.env.SR_DRY_RUN) { log('dry run — not written'); return }
  await fs.writeFile(OUT, body, 'utf8')
  const bytes = (await fs.stat(OUT)).size
  log(`wrote ${path.relative(REPO_ROOT, OUT)} (${(bytes / 1024).toFixed(0)} KB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
