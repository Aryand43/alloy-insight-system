import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getFrames,
  getReconstruction,
  getSession,
  getStats,
  getThreeColor,
  getThreshold,
} from '../api/sessions'
import { getProcessLabel } from '../domain/materials'
import type {
  AnalysisSession,
  Frame,
  MeshPayload,
  ThresholdOverlay,
  ThresholdStats,
  ThreeColorPayload,
} from '../domain/types'
import type {
  ThermalFrameStats,
  ThermalFrameWindow,
  ThermalLayerIndex,
} from '../domain/types'
import {
  getThermalFrameStats,
  getThermalLayers,
  getThermalWindow,
} from '../api/thermal'
import { useAnalysisUiStore } from '../store/sessionStore'
import { ThermalProfilePanel } from '../components/analysis/ThermalProfilePanel'
import { MeltPoolImagesPanel } from '../components/analysis/MeltPoolImagesPanel'
import { AppShell } from '../components/layout/AppShell'
import { Panel } from '../components/ui/Panel'
import { Button } from '../components/ui/Button'
import { RawImagesPanel } from '../components/analysis/RawImagesPanel'
import { ThresholdPanel } from '../components/analysis/ThresholdPanel'
import { Reconstruction3D } from '../components/analysis/Reconstruction3D'
import { ThreeColor3D } from '../components/analysis/ThreeColor3D'
import { StatsStrip } from '../components/analysis/StatsStrip'

