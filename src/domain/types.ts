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
 * - `porosity` — melt-pool conditions associated with pore formation. The
 *               indicators are measured from the same data; none of them is
 *               yet validated against measured porosity, which is why the
 *               payload carries its own validation status.
 */
export type AnalysisMode = 'process' | 'alloy' | 'porosity'

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
  /**
   * Segmentation threshold the operator set, in °C. When absent the machine's
   * own logged threshold is used instead.
   */
  thresholdC?: number
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
  /**
   * Mean deviation of the finished top face from nominal, in mm, from the GOM
   * surface-comparison reports. Negative means the wall came out short.
   * Ground truth measured off the machine — independent of anything thermal.
   */
  geometryHeightDeviationMm: number | null
}

/* ----------------------------------------------------- thermal (alloy) -- */

export interface ThermalLayerSummary {
  layer: number
  zMm: number
  /** Thermal frames captured during this layer, typically ~380. */
  frameCount: number
  /**
   * A frame mid-layer where the nozzle is travelling steadily along a pass.
   * About 3% of frames catch the nozzle stepping across to the next pass,
   * where the melt pool is reversing and nothing reads as it normally does;
   * opening on one of those misrepresents the layer.
   */
  openingFrame: number
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
  /**
   * `machine` means the threshold came from the run header, `user` that the
   * operator set it in setup. Shown next to the number so a segmentation is
   * never read as the machine's when it is not.
   */
  thresholdSource: 'machine' | 'user'
  /** Caliper extents of the segmented pool along its own principal axes. */
  dimensions: MeltPoolDimensions | null
}

/**
 * Melt-pool extent, measured on the thresholded mask rather than inferred
 * from its area: the mask's principal axes are found by eigen-decomposition
 * of its pixel covariance, then the pool is measured end to end along each.
 * `length` is the long axis (the direction of travel), `width` the short one.
 */
export interface MeltPoolDimensions {
  lengthMm: number
  widthMm: number
  lengthPx: number
  widthPx: number
  /** Long-axis orientation in the image, degrees from the horizontal. */
  angleDeg: number
  /** length / width; 1 is round, higher is more elongated. */
  aspect: number
  /** Signed % difference from the build's steady-state pool, when known. */
  lengthDeviationPct: number | null
  widthDeviationPct: number | null
}

/* ------------------------------------------- melt-pool boundary physics -- */

/** One point on the melt-pool boundary, with the quantities measured there. */
export interface BoundaryPoint {
  /** Position relative to the pool centroid, in mm. */
  xMm: number
  yMm: number
  /**
   * Thermal gradient magnitude, |dT/dn|, as the standard definition has it.
   * Always positive; where the fit came back rising outward instead of
   * falling, `risesOutward` says so rather than the number going negative.
   */
  gradientCPerMm: number
  /**
   * True where temperature rose along the outward normal. Physically it
   * should fall, so these are the noisy points at the pool edge: kept as a
   * flag so the magnitude stays usable while the diagnostic is not lost.
   */
  risesOutward: boolean
  /** Angle between the outward normal and the scan direction, degrees. */
  thetaDeg: number
  /**
   * Solidification rate, V·|cos θ|, in mm/s. Only meaningful on the trailing
   * edge, where the pool is freezing; it is null elsewhere.
   */
  solidificationMmPerS: number | null
  /** True on the trailing half of the pool, behind the heat source. */
  trailing: boolean
}

export interface MeltPoolPhysics {
  layer: number
  position: number
  thresholdC: number
  thresholdSource: 'machine' | 'user'
  points: BoundaryPoint[]
  /** Travel direction in the image, degrees, and the speed used for R. */
  travel: {
    headingDeg: number
    /** Deposition speed measured from the machine log at this frame, mm/s. */
    speedMmPerS: number
    /** Whether the speed came from the log or fell back to the nominal. */
    speedSource: 'measured' | 'nominal'
  }
  summary: {
    boundaryPoints: number
    trailingPoints: number
    gradientMedianCPerMm: number
    gradientP10CPerMm: number
    gradientP90CPerMm: number
    /** Share of boundary points whose temperature rises outward — edge noise. */
    gradientNegativePct: number
    /**
     * Baseline the gradient was fitted over, in mm. The measured profile is
     * not linear, so G is only meaningful alongside the window it came from.
     */
    gradientWindowMm: number
    gradientSamples: number
    solidificationMedianMmPerS: number
    solidificationMaxMmPerS: number
    /** G/R, which governs solidification morphology, in °C·s/mm². */
    gOverR: number
    /** G·R, the cooling rate, in °C/s. */
    coolingRateCPerS: number
  }
}

/* -------------------------------------------------------------- porosity -- */

/**
 * One measurable quantity associated with pore formation.
 *
 * Deliberately called an indicator rather than a prediction. Each is measured
 * from the thermal and machine data, and each has a mechanism behind it from
 * the literature, but none has been checked against this corpus's own pores:
 * the X-ray porosity analysis is still being run. `validation` carries that
 * status with the number so the two cannot be separated.
 */
export interface PorosityIndicator {
  id: 'overlap' | 'undersized' | 'coldPool' | 'instability'
  label: string
  /** The measured value. */
  value: number
  unit: string
  /** Which way is worse, for reading the scale. */
  higherIsWorse: boolean
  /** The pore mechanism this quantity is associated with. */
  mechanism: string
  /** What is known about whether it works here. */
  validation: string
  /** Null where the build lacks the data to compute it. */
  available: boolean
}

