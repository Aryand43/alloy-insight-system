import type { LayerFootprint } from '../domain/types'
import { apiFetch, isMockMode } from './client'
import { mockGetLayerFootprint } from './mock/footprint'

export async function getLayerFootprint(
  sessionId: string,
  layer: number,
  thresholdC?: number | null,
): Promise<LayerFootprint> {
  if (isMockMode()) return mockGetLayerFootprint(layer)
  const threshold = thresholdC ? `?thresholdC=${thresholdC}` : ''
  return apiFetch<LayerFootprint>(
    `/sessions/${sessionId}/thermal/layers/${layer}/footprint${threshold}`,
  )
}
