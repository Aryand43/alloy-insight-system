export type ProcessType =
  | 'laser_powder_bed_fusion'
  | 'laser_powder_ded'
  | 'laser_wire_ded'
  | 'waam'
  | 'laser_cladding'

export type AlertLevel = 'stable' | 'transition' | 'alert'

export type SessionStatus = 'pending' | 'ready' | 'failed'

/**
 * Which pipeline an analysis session runs.
 * - `process` — per-layer spreadsheet summaries; works for all 26 builds.
 * - `alloy`   — raw thermal frames thresholded at the melt temperature;
 *               only the builds where `hasThermal` is true.
 */
export type AnalysisMode = 'process' | 'alloy'

export interface MaterialOption {
  id: string
  label: string
  defaultMeltTempC: number
}

export interface SessionConfig {
  materialId: string
  materialLabel: string
  processType: ProcessType
  meltingTempC: number
  dataSourceName: string
  configName: string
  /** Backend-Data coupon id, e.g. `60047207r2`. */
  sampleId: string
  /** Optional so existing sessions and the mock adapter keep compiling. */
  mode?: AnalysisMode
  /** Decoded from sampleId; echoed back by the server for display. */
  passes?: number
  layers?: number
  layerHeightMm?: number
}

export interface CreateSessionRequest {
  config: SessionConfig
}

export interface AnalysisSession {
  id: string
  config: SessionConfig
  status: SessionStatus
  createdAt: string
}

export interface Frame {
  id: string
  index: number
  label: string
  /** Data URL or remote URL for the raw frame image */
  imageUrl: string
  timestampMs: number
  /** Small stand-in used for the filmstrip, so 84 full-size charts are not fetched at once. */
  thumbnailUrl?: string
  /** 1-based layer number this frame represents. */
  layer?: number
  /** Height above the build plate in mm. */
  zMm?: number
  /** True when imageUrl is a real captured/plotted artefact rather than a generated chart. */
  measured?: boolean
}

export interface ThresholdContour {
  id: string
  channel: 'red' | 'blue'
  /** SVG path or ellipse params for mock contour */
  cx: number
  cy: number
  rx: number
  ry: number
  opacity: number
}

export interface ThresholdOverlay {
  frameId: string
  width: number
  height: number
  contours: ThresholdContour[]
  /**
   * Normalised hot/cold deviation of this layer, 0-1, where 1 means the layer
   * has reached the alert threshold. Not a pixel proportion — the corpus only
   * stores a mean per layer, not a per-layer distribution.
   */
  redFraction: number
  blueFraction: number
  /** KIV histogram PNG for this layer, when the build has one. */
  imageUrl?: string
  sizeImageUrl?: string
  layer?: number
  meanTempC?: number
  meanSizeMm2?: number
  tempDriftPct?: number
  sizeDriftPct?: number
}

export interface MeshVertex {
  x: number
  y: number
  z: number
}

export interface MeshPayload {
  vertices: MeshVertex[]
  /** Triangle indices into vertices (flat triples) */
  indices: number[]
  color: string
  /** True dimensions of the coupon the normalised mesh represents. */
  meta?: {
    lengthMm: number
    heightMm: number
    layers: number
    minThicknessMm: number
    maxThicknessMm: number
    /** Visual exaggeration applied to the thickness axis; 1 = true scale. */
    thicknessExaggeration: number
  }
}

export type ColorClass = 'red' | 'blue' | 'green'

export interface ClassifiedVoxel {
  x: number
  y: number
  z: number
  size: number
  class: ColorClass
}

export interface ThreeColorPayload {
  voxels: ClassifiedVoxel[]
  bounds: { width: number; height: number; depth: number }
  /** When set, every voxel uses these box dimensions instead of its own `size`. */
  voxelSize?: { x: number; y: number; z: number }
  counts?: Record<ColorClass, number>
}

export interface ThresholdStats {
  /** Percentage of samples in each bin */
  stablePct: number
  transitionPct: number
  alertPct: number
  level: AlertLevel
  /** Upper bound of stable bin (exclusive), e.g. 10 */
  stableThreshold: number
  /** Upper bound of transition bin (exclusive), e.g. 30 */
  transitionThreshold: number
  /** Median layer temperature the drift is measured against. */
  referenceTempC?: number
  layerCount?: number
}

export interface BuildSummary {
  id: string
  /** Human label, e.g. `60047207r2 · 0.7 mm × 72 layers · 4-pass · R2`. */
  label: string
  lengthMm: number
  passes: number
  layers: number
  layerHeightMm: number
  run: number
  /** Key used by the LAYER INFO COMPARE workbooks, e.g. `7r2_4pass`. */
  shorthand: string
  /** layers × layerHeightMm — ~50 mm for every coupon by design. */
  targetHeightMm: number
  /** Per-layer KIV histogram PNGs exist for this build. */
  hasKivImages: boolean
  /** A DMG MORI run folder with raw Frames/ exists for this build. */
  hasRawFrames: boolean
  /**
   * Thermal analysis is possible: raw frames AND the Data.dat needed to map
   * them to layers. `60105010r4` has frames but no Data.dat, so it is false
   * there even though hasRawFrames is true.
   */
  hasThermal: boolean
  /** Verdict from COUPON QUALITY.xlsx, which ranks one best and one worst per pass group. */
  quality: 'best' | 'worst' | null
}

/* ----------------------------------------------------- thermal (alloy) -- */

export interface ThermalLayerSummary {
  layer: number
  zMm: number
  /** Thermal frames captured during this layer, typically ~380. */
  frameCount: number
  meanTempC: number
  meanSizeMm2: number
  level: AlertLevel
  /** Layer-profile chart for this layer, served by the bridge. */
  profileUrl: string
}

export interface ThermalLayerIndex {
  buildId: string
  /** Melt threshold the machine used, from the run header (°C). */
  meltThresholdC: number
  /** Calibration range the colour map spans, [min, max] °C. */
  tempRangeC: [number, number]
  frameSize: { width: number; height: number }
  totalFrames: number
  matchedFrames: number
  layers: ThermalLayerSummary[]
}

export interface ThermalFrameRef {
  /** Position within its layer, 0-based. */
  position: number
  tMs: number
  /** Values the machine logged for the matched control row. */
  meltpoolSizePx: number
  meltpoolTempC: number
  imageUrl: string
  plainUrl: string
}

export interface ThermalFrameWindow {
  layer: number
  zMm: number
  total: number
  offset: number
  limit: number
  frames: ThermalFrameRef[]
}

export interface ThermalFrameStats {
  /** Pixels above the melt threshold inside the evaluated region. */
  maskPixels: number
  meanTempC: number
  maxTempC: number
  loggedSizePx: number
  loggedTempC: number
  thresholdCount: number
  thresholdC: number
}
