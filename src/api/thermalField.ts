import { apiFetch, apiFetchBinary, isMockMode } from './client'
import { mockGetCalibration, mockGetThermalField } from './mock/thermal'

export interface ThermalField {
  width: number
  height: number
  /** Raw 12-bit camera counts, row-major. Convert with the calibration LUT. */
  counts: Uint16Array
}

/**
 * Raw counts are fetched rather than °C on purpose: the machine's melt rule is
 * `count > thresholdCount` (497), and several counts map to the same °C, so no
 * temperature predicate reproduces it exactly. Keeping counts means the client
 * classifies the same pixels the controller did.
 */
export async function getThermalField(
  buildId: string,
  layer: number,
  position: number,
  stride = 2,
  signal?: AbortSignal,
): Promise<ThermalField> {
  if (isMockMode()) return mockGetThermalField(buildId, layer, position)

  const res = await apiFetchBinary(
    `/builds/${encodeURIComponent(buildId)}/layers/${layer}/frames/${position}/field.bin?stride=${stride}`,
    { signal },
  )
  const width = Number(res.headers.get('X-Frame-Width'))
  const height = Number(res.headers.get('X-Frame-Height'))
  const buf = await res.arrayBuffer()

  if (!width || !height || buf.byteLength !== width * height * 2) {
    throw new Error(
      `Malformed thermal field: ${width}x${height} but ${buf.byteLength} bytes`,
    )
  }
  return { width, height, counts: new Uint16Array(buf) }
}

interface CalibrationResponse {
  minC: number
  maxC: number
  celsius: number[]
}

export interface Calibration {
  minC: number
  maxC: number
  /** 4096 entries: index is the raw count, value is °C. */
  celsius: Float32Array
}

/**
 * Memoised at module level so every panel shares one fetch and StrictMode's
 * double-invoked effects do not fetch twice.
 */
let calibrationPromise: Promise<Calibration> | null = null

export function getCalibration(): Promise<Calibration> {
  if (!calibrationPromise) {
    calibrationPromise = (async () => {
      const raw: CalibrationResponse = isMockMode()
        ? await mockGetCalibration()
        : await apiFetch<CalibrationResponse>('/calibration')
      return {
        minC: raw.minC,
        maxC: raw.maxC,
        celsius: Float32Array.from(raw.celsius),
      }
    })().catch((err) => {
      calibrationPromise = null
      throw err
    })
  }
  return calibrationPromise
}