export interface PorosityLayerRisk {
  layer: number
  zMm: number
  /** Share of this layer's frames with a pool below the build's steady state. */
  undersizedPct: number
  /** Share below the steady-state temperature band. */
  coldPct: number
  /** Share the frame-level model flagged as deviating. */
  deviatingPct: number
  /** Worst location in this layer, in machine coordinates. */
  worst: { xMm: number; yMm: number; zMm: number; sizePx: number } | null
}

export interface PorosityReport {
  buildId: string
  indicators: PorosityIndicator[]
  layers: PorosityLayerRisk[]
  /** Track spacing measured from the machine log, mm. Null without a log. */
  trackSpacingMm: number | null
  /** Median melt-pool width measured from the frames, mm. */
  poolWidthMm: number | null
  /** 1 - spacing / width. Below zero means neighbouring tracks never met. */
  overlapRatio: number | null
  /** Plain statement of what would turn these indicators into a predictor. */
  validationNote: string
}

/** One frame's melt-pool outline, placed on the machine's own axes. */
export interface FrameOutline {
  position: number
  centreXMm: number
  centreYMm: number
  /** Closed contour in machine coordinates, [x, y] pairs in mm. */
  points: [number, number][]
}

/** An enclosed patch of the layer that no melt pool covered. */
export interface FootprintGap {
  xMm: number
  yMm: number
  areaMm2: number
}

/**
 * The melted footprint of one layer: every frame's pool outline laid out in
 * machine coordinates, and the enclosed patches none of them covered.
 */
export interface LayerFootprint {
  layer: number
  zMm: number
  frames: number
  framesUsed: number
  framesUnreadable: number
  thresholdC: number
  thresholdSource: 'machine' | 'user'
  bounds: { minXMm: number; maxXMm: number; minYMm: number; maxYMm: number }
  outlines: FrameOutline[]
  /** The largest enclosed gaps; `gapCount` is how many there were in total. */
  gaps: FootprintGap[]
  gapCount: number
  /**
   * False when consecutive pools stand apart, so the bare strips between them
   * would read as enclosed gaps. The outlines still describe the traces; the
   * gaps are withheld rather than reported as porosity candidates.
   */
  gapsAssessed: boolean
  /** Median step between consecutive pool centres along a pass. */
  stepMm: number | null
  /** Median pool width, which the step is judged against. */
  poolWidthMm: number | null
  coveredAreaMm2: number
  gapAreaMm2: number
  /** Grid resolution the coverage was rasterised at, mm. */
  cellMm: number
}

/* ----------------------------------------------------- anomaly detection -- */

/**
 * The ramp-up at the start of a build, where temperature is still climbing
 * toward steady state. Deviation here is expected, so these layers are
 * reported but never flagged as anomalies.
 */
export interface TransitionRegion {
  /** Last layer of the ramp; layers 1..endLayer inclusive. */
  endLayer: number
  startTempC: number
  endTempC: number
  endZMm: number
}

export type AnomalySeverity = 'watch' | 'alert'

export interface LayerAnomaly {
  layer: number
  zMm: number
  /** Mahalanobis distance from the model's normal region. */
  score: number
  severity: AnomalySeverity
  meanTempC: number
  tempDriftPct: number
  sizeDriftPct: number
}

/** A run of consecutive flagged layers, reported by where it began. */
export interface AnomalyEvent {
  onsetLayer: number
  endLayer: number
  onsetZMm: number
  peakLayer: number
  peakScore: number
  severity: AnomalySeverity
  /** One line fit for an alert banner. */
  summary: string
}

export interface AnomalyModelInfo {
  name: string
  trainedOn: string
  /** Honest statement of what validation showed, shown in the UI. */
  validation: string
  alertThreshold: number
  watchThreshold: number
}

export interface AnomalyReport {
  buildId: string
  model: AnomalyModelInfo
  transition: TransitionRegion
  /** Layers in the build, and how many were eligible for scoring. */
  layersAnalysed: number
  layersScored: number
  anomalies: LayerAnomaly[]
  events: AnomalyEvent[]
  flaggedPct: number
  verdict: 'clean' | 'watch' | 'alert'
}

/** One deviating frame inside a layer, located in machine coordinates. */
export interface FrameAnomaly {
  position: number
  tMs: number
  score: number
  severity: AnomalySeverity
  xMm: number
  yMm: number
  zMm: number
  sizeDriftPct: number
  tempDriftPct: number
}

export interface LayerFrameAnomalies {
  layer: number
  zMm: number
  frameCount: number
  anomalies: FrameAnomaly[]
  flaggedPct: number
  /** Per-frame scores in frame order, for the scrubber and the 3D map. */
  scores: number[]
  alertThreshold: number
  worst: FrameAnomaly | null
  /**
   * Measured caveat, carried to the UI: frame-level flags localise deviation
   * within a layer but did not separate good from bad coupons.
   */
  note: string
}

/** Header strip shown once a build is loaded. */
export interface BuildBrief {
  buildId: string
  machine: string
  material: string
  process: string
  geometry: string
  builtOn: string | null
  layersAnalysed: number
  /** Thermal frames matched to layers, 0 for spreadsheet-only builds. */
  monitoringFrames: number
  detectedAnomalies: number
  verdict: AnomalyReport['verdict']
  transitionEndLayer: number
  keyParameters: { label: string; value: string }[]
}

/** Answer from the dataset query assistant. */
export interface QueryAnswer {
  question: string
  answer: string
  /** Which build data the answer was grounded in. */
  contextBuilds: string[]
  model: string
}
