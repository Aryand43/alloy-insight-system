import type {
  ThermalFrameStats,
  ThermalFrameWindow,
  ThermalLayerIndex,
} from '../domain/types'
import { apiFetch, isMockMode } from './client'
import {
  mockGetThermalLayers,
  mockGetThermalStats,
  mockGetThermalWindow,
} from './mock/thermal'

export async function getThermalLayers(
  sessionId: string,
): Promise<ThermalLayerIndex> {
  if (isMockMode()) return mockGetThermalLayers(sessionId)
  return apiFetch<ThermalLayerIndex>(`/sessions/${sessionId}/thermal/layers`)
}

/**
 * The threshold travels on every thermal request rather than being read from
 * the stored session: sessions are revived from their id after a restart, so a
 * threshold held only in server memory would silently revert to the machine's.
 */
function thresholdQuery(thresholdC?: number | null): string {
  return thresholdC ? `&thresholdC=${thresholdC}` : ''
}

export async function getThermalWindow(
  sessionId: string,
  layer: number,
  offset: number,
  limit = 24,
  thresholdC?: number | null,
): Promise<ThermalFrameWindow> {
  if (isMockMode()) return mockGetThermalWindow(sessionId, layer, offset, limit)
  return apiFetch<ThermalFrameWindow>(
    `/sessions/${sessionId}/thermal/layers/${layer}/frames?offset=${offset}&limit=${limit}${thresholdQuery(thresholdC)}`,
  )
}

export async function getThermalFrameStats(
  sessionId: string,
  layer: number,
  position: number,
  thresholdC?: number | null,
): Promise<ThermalFrameStats> {
  if (isMockMode()) return mockGetThermalStats(sessionId, layer, position)
  return apiFetch<ThermalFrameStats>(
    `/sessions/${sessionId}/thermal/layers/${layer}/frames/${position}/stats?v=1${thresholdQuery(thresholdC)}`,
  )
}
