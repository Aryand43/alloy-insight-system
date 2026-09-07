import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Repo root — server/src/config.ts -> server -> repo root */
export const REPO_ROOT = path.resolve(here, '..', '..')

export const PORT = Number(process.env.PORT ?? 3001)

export const BACKEND_DATA_DIR = path.resolve(
  process.env.BACKEND_DATA_DIR ?? path.join(REPO_ROOT, 'Backend-Data'),
)

/** Origin used to build absolute image URLs handed back to the browser. */
export const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`
).replace(/\/$/, '')

export const AVG_DIR = path.join(
  BACKEND_DATA_DIR,
  'AVERAGE LAYER TEMP AND SIZE COMPARSION',
)
export const MEANTEMP_DIR = path.join(AVG_DIR, 'meantemp')
export const MEANSIZE_DIR = path.join(AVG_DIR, 'meansize')
export const KIV_DIR = path.join(AVG_DIR, 'KIV')
export const DMG_DIR = path.join(BACKEND_DATA_DIR, 'DMG MORI DATA')
export const COUPON_QUALITY_XLSX = path.join(DMG_DIR, 'COUPON QUALITY.xlsx')

/**
 * Classification thresholds, expressed as |percent drift| from the build's own
 * median layer value.
 *
 * These are calibrated against the real corpus, not guessed. Across all 26
 * builds, layer mean temperature drifts at most ~11% from the build median and
 * 96% of layers sit within 5% — so the 10%/30% bins in the original plan put
 * essentially every layer in "stable" and produced a flat green bar for every
 * build. 2%/5% reproduces the intended three-way split (~79/16/4 on average,
 * with the alert share ranging 0-11% across builds).
 *
 * Melt-pool size drifts far more (up to ~57%), so it keeps the wider bands.
 */
export const DEFAULT_TEMP_STABLE_PCT = 2
export const DEFAULT_TEMP_TRANSITION_PCT = 5
export const DEFAULT_SIZE_STABLE_PCT = 10
export const DEFAULT_SIZE_TRANSITION_PCT = 30

/** Nominal coupon length in mm; encoded as the first two digits of every build id. */
export const NOMINAL_LENGTH_MM = 60

/* ------------------------------------------------------ thermal frames -- */

/**
 * 4096-row lookup table mapping the camera's raw 12-bit counts to °C.
 *
 * Verified against the machine's own logs: `LUT[497] = 1560 °C`, which is
 * exactly the `TemperatureMeltThreshold` in every run header, and the value the
 * `meltpoolThreshold` column carries. So the vendor's melt-pool detection is
 * simply "raw count above 497".
 */
export const CAMERA_CALIBRATION = path.join(
  BACKEND_DATA_DIR,
  'CameraCalibration.dat',
)

/**
 * Circular region the machine's controller evaluates, from the run header's
 * `FilterCenterX` / `FilterCenterY` / `FilterRadius`.
 *
 * Note the axes: X indexes the ROW and Y the COLUMN — the transposed reading.
 * Measured over frames whose timestamp matches a log row within 15 ms, this
 * orientation reproduces the logged `meltpoolSize` with a median ratio of 1.000
 * (sd 0.014); reading X as the column instead gives 0.88 and drifts.
 */
export const ROI_CENTER_ROW = 82
export const ROI_CENTER_COL = 109
export const ROI_RADIUS = 70

/** Frames join to Data.dat rows by nearest `t`; beyond this they are dropped. */
export const FRAME_MATCH_TOLERANCE_MS = 120
