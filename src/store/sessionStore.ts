import { create } from 'zustand'
import type { AnalysisMode, ProcessType, SessionConfig } from '../domain/types'
import { getMaterialById, MATERIALS } from '../domain/materials'

const defaultMaterial = MATERIALS[0]

/**
 * The machine's own logged melt threshold, and the default for the
 * segmentation threshold the operator can override in setup. Starting here
 * means an untouched form reproduces the machine's own melt-pool detection
 * exactly, and any other value is a deliberate choice.
 */
export const MACHINE_MELT_THRESHOLD_C = 1560

export interface SetupFormState {
  materialId: string
  processType: ProcessType
  /** Segmentation threshold in °C — pixels above it count as melt pool. */
  meltingTempC: number
  dataSourceName: string
  configName: string
  /** Backend-Data coupon id chosen in setup, e.g. `60047207r2`. */
  sampleId: string
  /** Pass-count filter applied to the build list; null shows every build. */
  passFilter: number | null
  /** Restricts the list to builds that can run Alloy Insight. */
  thermalOnly: boolean
  setThermalOnly: (on: boolean) => void
  setSampleId: (id: string) => void
  setPassFilter: (passes: number | null) => void
  setMaterialId: (id: string) => void
  setProcessType: (p: ProcessType) => void
  setMeltingTempC: (t: number) => void
  setDataSourceName: (n: string) => void
  setConfigName: (n: string) => void
  toConfig: (mode: AnalysisMode) => SessionConfig
  reset: () => void
}

const initial = {
  materialId: defaultMaterial.id,
  // Every coupon in the corpus was built by laser powder DED.
  processType: 'laser_powder_ded' as ProcessType,
  meltingTempC: MACHINE_MELT_THRESHOLD_C,
  dataSourceName: '',
  configName: '',
  sampleId: '',
  passFilter: null as number | null,
  thermalOnly: false,
}

export const useSetupStore = create<SetupFormState>((set, get) => ({
  ...initial,
  setSampleId: (sampleId) => set({ sampleId }),
  setPassFilter: (passFilter) => set({ passFilter }),
  setThermalOnly: (thermalOnly) => set({ thermalOnly }),
  // Changing material no longer rewrites the threshold: the threshold is the
  // operator's segmentation choice, not a property of the alloy.
  setMaterialId: (materialId) => set({ materialId }),
  setProcessType: (processType) => set({ processType }),
  setMeltingTempC: (meltingTempC) => set({ meltingTempC }),
  setDataSourceName: (dataSourceName) => set({ dataSourceName }),
  setConfigName: (configName) => set({ configName }),
  toConfig: (mode: AnalysisMode) => {
    const s = get()
    const mat = getMaterialById(s.materialId)
    return {
      materialId: s.materialId,
      materialLabel: mat?.label ?? s.materialId,
      processType: s.processType,
      meltingTempC: s.meltingTempC,
      // What the server segments at. Sent on every session so the threshold
      // the operator chose is the one the images and numbers are made with.
      thresholdC: s.meltingTempC,
      dataSourceName: s.dataSourceName || s.sampleId || 'demo_sequence.zip',
      // Empty lets the server name it from the build, e.g. "10-pass · R5".
      configName: s.configName,
      sampleId: s.sampleId,
      mode,
    }
  },
  reset: () => set(initial),
}))

interface AnalysisUiState {
  selectedFrameId: string | null
  setSelectedFrameId: (id: string | null) => void
  /**
   * Alloy Insight navigation is two-level: the layer stays pinned on the left
   * while `thermalPos` scrubs the melt-pool frames captured within it.
   *
   * The store only clamps. Advancing past the end of a layer is the page's
   * decision, because only it knows each layer's frame count.
   */
  thermalLayer: number | null
  thermalPos: number
  setThermalLayer: (layer: number | null) => void
  setThermalPos: (pos: number) => void
}

export const useAnalysisUiStore = create<AnalysisUiState>((set) => ({
  selectedFrameId: null,
  setSelectedFrameId: (selectedFrameId) => set({ selectedFrameId }),
  thermalLayer: null,
  thermalPos: 0,
  setThermalLayer: (thermalLayer) => set({ thermalLayer, thermalPos: 0 }),
  setThermalPos: (thermalPos) => set({ thermalPos: Math.max(0, thermalPos) }),
}))
