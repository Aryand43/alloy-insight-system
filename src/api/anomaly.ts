import type {
  AnomalyReport,
  BuildBrief,
  LayerFrameAnomalies,
  QueryAnswer,
} from '../domain/types'
import { apiFetch, isMockMode } from './client'
import {
  mockAskQuestion,
  mockGetAnomalies,
  mockGetBuildBrief,
  mockGetLayerFrameAnomalies,
} from './mock/anomaly'

export async function getAnomalies(sessionId: string): Promise<AnomalyReport> {
  if (isMockMode()) return mockGetAnomalies(sessionId)
  return apiFetch<AnomalyReport>(`/sessions/${sessionId}/anomalies`)
}

export async function getBuildBrief(sessionId: string): Promise<BuildBrief> {
  if (isMockMode()) return mockGetBuildBrief(sessionId)
  return apiFetch<BuildBrief>(`/sessions/${sessionId}/brief`)
}

export async function getLayerFrameAnomalies(
  sessionId: string,
  layer: number,
): Promise<LayerFrameAnomalies> {
  if (isMockMode()) return mockGetLayerFrameAnomalies(sessionId, layer)
  return apiFetch<LayerFrameAnomalies>(
    `/sessions/${sessionId}/thermal/layers/${layer}/anomalies`,
  )
}

/** POST, so the question never lands in a URL or a browser history entry. */
export async function askQuestion(
  sessionId: string,
  question: string,
): Promise<QueryAnswer> {
  if (isMockMode()) return mockAskQuestion(sessionId, question)
  return apiFetch<QueryAnswer>(`/sessions/${sessionId}/query`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
}
