import path from 'node:path'
import type { AnomalyReport, BuildBrief, SessionConfig } from '../../../src/domain/types.js'
import { readDataDatHeader } from '../parsers/dataDat.js'
import type { CatalogEntry } from './catalog.js'

/**
 * Machine this corpus came from.
 *
 * The run headers only log a machine serial (`12640000257`); the model name
 * comes from the process sheets in `DMG HYBRID MACHINE INFO`
 * ("Fe-316L- 65_3D_hybrid"), so it is stated as the documented machine rather
 * than something the logs assert.
 */
const MACHINE = 'DMG MORI LASERTEC 65 3D hybrid'

const PROCESS = 'Laser powder DED (coaxial nozzle)'

/** `20230308_0050_60105609r5` -> `8 Mar 2023`. */
function runDate(runDir: string | null): string | null {
  if (!runDir) return null
  const m = /^(\d{4})(\d{2})(\d{2})_(\d{4})_/.exec(path.basename(runDir))
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function numeric(meta: Record<string, string>, key: string): number | null {
  const n = Number(meta[key])
  return Number.isFinite(n) ? n : null
}

/**
 * The header strip shown once a build loads: what was built, on what, and what
 * the analysis found.
 *
 * Process parameters come from the run's own header where there is one. Only
 * seven of the 26 builds logged a `Data.dat`, so the rest show the geometry
 * the build id encodes and say that no run log exists rather than inventing
 * settings.
 */
export async function buildBrief(
  entry: CatalogEntry,
  config: SessionConfig,
  report: AnomalyReport,
  monitoringFrames: number,
): Promise<BuildBrief> {
  let meta: Record<string, string> = {}
  if (entry.dataDatFile) {
    try {
      meta = await readDataDatHeader(entry.dataDatFile)
    } catch (err) {
      console.warn(`[brief] could not read run header for ${entry.id}: ${String(err)}`)
    }
  }

  const keyParameters: { label: string; value: string }[] = []
  const push = (label: string, value: string | null | undefined) => {
    if (value) keyParameters.push({ label, value })
  }

  push('Programme', meta['Programme name']?.replace(/^_N_|_MPF$/g, '') ?? null)
  const startPower = numeric(meta, 'StartLaserPower')
  push('Laser power', startPower !== null ? `${startPower.toFixed(0)} W` : null)
  const targetArea = numeric(meta, 'TargetMeltpoolArea')
  push('Target melt-pool area', targetArea !== null ? `${targetArea.toFixed(0)} px` : null)
  const machineThreshold = numeric(meta, 'TemperatureMeltThreshold')
  push(
    'Melt threshold',
    config.thresholdC
      ? `${config.thresholdC.toFixed(0)} °C (set in setup)`
      : machineThreshold !== null
        ? `${machineThreshold.toFixed(0)} °C (machine)`
        : null,
  )
  push('Machine serial', meta['Machine'] ?? null)
  if (!entry.dataDatFile) {
    keyParameters.push({ label: 'Run log', value: 'none for this build' })
  }

  const geometry = [
    `${entry.lengthMm} mm wall`,
    `${entry.passes}-pass`,
    `${entry.layers} layers × ${entry.layerHeightMm.toFixed(1)} mm`,
    `target ${entry.targetHeightMm.toFixed(1)} mm`,
    entry.geometryHeightDeviationMm !== null
      ? `measured ${entry.geometryHeightDeviationMm >= 0 ? '+' : ''}${entry.geometryHeightDeviationMm.toFixed(1)} mm vs nominal (GOM)`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    buildId: entry.id,
    machine: MACHINE,
    material: config.materialLabel,
    process: PROCESS,
    geometry,
    builtOn: runDate(entry.runDir),
    layersAnalysed: report.layersAnalysed,
    monitoringFrames,
    detectedAnomalies: report.events.length,
    verdict: report.verdict,
    transitionEndLayer: report.transition.endLayer,
    keyParameters,
  }
}
