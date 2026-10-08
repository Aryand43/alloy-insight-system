import { readDataDat, readDataDatHeader } from '../parsers/dataDat.js'
import type { CatalogEntry } from './catalog.js'
import { median } from './mahalanobis.js'

/**
 * The process settings a build was run with.
 *
 * Two sources, kept apart on purpose. Geometry is decoded from the build id
 * and is known for all 26 coupons; everything else comes from the run's own
 * `Data.dat`, which only seven of them have. Nothing is carried from one build
 * to another.
 */
export interface ProcessParameters {
  buildId: string
  /** Always known, from the build id. */
  nominal: {
    lengthMm: number
    passesPerLayer: number
    layers: number
    layerIncrementMm: number
    targetHeightMm: number
  }
  /** Present only where the machine wrote a run log. */
  logged: {
    programme: string | null
    startLaserPowerW: number | null
    maxLaserPowerW: number | null
    /** Median of the power the controller actually held during deposition. */
    medianLaserPowerW: number | null
    targetMeltpoolAreaPx: number | null
    machineMeltThresholdC: number | null
    /**
     * Deposition speed measured from the logged x/y/t, in mm/min. Worth
     * stating as measured: every logged run in this corpus holds ~1,000
     * mm/min, not the 1,500 mm/min quoted as nominal.
     */
    depositionSpeedMmPerMin: number | null
    medianPowderGasFlow: number | null
    medianRevolutionSpeed: number | null
  } | null
}

const cache = new Map<string, Promise<ProcessParameters>>()

function numberOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

async function read(entry: CatalogEntry): Promise<ProcessParameters> {
  const nominal = {
    lengthMm: entry.lengthMm,
    passesPerLayer: entry.passes,
    layers: entry.layers,
    layerIncrementMm: entry.layerHeightMm,
    targetHeightMm: entry.targetHeightMm,
  }

  if (!entry.dataDatFile) {
    return { buildId: entry.id, nominal, logged: null }
  }

  const [meta, table] = await Promise.all([
    readDataDatHeader(entry.dataDatFile),
    readDataDat(entry.dataDatFile),
  ])

  const { t, x, y, meltpoolSize, LaserPower, powderGasFlow_1, revolutionSpeed_1 } = table.data

  // Speed between consecutive deposition rows, in mm/s, then to mm/min.
  const speeds: number[] = []
  const powers: number[] = []
  const flows: number[] = []
  const revolutions: number[] = []
  for (let i = 1; i < table.rowCount; i++) {
    if (meltpoolSize[i] <= 0 || meltpoolSize[i - 1] <= 0) continue
    powers.push(LaserPower[i])
    flows.push(powderGasFlow_1[i])
    revolutions.push(revolutionSpeed_1[i])

    const dt = (t[i] - t[i - 1]) / 1000
    // Skip gaps and standstills; both would drag the median off the feedrate.
    if (dt <= 0 || dt > 0.2) continue
    const step = Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1])
    if (step <= 0) continue
    speeds.push(step / dt)
  }

  const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp

  return {
    buildId: entry.id,
    nominal,
    logged: {
      programme: meta['Programme name']?.replace(/^_N_|_MPF$/g, '') ?? null,
      startLaserPowerW: numberOrNull(meta['StartLaserPower']),
      maxLaserPowerW: numberOrNull(meta['MaxLaserPower']),
      medianLaserPowerW: powers.length ? round(median(powers)) : null,
      targetMeltpoolAreaPx: numberOrNull(meta['TargetMeltpoolArea']),
      machineMeltThresholdC: numberOrNull(meta['TemperatureMeltThreshold']),
      depositionSpeedMmPerMin: speeds.length ? round(median(speeds) * 60, 0) : null,
      medianPowderGasFlow: flows.length ? round(median(flows), 2) : null,
      medianRevolutionSpeed: revolutions.length ? round(median(revolutions), 2) : null,
    },
  }
}

export function processParameters(entry: CatalogEntry): Promise<ProcessParameters> {
  let hit = cache.get(entry.id)
  if (!hit) {
    hit = read(entry).catch((err) => {
      cache.delete(entry.id)
      throw err
    })
    cache.set(entry.id, hit)
  }
  return hit
}
