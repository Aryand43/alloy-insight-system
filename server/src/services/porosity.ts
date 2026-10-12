import type {
  PorosityIndicator,
  PorosityLayerRisk,
  PorosityReport,
} from '../../../src/domain/types.js'
import { readDataDat } from '../parsers/dataDat.js'
import type { CatalogEntry } from './catalog.js'
import { layerFrameAnomalies } from './anomaly.js'
import { frameReference, layerFeatures } from './anomalyFeatures.js'
import { getFrameIndex, type FrameIndex } from './frameIndex.js'
import { getLayerSeries } from './layers.js'
import { median } from './mahalanobis.js'
import { poolReference, type ThresholdChoice } from './thermal.js'

/**
 * Melt-pool conditions associated with pore formation.
 *
 * This exists because the pain point industry named is porosity, not
 * geometric accuracy: overbuild and machining absorb a wall that comes out a
 * millimetre short, while a pore in the first layer is invisible until the
 * part fails. What this corpus does not yet have is measured porosity, so
 * nothing here predicts a pore. It measures the conditions under which pores
 * are known to form, per layer and in machine coordinates, so that when the
 * X-ray results arrive there is something concrete to correlate them against.
 *
 * Every indicator states its own mechanism and its own validation status, and
 * the report refuses to combine them into a single score: a made-up weighting
 * would look like a prediction and carry none of the evidence.
 */

/** A pool this far below the build's steady state is treated as undersized. */
const UNDERSIZED_FRACTION = 0.8
/** And this far below the steady-state temperature, as cold. */
const COLD_FRACTION = 0.97

const VALIDATION_NOTE =
  'None of these indicators has been checked against measured porosity. ' +
  'The X-ray analysis of these coupons is still being run; once it is, each ' +
  'indicator can be correlated against the pores actually found, and the ones ' +
  'that hold up become a predictor. Until then these are measured conditions, ' +
  'not predictions.'

/**
 * Track spacing, measured from the machine's own y positions.
 *
 * The passes within a layer sit at distinct y values, so the spacing is the
 * gap between neighbouring tracks. Taken from a mid-build layer, where the
 * process is steady.
 */
