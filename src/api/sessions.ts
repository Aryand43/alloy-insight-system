import type {
  AnalysisSession,
  Frame,
  MeshPayload,
  SessionConfig,
  ThresholdOverlay,
  ThresholdStats,
  ThreeColorPayload,
} from '../domain/types'
import { apiFetch, isMockMode } from './client'
import {
  mockCreateSession,
  mockGetFrames,
  mockGetReconstruction,
  mockGetSession,
  mockGetStats,
  mockGetThreeColor,
  mockGetThreshold,
} from './mock/sessions'

export async function createSession(
  config: SessionConfig,
): Promise<AnalysisSession> {
  if (isMockMode()) return mockCreateSession(config)
  return apiFetch<AnalysisSession>('/sessions', {
    method: 'POST',
    body: JSON.stringify({ config }),
  })
}

export async function getSession(id: string): Promise<AnalysisSession> {
  if (isMockMode()) return mockGetSession(id)
  return apiFetch<AnalysisSession>(`/sessions/${id}`)
}

export async function getFrames(sessionId: string): Promise<Frame[]> {
  if (isMockMode()) return mockGetFrames(sessionId)
  return apiFetch<Frame[]>(`/sessions/${sessionId}/frames`)
}

export async function getThreshold(
  sessionId: string,
  frameId: string,
): Promise<ThresholdOverlay> {
  if (isMockMode()) return mockGetThreshold(sessionId, frameId)
  return apiFetch<ThresholdOverlay>(
    `/sessions/${sessionId}/threshold/${frameId}`,
  )
}

export async function getReconstruction(
  sessionId: string,
): Promise<MeshPayload> {
  if (isMockMode()) return mockGetReconstruction(sessionId)
  return apiFetch<MeshPayload>(`/sessions/${sessionId}/reconstruction`)
}

export async function getThreeColor(
  sessionId: string,
): Promise<ThreeColorPayload> {
  if (isMockMode()) return mockGetThreeColor(sessionId)
  return apiFetch<ThreeColorPayload>(`/sessions/${sessionId}/three-color`)
}

export async function getStats(sessionId: string): Promise<ThresholdStats> {
  if (isMockMode()) return mockGetStats(sessionId)
  return apiFetch<ThresholdStats>(`/sessions/${sessionId}/stats`)
}
