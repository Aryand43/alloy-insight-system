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

export async function getThermalWindow(
  sessionId: string,
  layer: number,
  offset: number,
  limit = 24,
): Promise<ThermalFrameWindow> {
  if (isMockMode()) return mockGetThermalWindow(sessionId, layer, offset, limit)
  return apiFetch<ThermalFrameWindow>(
    `/sessions/${sessionId}/thermal/layers/${layer}/frames?offset=${offset}&limit=${limit}`,
  )
}

export async function getThermalFrameStats(
  sessionId: string,
  layer: number,
  position: number,
): Promise<ThermalFrameStats> {
  if (isMockMode()) return mockGetThermalStats(sessionId, layer, position)
  return apiFetch<ThermalFrameStats>(
    `/sessions/${sessionId}/thermal/layers/${layer}/frames/${position}/stats`,
  )
}