function trackSpacing(
  table: Awaited<ReturnType<typeof readDataDat>>,
  entry: CatalogEntry,
): number | null {
  const { y, z, meltpoolSize } = table.data
  const target = 0.005 + Math.floor(entry.layers / 2) * entry.layerHeightMm
  const tolerance = entry.layerHeightMm / 2

  const seen: number[] = []
  for (let i = 0; i < table.rowCount; i++) {
    if (meltpoolSize[i] <= 0) continue
    if (Math.abs(z[i] - target) > tolerance) continue
    seen.push(y[i])
  }
  if (seen.length < 20) return null

  // Collapse the samples into tracks, then take the median gap between them.
  const sorted = [...new Set(seen.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b)
  const tracks: number[] = []
  for (const value of sorted) {
    if (!tracks.length || Math.abs(value - tracks[tracks.length - 1]) > 0.3) tracks.push(value)
  }
  if (tracks.length < 3) return null

  const gaps: number[] = []
  for (let i = 1; i < tracks.length; i++) gaps.push(tracks[i] - tracks[i - 1])
  return median(gaps)
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function layerRisks(
  index: FrameIndex,
  transition: number,
): { layers: PorosityLayerRisk[]; instabilityPct: number } {
  const sizes: number[] = []
  const temps: number[] = []
  for (const layer of index.layers) {
    if (layer.layer <= transition) continue
    for (const frame of layer.frames) {
      sizes.push(frame.meltpoolSizePx)
      temps.push(frame.meltpoolTempC)
    }
  }
  const steadySize = median(sizes)
  const steadyTemp = median(temps)
  const reference = frameReference(index.layers, transition)

  let deviatingTotal = 0
  let frameTotal = 0

  const layers = index.layers.map((layer) => {
    const undersized = layer.frames.filter(
      (f) => f.meltpoolSizePx < steadySize * UNDERSIZED_FRACTION,
    )
    const cold = layer.frames.filter((f) => f.meltpoolTempC < steadyTemp * COLD_FRACTION)
    const detail = layerFrameAnomalies(layer, reference)
    deviatingTotal += detail.anomalies.length
    frameTotal += layer.frames.length

    // The smallest pool in the layer is where a lack-of-fusion pore would sit.
    const worstFrame = layer.frames.reduce(
      (worst, f) => (!worst || f.meltpoolSizePx < worst.meltpoolSizePx ? f : worst),
      layer.frames[0],
    )

    return {
      layer: layer.layer,
      zMm: round(layer.zMm),
      undersizedPct: layer.frames.length
        ? round((100 * undersized.length) / layer.frames.length, 1)
        : 0,
      coldPct: layer.frames.length ? round((100 * cold.length) / layer.frames.length, 1) : 0,
      deviatingPct: detail.flaggedPct,
      worst: worstFrame
        ? {
            xMm: round(worstFrame.xMm),
            yMm: round(worstFrame.yMm),
            zMm: round(worstFrame.zMm),
            sizePx: Math.round(worstFrame.meltpoolSizePx),
          }
        : null,
    }
  })

  return {
    layers,
    instabilityPct: frameTotal ? round((100 * deviatingTotal) / frameTotal, 1) : 0,
  }
}

export async function buildPorosityReport(
  entry: CatalogEntry,
  threshold: ThresholdChoice,
): Promise<PorosityReport> {
  const series = await getLayerSeries(entry)
  const { transition } = layerFeatures(series)

  let layers: PorosityLayerRisk[] = []
  let instabilityPct = 0
  let spacing: number | null = null
  let widthMm: number | null = null

  if (entry.hasThermal && entry.dataDatFile) {
    const index = await getFrameIndex(entry)
    const risks = layerRisks(index, transition)
    layers = risks.layers
    instabilityPct = risks.instabilityPct

    spacing = trackSpacing(await readDataDat(entry.dataDatFile), entry)

    // Pool width comes from segmenting a sample of frames at the tracked
    // boundary, the same measurement the melt-pool panel reports.
    const eligible = index.layers.filter((l) => l.layer > transition)
    const sample = eligible
      .filter((_, i) => i % Math.max(1, Math.floor(eligible.length / 12)) === 0)
      .map((l) => l.frames[Math.floor(l.frames.length / 2)])
      .filter(Boolean)
    const reference = await poolReference(entry.id, threshold.count, sample)
    widthMm = reference ? round(reference.widthMm, 3) : null
  }

  const overlapRatio =
    spacing !== null && widthMm ? round(1 - spacing / widthMm, 3) : null

  const indicators: PorosityIndicator[] = [
    {
      id: 'overlap',
      label: 'Track overlap',
      value: overlapRatio === null ? 0 : round(overlapRatio * 100, 1),
      unit: '%',
      higherIsWorse: false,
      mechanism:
        'Neighbouring passes must remelt each other. Where overlap falls toward zero the ' +
        'material between tracks is never fully melted, which is how lack-of-fusion pores form.',
      validation:
        overlapRatio === null
          ? 'Needs a machine log and thermal frames; this build has neither.'
          : 'Measured, not validated: track spacing from the machine log against the melt-pool ' +
            'width measured on the frames.',
      available: overlapRatio !== null,
    },
    {
      id: 'undersized',
      label: 'Undersized-pool frames',
      value: layers.length
        ? round(median(layers.filter((l) => l.layer > transition).map((l) => l.undersizedPct)), 1)
        : 0,
      unit: '% of frames',
      higherIsWorse: true,
      mechanism:
        'A pool smaller than the build normally holds has less melt to fill the gap behind it, ' +
        'the condition associated with lack-of-fusion porosity.',
      validation: layers.length
        ? 'Measured per layer from the logged melt-pool area; not validated against pores.'
        : 'Needs thermal frames; this build has none.',
      available: layers.length > 0,
    },
    {
      id: 'coldPool',
      label: 'Cold-pool frames',
      value: layers.length
        ? round(median(layers.filter((l) => l.layer > transition).map((l) => l.coldPct)), 1)
        : 0,
      unit: '% of frames',
      higherIsWorse: true,
      mechanism:
        'A cooler pool solidifies sooner and traps what has not escaped, which is associated ' +
        'with gas porosity as well as poor fusion.',
      validation: layers.length
        ? 'Measured per layer from the logged melt-pool temperature; not validated against pores.'
        : 'Needs thermal frames; this build has none.',
      available: layers.length > 0,
    },
    {
      id: 'instability',
      label: 'Melt-pool instability',
      value: instabilityPct,
      unit: '% of frames',
      higherIsWorse: true,
      mechanism:
        'Rapid swings in pool size and temperature indicate an unsteady process, under which ' +
        'both keyhole collapse and lack of fusion become more likely.',
      validation: layers.length
        ? 'From the frame-level deviation model. Measured across the seven logged runs it did ' +
          'not separate the coupons ranked best from worst, so treat it as a process signal ' +
          'rather than a quality one.'
        : 'Needs thermal frames; this build has none.',
      available: layers.length > 0,
    },
  ]

  return {
    buildId: entry.id,
    indicators,
    layers,
    trackSpacingMm: spacing === null ? null : round(spacing, 3),
    poolWidthMm: widthMm,
    overlapRatio,
    validationNote: VALIDATION_NOTE,
  }
}
