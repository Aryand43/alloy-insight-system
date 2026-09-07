import { randomUUID } from 'node:crypto'
import type {
  AnalysisMode,
  AnalysisSession,
  SessionConfig,
} from '../../../src/domain/types'
import { getMaterialById, MATERIALS } from '../../../src/domain/materials'
import { decodeBuildId } from '../buildId'
import type { CatalogEntry } from './catalog'

const sessions = new Map<string, AnalysisSession>()

/**
 * Session ids embed the build id so a refresh or a shared deep link still
 * resolves after a server restart, matching how the mock adapter tolerates
 * unknown ids.
 */
function newId(buildId: string, mode: AnalysisMode): string {
  return `ses_${buildId}_${mode}_${randomUUID().slice(0, 8)}`
}

/** Tolerates ids minted before `mode` was part of the format. */
const SESSION_ID_RE = /^ses_([0-9a-z]+r\d+)(?:_(process|alloy))?_/i

export function buildIdFromSessionId(sessionId: string): string | null {
  const m = SESSION_ID_RE.exec(sessionId)
  if (!m) return null
  return decodeBuildId(m[1]) ? m[1] : null
}

export function modeFromSessionId(sessionId: string): AnalysisMode {
  const m = SESSION_ID_RE.exec(sessionId)
  return m?.[2] === 'alloy' ? 'alloy' : 'process'
}

/** Fills in the fields the server derives from the chosen coupon. */
export function normaliseConfig(
  entry: CatalogEntry,
  config: Partial<SessionConfig>,
): SessionConfig {
  const material = getMaterialById(config.materialId ?? '') ?? MATERIALS[0]
  return {
    mode: config.mode === 'alloy' ? 'alloy' : 'process',
    materialId: material.id,
    materialLabel: material.label,
    // Every coupon in this corpus was built on a DMG MORI hybrid machine by
    // laser powder DED.
    processType: config.processType ?? 'laser_powder_ded',
    meltingTempC:
      Number.isFinite(config.meltingTempC) && (config.meltingTempC as number) > 0
        ? (config.meltingTempC as number)
        : material.defaultMeltTempC,
    dataSourceName: entry.id,
    configName: config.configName || `${entry.passes}-pass · R${entry.run}`,
    sampleId: entry.id,
    passes: entry.passes,
    layers: entry.layers,
    layerHeightMm: entry.layerHeightMm,
  }
}

export function createSession(
  entry: CatalogEntry,
  config: Partial<SessionConfig>,
): AnalysisSession {
  const session: AnalysisSession = {
    id: newId(entry.id, config.mode === 'alloy' ? 'alloy' : 'process'),
    config: normaliseConfig(entry, config),
    status: 'ready',
    createdAt: new Date().toISOString(),
  }
  sessions.set(session.id, session)
  return session
}

export function getStoredSession(id: string): AnalysisSession | null {
  return sessions.get(id) ?? null
}

/** Rebuilds a session for a deep link the in-memory store has never seen. */
export function reviveSession(
  id: string,
  entry: CatalogEntry,
): AnalysisSession {
  const session: AnalysisSession = {
    id,
    config: normaliseConfig(entry, { mode: modeFromSessionId(id) }),
    status: 'ready',
    createdAt: new Date().toISOString(),
  }
  sessions.set(id, session)
  return session
}
