/**
 * Fits the anomaly model and writes it to server/src/models/anomalyModel.ts.
 *
 * The corpus has no anomaly labels — only COUPON QUALITY.xlsx, which names
 * one best and one worst coupon family per pass group (6 families of 26
 * builds). Six labels cannot supervise a classifier, so the model is fitted
 * the other way round: it learns what the best-ranked coupons' steady state
 * looks like, and anything far from that is an anomaly.
 *
 * That makes validation possible rather than circular. The model is refitted
 * three times holding out one best family each time, and scored on the
 * held-out best coupons against the worst ones. Those numbers are written
 * into the model file and surfaced in the UI — including where separation is
 * weak.
 *
 * Run: npx tsx scripts/train-anomaly-model.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { REPO_ROOT } from '../server/src/config'
import { getCatalog, type CatalogEntry } from '../server/src/services/catalog'
import { getLayerSeries } from '../server/src/services/layers'
import { getFrameIndex } from '../server/src/services/frameIndex'
import {
  FRAME_FEATURES,
  LAYER_FEATURES,
  frameFeatures,
  frameReference,
  layerFeatures,
} from '../server/src/services/anomalyFeatures'
import { fit, score, type GaussianModel } from '../server/src/services/mahalanobis'

const OUT = path.join(REPO_ROOT, 'server/src/models/anomalyModel.ts')

/** Coupon family, e.g. `60105609` from `60105609r5`. */
function family(buildId: string): string {
  return buildId.replace(/r\d+$/i, '')
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

async function layerVectors(entry: CatalogEntry) {
  const series = await getLayerSeries(entry)
  const f = layerFeatures(series)
  return { entry, series, f, steady: f.vectors.slice(f.transition) }
}

function flagRate(model: GaussianModel, vectors: number[][]): number {
  if (!vectors.length) return 0
  const flagged = vectors.filter((v) => score(model, v) > model.alertThreshold).length
  return (100 * flagged) / vectors.length
}

async function main(): Promise<void> {
  const catalog = await getCatalog()
  const prepared = await Promise.all(catalog.map(layerVectors))

  const bestFamilies = [
    ...new Set(prepared.filter((p) => p.entry.quality === 'best').map((p) => family(p.entry.id))),
  ].sort()
  const worst = prepared.filter((p) => p.entry.quality === 'worst')

  if (bestFamilies.length < 2) {
    throw new Error('need at least two best-ranked coupon families to validate')
  }

  console.log(`[train] ${prepared.length} builds; best families ${bestFamilies.join(', ')}`)
  for (const p of prepared) {
    console.log(
      `  ${p.entry.id}  ${(p.entry.quality ?? '-').padEnd(5)} transition = layers 1-${p.f.transition} of ${p.series.points.length}`,
    )
  }

  /* --------------------------------------------- layer model + validation -- */

  const trainOn = (families: string[]) =>
    prepared
      .filter((p) => families.includes(family(p.entry.id)))
      .flatMap((p) => p.steady)

  const validation: string[] = []
  for (const held of bestFamilies) {
    const model = fit(trainOn(bestFamilies.filter((f) => f !== held)), LAYER_FEATURES)
    const heldRates = prepared
      .filter((p) => family(p.entry.id) === held)
      .map((p) => flagRate(model, p.steady))
    const worstRates = worst.map((p) => flagRate(model, p.steady))
    validation.push(
      `held out ${held}: best ${pct(Math.min(...heldRates))}-${pct(Math.max(...heldRates))}, ` +
        `worst ${pct(Math.min(...worstRates))}-${pct(Math.max(...worstRates))}`,
    )
    console.log(`[train] ${validation[validation.length - 1]}`)
  }

  const layerModel = fit(trainOn(bestFamilies), LAYER_FEATURES)
  const layerTrainRows = trainOn(bestFamilies).length
  console.log(
    `[train] layer model: ${layerTrainRows} steady layers, watch ${layerModel.watchThreshold.toFixed(2)}, alert ${layerModel.alertThreshold.toFixed(2)}`,
  )
  console.log(`[train] flag rate by label (final model):`)
  const byLabel: Record<string, number[]> = { best: [], worst: [], unlabelled: [] }
  for (const p of prepared) {
    byLabel[p.entry.quality ?? 'unlabelled'].push(flagRate(layerModel, p.steady))
  }
  for (const [label, rates] of Object.entries(byLabel)) {
    if (!rates.length) continue
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length
    console.log(
      `  ${label.padEnd(10)} n=${String(rates.length).padStart(2)}  mean ${pct(mean)}  range ${pct(Math.min(...rates))}-${pct(Math.max(...rates))}`,
    )
  }

  /* --------------------------------------------- frame model + validation -- */

  const thermal = prepared.filter((p) => p.entry.hasThermal)
  const frameRows: number[][] = []
  const frameRates: { id: string; quality: string; rate: number }[] = []
  const prefitRows: { id: string; quality: string; vectors: number[][] }[] = []

  for (const p of thermal) {
    const index = await getFrameIndex(p.entry)
    const ref = frameReference(index.layers, p.f.transition)
    const vectors = index.layers
      .filter((l) => l.layer > p.f.transition)
      .flatMap((l) => frameFeatures(l.frames, ref))
    prefitRows.push({ id: p.entry.id, quality: p.entry.quality ?? '-', vectors })
    if (p.entry.quality === 'best') frameRows.push(...vectors)
  }

  if (!frameRows.length) {
    throw new Error('no best-ranked build has frame data — cannot fit the frame model')
  }

  const frameModel = fit(frameRows, FRAME_FEATURES)
  for (const r of prefitRows) {
    frameRates.push({ id: r.id, quality: r.quality, rate: flagRate(frameModel, r.vectors) })
  }
  console.log(
    `\n[train] frame model: ${frameRows.length} frames from best-ranked runs, alert ${frameModel.alertThreshold.toFixed(2)}`,
  )
  for (const r of frameRates) {
    console.log(`  ${r.id.padEnd(12)} ${r.quality.padEnd(5)} ${pct(r.rate)} of frames flagged`)
  }

  const bestFrameRates = frameRates.filter((r) => r.quality === 'best').map((r) => r.rate)
  const worstFrameRates = frameRates.filter((r) => r.quality === 'worst').map((r) => r.rate)
  const frameSeparates =
    worstFrameRates.length > 0 && Math.min(...worstFrameRates) > Math.max(...bestFrameRates)
  const frameValidation = frameSeparates
    ? `Frame flag rate separates ranked coupons: best ${pct(Math.max(...bestFrameRates))} or less, worst ${pct(Math.min(...worstFrameRates))} or more.`
    : `Localises deviation within a layer; it does not predict coupon quality — flag rates are ${pct(Math.min(...bestFrameRates))}-${pct(Math.max(...bestFrameRates))} for best-ranked runs and ${worstFrameRates.length ? `${pct(Math.min(...worstFrameRates))}-${pct(Math.max(...worstFrameRates))}` : 'unmeasured'} for worst-ranked.`
  console.log(`[train] frame verdict: ${frameValidation}`)

  /* ------------------------------------------------------------- emit -- */

  const layerValidation =
    `Fitted on the steady-state layers of the coupons ranked best in COUPON QUALITY.xlsx. ` +
    `Held out by family: ${validation.join('; ')}.`

  const body = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`npx tsx scripts/train-anomaly-model.ts\` to refit.
 *
 * Fitted ${new Date().toISOString().slice(0, 10)} on Backend-Data.
 *
 * Layer model: ${layerTrainRows} steady-state layers from the best-ranked
 * coupon families (${bestFamilies.join(', ')}).
 * ${validation.map((v) => `  - ${v}`).join('\n * ')}
 *
 * Frame model: ${frameRows.length} frames from the best-ranked runs with
 * frame data. ${frameValidation}
 */
import type { GaussianModel } from '../services/mahalanobis.js'

export const LAYER_MODEL: GaussianModel = ${JSON.stringify(layerModel, null, 2)}

export const FRAME_MODEL: GaussianModel = ${JSON.stringify(frameModel, null, 2)}

export const MODEL_META = {
  name: 'Steady-state deviation model',
  layerTrainedOn:
    ${JSON.stringify(`${layerTrainRows} steady-state layers from the coupons ranked best (${bestFamilies.join(', ')})`)},
  layerValidation: ${JSON.stringify(layerValidation)},
  frameValidation: ${JSON.stringify(frameValidation)},
} as const
`

  await fs.writeFile(OUT, body, 'utf8')
  console.log(`\n[train] wrote ${path.relative(REPO_ROOT, OUT)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
