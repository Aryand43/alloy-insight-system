export type ProcessType =
  | 'laser_powder_bed_fusion'
  | 'laser_powder_ded'
  | 'laser_wire_ded'
  | 'waam'
  | 'laser_cladding'

export type AlertLevel = 'stable' | 'transition' | 'alert'

export type SessionStatus = 'pending' | 'ready' | 'failed'

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
  redFraction: number
  blueFraction: number
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
}
