import { create } from 'zustand'
import type { ProcessType, SessionConfig } from '../domain/types'
import { getMaterialById, MATERIALS } from '../domain/materials'

const defaultMaterial = MATERIALS[0]

export interface SetupFormState {
  materialId: string
  processType: ProcessType
  meltingTempC: number
  dataSourceName: string
  configName: string
  setMaterialId: (id: string) => void
  setProcessType: (p: ProcessType) => void
  setMeltingTempC: (t: number) => void
  setDataSourceName: (n: string) => void
  setConfigName: (n: string) => void
  toConfig: () => SessionConfig
  reset: () => void
}

const initial = {
  materialId: defaultMaterial.id,
  processType: 'laser_powder_bed_fusion' as ProcessType,
  meltingTempC: defaultMaterial.defaultMeltTempC,
  dataSourceName: '',
  configName: 'default_preset.json',
}

export const useSetupStore = create<SetupFormState>((set, get) => ({
  ...initial,
  setMaterialId: (id) => {
    const mat = getMaterialById(id)
    set({
      materialId: id,
      meltingTempC: mat?.defaultMeltTempC ?? get().meltingTempC,
    })
  },
  setProcessType: (processType) => set({ processType }),
  setMeltingTempC: (meltingTempC) => set({ meltingTempC }),
  setDataSourceName: (dataSourceName) => set({ dataSourceName }),
  setConfigName: (configName) => set({ configName }),
  toConfig: () => {
    const s = get()
    const mat = getMaterialById(s.materialId)
    return {
      materialId: s.materialId,
      materialLabel: mat?.label ?? s.materialId,
      processType: s.processType,
      meltingTempC: s.meltingTempC,
      dataSourceName: s.dataSourceName || 'demo_sequence.zip',
      configName: s.configName || 'default_preset.json',
    }
  },
  reset: () => set(initial),
}))

interface AnalysisUiState {
  selectedFrameId: string | null
  setSelectedFrameId: (id: string | null) => void
}

export const useAnalysisUiStore = create<AnalysisUiState>((set) => ({
  selectedFrameId: null,
  setSelectedFrameId: (selectedFrameId) => set({ selectedFrameId }),
}))