export function AnalysisPage() {
  const { sessionId = '' } = useParams()
  const {
    selectedFrameId,
    setSelectedFrameId,
    thermalLayer,
    thermalPos,
    setThermalLayer,
    setThermalPos,
  } = useAnalysisUiStore()

  const [session, setSession] = useState<AnalysisSession | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [overlay, setOverlay] = useState<ThresholdOverlay | null>(null)
  const [recon, setRecon] = useState<MeshPayload | null>(null)
  const [threeColor, setThreeColor] = useState<ThreeColorPayload | null>(null)
  const [stats, setStats] = useState<ThresholdStats | null>(null)

  const [loadingSession, setLoadingSession] = useState(true)
  const [loadingFrames, setLoadingFrames] = useState(true)
  const [loadingOverlay, setLoadingOverlay] = useState(false)
  const [loading3d, setLoading3d] = useState(true)
  const [loadingStats, setLoadingStats] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [thermalIndex, setThermalIndex] = useState<ThermalLayerIndex | null>(null)
  const [frameWindow, setFrameWindow] = useState<ThermalFrameWindow | null>(null)
  const [frameStats, setFrameStats] = useState<ThermalFrameStats | null>(null)
  const [loadingThermal, setLoadingThermal] = useState(false)
  const [thermalError, setThermalError] = useState<string | null>(null)

  const mode = session?.config.mode === 'alloy' ? 'alloy' : 'process'
  const WINDOW = 24

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    async function load() {
      setLoadingSession(true)
      setError(null)
      try {
        const s = await getSession(sessionId)
        if (cancelled) return
        setSession(s)

        setLoadingFrames(true)
        setLoading3d(true)
        setLoadingStats(true)

        const [fr, mesh, vol, st] = await Promise.all([
          getFrames(sessionId),
          getReconstruction(sessionId),
          getThreeColor(sessionId),
          getStats(sessionId),
        ])
        if (cancelled) return
        setFrames(fr)
        setRecon(mesh)
        setThreeColor(vol)
        setStats(st)
        if (fr[0]) setSelectedFrameId(fr[0].id)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session')
        }
      } finally {
        if (!cancelled) {
          setLoadingSession(false)
          setLoadingFrames(false)
          setLoading3d(false)
          setLoadingStats(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, setSelectedFrameId])

  useEffect(() => {
    if (!sessionId || !selectedFrameId) return
    let cancelled = false

    async function loadOverlay() {
      setLoadingOverlay(true)
      try {
        const th = await getThreshold(sessionId, selectedFrameId!)
        if (!cancelled) setOverlay(th)
      } catch {
        if (!cancelled) setOverlay(null)
      } finally {
        if (!cancelled) setLoadingOverlay(false)
      }
    }

    void loadOverlay()
    return () => {
      cancelled = true
    }
  }, [sessionId, selectedFrameId])

  // Layer index for Alloy Insight.
  useEffect(() => {
    if (!sessionId || mode !== 'alloy') return
    let cancelled = false

    async function load() {
      setLoadingThermal(true)
      setThermalError(null)
      try {
        const index = await getThermalLayers(sessionId)
        if (cancelled) return
        setThermalIndex(index)
        if (index.layers.length) {
          const known = index.layers.some((l) => l.layer === thermalLayer)
          if (!known) setThermalLayer(index.layers[0].layer)
        }
      } catch (err) {
        if (!cancelled) {
          setThermalError(
            err instanceof Error ? err.message : 'Could not index thermal frames',
          )
        }
      } finally {
        if (!cancelled) setLoadingThermal(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // thermalLayer is intentionally excluded: this seeds the layer once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mode, setThermalLayer])

  // Frame window around the cursor — never all ~380 at once.
  const windowStart = Math.floor(thermalPos / WINDOW) * WINDOW
  useEffect(() => {
    if (!sessionId || mode !== 'alloy' || thermalLayer === null) return
    let cancelled = false

    async function load() {
      try {
        const w = await getThermalWindow(sessionId, thermalLayer!, windowStart, WINDOW)
        if (!cancelled) setFrameWindow(w)
      } catch (err) {
        if (!cancelled) {
          setThermalError(
            err instanceof Error ? err.message : 'Could not load melt-pool frames',
          )
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, mode, thermalLayer, windowStart])

  // Per-frame numbers, computed against the machine's own log.
  useEffect(() => {
    if (!sessionId || mode !== 'alloy' || thermalLayer === null) return
    let cancelled = false

    async function load() {
      try {
        const s = await getThermalFrameStats(sessionId, thermalLayer!, thermalPos)
        if (!cancelled) {
          setFrameStats(s)
          setThermalError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setFrameStats(null)
          // A handful of frames in the corpus are corrupt; say so rather than
          // showing a broken image.
          setThermalError(err instanceof Error ? err.message : null)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, mode, thermalLayer, thermalPos])

  const thermalLayers = thermalIndex?.layers ?? []

  /**
   * Two-level navigation: scrubbing past the last frame of a layer advances to
   * the next layer, and stepping back before the first returns to the end of
   * the previous one.
   */
  function seek(next: number) {
    const i = thermalLayers.findIndex((l) => l.layer === thermalLayer)
    const current = thermalLayers[i]
    if (!current) return

    if (next >= current.frameCount) {
      const following = thermalLayers[i + 1]
      if (following) setThermalLayer(following.layer)
      else setThermalPos(current.frameCount - 1)
      return
    }
    if (next < 0) {
      const previous = thermalLayers[i - 1]
      if (previous) {
        setThermalLayer(previous.layer)
        setThermalPos(previous.frameCount - 1)
      } else {
        setThermalPos(0)
      }
      return
    }
    setThermalPos(next)
  }

  const activeLayer = thermalLayers.find((l) => l.layer === thermalLayer) ?? null

  const trailing = (
    <Link to="/">
      <Button variant="ghost" className="text-xs">
        Edit setup
      </Button>
    </Link>
  )

  if (error) {
    return (
      <AppShell compact trailing={trailing}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <p className="text-signal-red">{error}</p>
          <Link to="/">
            <Button variant="secondary">Back to setup</Button>
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell compact trailing={trailing}>
      <div className="flex flex-1 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
        {/* Config summary */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-steel-700/30 pb-3 text-xs">
          {loadingSession || !session ? (
            <span className="text-steel-500">Loading session…</span>
          ) : (
            <>
              <SummaryItem
                label="Mode"
                value={mode === 'alloy' ? 'Alloy Insight' : 'Process Insight'}
              />
              <SummaryItem label="Material" value={session.config.materialLabel} />
              <SummaryItem
                label="Process"
                value={getProcessLabel(session.config.processType)}
              />
              <SummaryItem
                label="Melt temp"
                value={`${session.config.meltingTempC} °C`}
                mono
              />
              <SummaryItem label="Data" value={session.config.dataSourceName} mono />
              <SummaryItem
                label="Config"
                value={session.config.configName}
                mono
              />
              <span className="ml-auto font-mono text-steel-600">
                {session.id}
              </span>
            </>
          )}
        </div>

        {/* 2×2 viz grid */}
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2 lg:grid-rows-2">
          <Panel title="Thermal profile">
            {mode === 'alloy' ? (
              <ThermalProfilePanel
                layers={thermalLayers}
                activeLayer={thermalLayer}
                onSelectLayer={setThermalLayer}
                loading={loadingThermal}
              />
            ) : (
              <RawImagesPanel
                frames={frames}
                selectedId={selectedFrameId}
                onSelect={setSelectedFrameId}
                loading={loadingFrames}
              />
            )}
          </Panel>
          <Panel title={mode === 'alloy' ? 'Melt pool images' : 'Thresholded data'}>
            {mode === 'alloy' ? (
              <MeltPoolImagesPanel
                frames={frameWindow?.frames ?? []}
                total={activeLayer?.frameCount ?? 0}
                position={thermalPos}
                onSeek={seek}
                stats={frameStats}
                meltThresholdC={thermalIndex?.meltThresholdC ?? 1560}
                loading={loadingThermal}
                error={thermalError}
              />
            ) : (
              <ThresholdPanel overlay={overlay} loading={loadingOverlay} />
            )}
          </Panel>
          <Panel title="3D reconstruction">
            <Reconstruction3D data={recon} loading={loading3d} />
          </Panel>
          <Panel title="Three color 3D image">
            <ThreeColor3D data={threeColor} loading={loading3d} />
          </Panel>
        </div>

        <StatsStrip stats={stats} loading={loadingStats} />
      </div>
    </AppShell>
  )
}

function SummaryItem({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="uppercase tracking-[0.08em] text-steel-500">{label}</span>
      <span className={mono ? 'font-mono text-steel-200' : 'text-steel-200'}>
        {value}
      </span>
    </span>
  )
}
