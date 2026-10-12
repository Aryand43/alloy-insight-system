import type { PorosityReport } from '../domain/types'
import { apiFetch, isMockMode } from './client'
import { mockGetPorosity } from './mock/porosity'

export async function getPorosityReport(
  sessionId: string,
  thresholdC?: number | null,
): Promise<PorosityReport> {
  if (isMockMode()) return mockGetPorosity(sessionId)
  const threshold = thresholdC ? `?thresholdC=${thresholdC}` : ''
  return apiFetch<PorosityReport>(`/sessions/${sessionId}/porosity${threshold}`)
}
