import type { MeltPoolPhysics } from '../domain/types'
import { apiFetch, isMockMode } from './client'
import { mockGetPhysics } from './mock/physics'

export async function getMeltPoolPhysics(
  sessionId: string,
  layer: number,
  position: number,
  thresholdC?: number | null,
): Promise<MeltPoolPhysics> {
  if (isMockMode()) return mockGetPhysics(layer, position)
  const threshold = thresholdC ? `?thresholdC=${thresholdC}` : ''
  return apiFetch<MeltPoolPhysics>(
    `/sessions/${sessionId}/thermal/layers/${layer}/frames/${position}/physics${threshold}`,
  )
}
