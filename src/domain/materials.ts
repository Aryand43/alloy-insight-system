import type { MaterialOption, ProcessType } from './types.js'

export const MATERIALS: MaterialOption[] = [
  { id: '316l-ss', label: '316L SS', defaultMeltTempC: 1450 },
  { id: 'ti-6al-4v', label: 'Ti-6Al-4V', defaultMeltTempC: 1660 },
  { id: 'inconel-718', label: 'Inconel 718', defaultMeltTempC: 1336 },
  { id: 'al-si-10mg', label: 'AlSi10Mg', defaultMeltTempC: 600 },
]

export const PROCESS_TYPES: { id: ProcessType; label: string }[] = [
  { id: 'laser_powder_bed_fusion', label: 'Laser powder bed fusion' },
  { id: 'laser_powder_ded', label: 'Laser powder DED' },
  { id: 'laser_wire_ded', label: 'Laser wire DED' },
  { id: 'waam', label: 'WAAM' },
  { id: 'laser_cladding', label: 'Laser cladding' },
]

export function getMaterialById(id: string): MaterialOption | undefined {
  return MATERIALS.find((m) => m.id === id)
}

export function getProcessLabel(id: ProcessType): string {
  return PROCESS_TYPES.find((p) => p.id === id)?.label ?? id
}
