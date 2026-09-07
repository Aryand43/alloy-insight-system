import type { BuildSummary } from '../domain/types'
import { apiFetch, isMockMode } from './client'
import { mockGetCatalog } from './mock/sessions'

/** Lists the coupons the data bridge can analyse. */
export async function getCatalog(): Promise<BuildSummary[]> {
  if (isMockMode()) return mockGetCatalog()
  return apiFetch<BuildSummary[]>('/catalog')
}
