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
import { userMessage } from '../api/errors'
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
import { ThermalSurface3D } from '../components/analysis/ThermalSurface3D'
import { ThermalZones3D } from '../components/analysis/ThermalZones3D'
import {
  getCalibration,
  getThermalField,
  type Calibration,
  type ThermalField,
} from '../api/thermalField'
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
  const [overlayError, setOverlayError] = useState<string | null>(null)

  const [thermalIndex, setThermalIndex] = useState<ThermalLayerIndex | null>(null)
  const [frameWindow, setFrameWindow] = useState<ThermalFrameWindow | null>(null)
  const [frameStats, setFrameStats] = useState<ThermalFrameStats | null>(null)
  const [loadingThermal, setLoadingThermal] = useState(false)
  const [thermalError, setThermalError] = useState<string | null>(null)
  const [field, setField] = useState<ThermalField | null>(null)
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  /** Assumed lower band edge — only the machine's melt threshold is authoritative. */
  const TRANSITION_C = 1400

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
      } catch {
        if (!cancelled) {
          setError('This analysis could not be loaded. It may have expired — start again from setup.')
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
      setOverlayError(null)
      try {
        const th = await getThreshold(sessionId, selectedFrameId!)
        if (!cancelled) setOverlay(th)
      } catch (err) {
        if (!cancelled) {
          setOverlay(null)
          // Distinct from the empty state — a failure must not read as "select a layer".
          setOverlayError(userMessage(err, 'Couldn’t load this layer — try another layer.'))
        }
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
          if (!known) {
            // Open mid-build, mid-layer. Layer 1 is the cold start, where the
            // camera and machine log agree least, and a layer's first frame
            // can be blank as the laser starts the track.
            const opening = index.layers[Math.floor(index.layers.length / 2)]
            setThermalLayer(opening.layer)
            setThermalPos(Math.floor(opening.frameCount / 2))
          }
        }
      } catch (err) {
        if (!cancelled) {
          setThermalError(userMessage(err, 'Couldn’t prepare thermal frames for this build.'))
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
  }, [sessionId, mode, setThermalLayer, setThermalPos])

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
          setThermalError(userMessage(err, 'Couldn’t load melt-pool frames for this layer.'))
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
          setThermalError(userMessage(err, 'Couldn’t read this frame. Try the next frame.'))
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, mode, thermalLayer, thermalPos])

  // Calibration is memoised at module level; this just mirrors it into state.
  useEffect(() => {
    if (mode !== 'alloy') return
    let cancelled = false
    getCalibration()
      .then((c) => {
        if (!cancelled) setCalibration(c)
      })
      .catch((err) => {
        if (!cancelled) {
          setFieldError(userMessage(err, 'Couldn’t load the camera calibration.'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  // The raw temperature field for the current frame; feeds both 3D panels.
  const buildId = thermalIndex?.buildId
  useEffect(() => {
    if (mode !== 'alloy' || !buildId || thermalLayer === null) return
    const controller = new AbortController()

    getThermalField(buildId, thermalLayer, thermalPos, 2, controller.signal)
      .then((f) => {
        setField(f)
        setFieldError(null)
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setField(null)
        setFieldError(userMessage(err, 'Couldn’t load temperature data for this frame.'))
      })

    return () => controller.abort()
  }, [mode, buildId, thermalLayer, thermalPos])

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

  // e.g. "10-pass · R5 · 56 layers × 0.9 mm", from the decoded build id.
  const run = session?.config.sampleId.match(/r(\d+)$/i)?.[1]
  const buildShape = session?.config.passes
    ? [
        `${session.config.passes}-pass`,
        run ? `R${run}` : null,
        session.config.layers && session.config.layerHeightMm
          ? `${session.config.layers} layers × ${session.config.layerHeightMm.toFixed(1)} mm`
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  const trailing = (
    <Link to="/">
      <Button variant="ghost" className="text-xs">
        Change build
      </Button>
    </Link>
  )

  if (error) {
    return (
      <AppShell compact trailing={trailing}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <p className="max-w-md text-center text-signal-red-text">{error}</p>
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
            <span className="text-steel-400">Loading analysis…</span>
          ) : (
            <>
              <span className="rounded-sm border border-steel-600/60 bg-steel-800/70 px-2 py-0.5 text-xs font-medium text-steel-50">
                {mode === 'alloy' ? 'Alloy Insight' : 'Process Insight'}
              </span>
              <SummaryItem
                label="Build"
                value={session.config.sampleId}
                mono
                title={`Session ${session.id}`}
              />
              <SummaryItem label="Material" value={session.config.materialLabel} />
              {buildShape && <span className="text-steel-300">{buildShape}</span>}
              {mode === 'alloy' && thermalIndex && (
                <SummaryItem
                  label="Melt threshold"
                  value={`${thermalIndex.meltThresholdC.toFixed(0)} °C`}
                  mono
                  note="(machine log)"
                />
              )}
            </>
          )}
        </div>

        {/* 2×2 viz grid */}
        {/* Row heights come from the panels' viz-primary / viz-secondary sizes. */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Layer Temperature Profile">
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
          <Panel title={mode === 'alloy' ? 'Melt Pool Images' : 'Layer Melt-Pool Deviation'}>
            {mode === 'alloy' ? (
              <MeltPoolImagesPanel
                frames={frameWindow?.frames ?? []}
                total={activeLayer?.frameCount ?? 0}
                position={thermalPos}
                onSeek={seek}
                stats={frameStats}
                meltThresholdC={thermalIndex?.meltThresholdC ?? 1560}
                tempMaxC={thermalIndex?.tempRangeC[1]}
                loading={loadingThermal}
                error={thermalError}
              />
            ) : (
              <ThresholdPanel overlay={overlay} loading={loadingOverlay} error={overlayError} />
            )}
          </Panel>
          <Panel title={mode === 'alloy' ? 'Temperature Distribution' : 'Estimated Wall Geometry'}>
            {mode === 'alloy' ? (
              <ThermalSurface3D
                field={field}
                calibration={calibration}
                meltThresholdC={thermalIndex?.meltThresholdC ?? 1560}
                loading={loadingThermal || !field}
                error={fieldError}
              />
            ) : (
              <Reconstruction3D data={recon} loading={loading3d} />
            )}
          </Panel>
          <Panel title={mode === 'alloy' ? 'Thermal Zones' : 'Layer Stability Map'}>
            {mode === 'alloy' ? (
              <ThermalZones3D
                field={field}
                calibration={calibration}
                thresholdCount={497}
                meltThresholdC={thermalIndex?.meltThresholdC ?? 1560}
                transitionC={TRANSITION_C}
                loading={loadingThermal || !field}
                error={fieldError}
              />
            ) : (
              <ThreeColor3D data={threeColor} loading={loading3d} />
            )}
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
  title,
  note,
}: {
  label: string
  value: string
  mono?: boolean
  title?: string
  note?: string
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5" title={title}>
      <span className="uppercase tracking-[0.08em] text-steel-400">{label}</span>
      <span className={mono ? 'font-mono text-steel-100' : 'text-steel-100'}>{value}</span>
      {note && <span className="text-steel-400">{note}</span>}
    </span>
  )
}
