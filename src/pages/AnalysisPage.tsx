import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createSession,
  getFrames,
  getReconstruction,
  getSession,
  getStats,
  getThreeColor,
  getThreshold,
} from '../api/sessions'
import {
  getAnomalies,
  getBuildBrief,
  getLayerFrameAnomalies,
} from '../api/anomaly'
import { userMessage } from '../api/errors'
import type {
  AnalysisSession,
  AnomalyReport,
  MeltPoolPhysics,
  AnomalySeverity,
  BuildBrief,
  Frame,
  LayerFrameAnomalies,
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
import { SuperResolutionPanel } from '../components/analysis/SuperResolutionPanel'
import {
  MeltPoolBoundaryPanel,
  SolidificationRatePanel,
  ThermalGradientPanel,
} from '../components/analysis/PhysicsPanels'
import { getMeltPoolPhysics } from '../api/physics'
import { AnomalyBanner } from '../components/analysis/AnomalyBanner'
import { BuildBriefStrip } from '../components/analysis/BuildBriefStrip'
import { QueryPanel } from '../components/analysis/QueryPanel'
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

  const [report, setReport] = useState<AnomalyReport | null>(null)
  const [brief, setBrief] = useState<BuildBrief | null>(null)
  const [loadingReport, setLoadingReport] = useState(true)
  const [frameAnomalies, setFrameAnomalies] = useState<LayerFrameAnomalies | null>(null)
  const [switching, setSwitching] = useState(false)
  const [layerNotice, setLayerNotice] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const [fieldFull, setFieldFull] = useState<ThermalField | null>(null)
  const [physics, setPhysics] = useState<MeltPoolPhysics | null>(null)
  const [physicsError, setPhysicsError] = useState<string | null>(null)
  const [thermalIndex, setThermalIndex] = useState<ThermalLayerIndex | null>(null)
  const [frameWindow, setFrameWindow] = useState<ThermalFrameWindow | null>(null)
  const [frameStats, setFrameStats] = useState<ThermalFrameStats | null>(null)
  const [loadingThermal, setLoadingThermal] = useState(false)
  const [thermalError, setThermalError] = useState<string | null>(null)
  const [field, setField] = useState<ThermalField | null>(null)
  const [calibration, setCalibration] = useState<Calibration | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const navigate = useNavigate()
  const mode = session?.config.mode === 'alloy' ? 'alloy' : 'process'
  const WINDOW = 24
  /** The threshold the operator set in setup, if they changed it. */
  const thresholdC = session?.config.thresholdC ?? null

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

        setLoadingReport(true)

        const [fr, mesh, vol, st, rep, br] = await Promise.all([
          getFrames(sessionId),
          getReconstruction(sessionId),
          getThreeColor(sessionId),
          getStats(sessionId),
          getAnomalies(sessionId),
          getBuildBrief(sessionId),
        ])
        if (cancelled) return
        setFrames(fr)
        setRecon(mesh)
        setThreeColor(vol)
        setStats(st)
        setReport(rep)
        setBrief(br)
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
          setLoadingReport(false)
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
          const current = index.layers.find((l) => l.layer === thermalLayer)
          if (!current && thermalLayer !== null) {
            /*
             * Arrived on a layer with no captured frames — a build's frames can
             * stop short of its last layer. Snap to the nearest layer that has
             * them and say so, rather than silently showing somewhere else.
             */
            const nearest = index.layers.reduce((best, l) =>
              Math.abs(l.layer - thermalLayer) < Math.abs(best.layer - thermalLayer) ? l : best,
            )
            setThermalLayer(nearest.layer)
            setThermalPos(Math.floor(nearest.frameCount / 2))
            const first = index.layers[0].layer
            const last = index.layers[index.layers.length - 1].layer
            setLayerNotice(
              `Layer ${thermalLayer} has no captured frames — showing layer ${nearest.layer}, the nearest that does. Frames were recorded for layers ${first}–${last} of this build.`,
            )
          } else if (!current) {
            // Open mid-build, mid-layer. Layer 1 is the cold start, where the
            // camera and machine log agree least, and a layer's first frame
            // can be blank as the laser starts the track.
            const opening = index.layers[Math.floor(index.layers.length / 2)]
            setThermalLayer(opening.layer)
            setThermalPos(Math.floor(opening.frameCount / 2))
          } else if (thermalPos === 0) {
            // Arrived on a layer chosen elsewhere — an anomaly jump or a chart
            // click — so land mid-layer for the same reason.
            setThermalPos(Math.floor(current.frameCount / 2))
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
        const w = await getThermalWindow(
          sessionId,
          thermalLayer!,
          windowStart,
          WINDOW,
          thresholdC,
        )
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
  }, [sessionId, mode, thermalLayer, windowStart, thresholdC])

  // Per-frame numbers, computed against the machine's own log.
  useEffect(() => {
    if (!sessionId || mode !== 'alloy' || thermalLayer === null) return
    let cancelled = false

    async function load() {
      try {
        const s = await getThermalFrameStats(
          sessionId,
          thermalLayer!,
          thermalPos,
          thresholdC,
        )
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
  }, [sessionId, mode, thermalLayer, thermalPos, thresholdC])

  // Which frames of the pinned layer left the build's steady state.
  useEffect(() => {
    if (!sessionId || mode !== 'alloy' || thermalLayer === null) return
    let cancelled = false

    getLayerFrameAnomalies(sessionId, thermalLayer)
      .then((a) => {
        if (!cancelled) setFrameAnomalies(a)
      })
      .catch(() => {
        // The panel simply shows no deviation track.
        if (!cancelled) setFrameAnomalies(null)
      })

    return () => {
      cancelled = true
    }
  }, [sessionId, mode, thermalLayer])

  /*
   * Thermal gradient and solidification rate for the current frame. Measured
   * on the boundary the threshold in force draws, so it refetches when the
   * operator changes the threshold.
   */
  useEffect(() => {
    if (!sessionId || mode !== 'alloy' || thermalLayer === null) return
    let cancelled = false

    getMeltPoolPhysics(sessionId, thermalLayer, thermalPos, thresholdC)
      .then((p) => {
        if (cancelled) return
        setPhysics(p)
        setPhysicsError(null)
      })
      .catch((err) => {
        if (cancelled) return
        setPhysics(null)
        setPhysicsError(
          userMessage(err, 'Couldn’t measure the melt-pool boundary in this frame.'),
        )
      })

    return () => {
      cancelled = true
    }
  }, [sessionId, mode, thermalLayer, thermalPos, thresholdC])

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

  /*
   * The super-resolution comparison needs native pixels, so it fetches the
   * field at stride 1 rather than the stride-2 version the 3D views use —
   * upscaling an already-decimated field would not be an honest "raw" view.
   */
  useEffect(() => {
    if (mode !== 'alloy' || !buildId || thermalLayer === null) return
    const controller = new AbortController()

    getThermalField(buildId, thermalLayer, thermalPos, 1, controller.signal)
      .then(setFieldFull)
      .catch(() => {
        if (!controller.signal.aborted) setFieldFull(null)
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

  /** Flagged layers, keyed for the chart and the layer rail. */
  const flagged = useMemo(() => {
    const map = new Map<number, AnomalySeverity>()
    for (const a of report?.anomalies ?? []) map.set(a.layer, a.severity)
    return map
  }, [report])

  /**
   * Selects a layer in whichever mode is open.
   *
   * In Alloy Insight not every layer has captured frames, so a click on the
   * chart snaps to the nearest layer that does rather than failing.
   */
  function selectLayer(layer: number) {
    if (mode !== 'alloy') {
      setSelectedFrameId(`L${layer}`)
      return
    }
    if (!thermalLayers.length) return
    const nearest = thermalLayers.reduce((best, l) =>
      Math.abs(l.layer - layer) < Math.abs(best.layer - layer) ? l : best,
    )
    setLayerNotice(
      nearest.layer === layer
        ? null
        : `Layer ${layer} has no captured frames — showing layer ${nearest.layer}, the nearest that does.`,
    )
    setThermalLayer(nearest.layer)
  }

  /**
   * Opens the same layer in the other mode.
   *
   * A session is per-mode on the server, so this creates the counterpart
   * session for the same build and carries the layer across — the path from
   * "this layer drifted" to "here are its frames" and back.
   */
  async function openOtherMode(layer: number) {
    if (!session || switching) return
    setSwitching(true)
    setSwitchError(null)
    try {
      const next = await createSession({
        ...session.config,
        mode: mode === 'alloy' ? 'process' : 'alloy',
      })
      if (mode === 'alloy') setSelectedFrameId(`L${layer}`)
      else setThermalLayer(layer)
      navigate(`/analysis/${next.id}`)
    } catch (err) {
      setSwitchError(
        userMessage(
          err,
          mode === 'alloy'
            ? 'Could not open Process Insight for this build.'
            : 'This build has no thermal frames, so Alloy Insight cannot open it.',
        ),
      )
    } finally {
      setSwitching(false)
    }
  }

  // Only thermal builds can open Alloy Insight; every build has Process.
  const canOpenOtherMode = mode === 'alloy' || (brief?.monitoringFrames ?? 0) > 0

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
          <p className="max-w-md text-center text-sm leading-relaxed text-signal-red-text">{error}</p>
          <Link to="/">
            <Button variant="secondary">Back to setup</Button>
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell compact trailing={trailing}>
      <div className="flex flex-1 flex-col gap-3 px-3 py-3 sm:gap-3.5 sm:px-4 sm:py-4">
        {/* Config summary */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[color:var(--border-hairline)] pb-3 text-xs">
          {loadingSession || !session ? (
            <span className="text-steel-400">Loading analysis…</span>
          ) : (
            <>
              <span className="rounded-sm border border-accent-600/50 bg-accent-500/12 px-2 py-0.5 text-xs font-semibold tracking-tight text-accent-300">
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
                  value={`${(thresholdC ?? thermalIndex.meltThresholdC).toFixed(0)} °C`}
                  mono
                  note={thresholdC ? '(set in setup)' : '(machine log)'}
                />
              )}
            </>
          )}
        </div>

        {layerNotice && (
          <p className="status-rule surface-sunken rounded-sm border-l-accent-500 px-3 py-2 text-xs leading-relaxed text-steel-200">
            {layerNotice}
          </p>
        )}

        {switchError && (
          <p className="status-rule rounded-sm border border-[color:var(--border-hairline)] border-l-signal-red bg-signal-red/8 px-3 py-2 text-xs text-signal-red-text">
            {switchError}
          </p>
        )}

        <AnomalyBanner
          report={report}
          loading={loadingReport}
          onGoToLayer={selectLayer}
          onInspectLayer={canOpenOtherMode ? openOtherMode : null}
          inspectLabel={mode === 'alloy' ? 'Open in Process Insight' : 'Inspect frames'}
          busy={switching}
        />

        <BuildBriefStrip brief={brief} loading={loadingSession} />

        {/* 2×2 viz grid */}
        {/* Row heights come from the panels' viz-primary / viz-secondary sizes. */}
        <div className="grid gap-3 sm:gap-3.5 lg:grid-cols-2">
          <Panel title="Layer Temperature Profile">
            {mode === 'alloy' ? (
              <ThermalProfilePanel
                layers={thermalLayers}
                activeLayer={thermalLayer}
                onSelectLayer={selectLayer}
                loading={loadingThermal}
                buildLayerCount={
                  session?.config.layers ?? report?.layersAnalysed ?? thermalLayers.length
                }
                flagged={flagged}
                transitionEndLayer={report?.transition.endLayer}
              />
            ) : (
              <RawImagesPanel
                frames={frames}
                selectedId={selectedFrameId}
                onSelect={setSelectedFrameId}
                loading={loadingFrames}
                flagged={flagged}
                transitionEndLayer={report?.transition.endLayer}
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
                meltThresholdC={thresholdC ?? thermalIndex?.meltThresholdC ?? 1560}
                tempMaxC={thermalIndex?.tempRangeC[1]}
                frameAnomalies={frameAnomalies}
                loading={loadingThermal}
                error={thermalError}
              />
            ) : (
              <ThresholdPanel overlay={overlay} loading={loadingOverlay} error={overlayError} />
            )}
          </Panel>
          <Panel
            title={mode === 'alloy' ? 'Super Resolution' : 'Estimated Wall Geometry'}
          >
            {mode === 'alloy' ? (
              <SuperResolutionPanel
                field={fieldFull}
                calibration={calibration}
                thresholdC={thresholdC ?? thermalIndex?.meltThresholdC ?? 1560}
                loading={loadingThermal || !fieldFull}
                error={fieldError}
              />
            ) : (
              <Reconstruction3D data={recon} loading={loading3d} />
            )}
          </Panel>
          <Panel title={mode === 'alloy' ? 'Melt Pool Boundary' : 'Layer Stability Map'}>
            {mode === 'alloy' ? (
              <MeltPoolBoundaryPanel
                physics={physics}
                loading={loadingThermal || (!physics && !physicsError)}
                error={physicsError}
              />
            ) : (
              <ThreeColor3D data={threeColor} loading={loading3d} />
            )}
          </Panel>

          {/*
            Thermal gradient and solidification rate sit side by side because
            they are read together: G/R governs solidification morphology and
            G·R the cooling rate, so the pair is the point, not either alone.
          */}
          {mode === 'alloy' && (
            <>
              <Panel title="Thermal Gradient">
                <ThermalGradientPanel
                  physics={physics}
                  loading={loadingThermal || (!physics && !physicsError)}
                  error={physicsError}
                />
              </Panel>
              <Panel title="Solidification Rate">
                <SolidificationRatePanel
                  physics={physics}
                  loading={loadingThermal || (!physics && !physicsError)}
                  error={physicsError}
                />
              </Panel>
              <div className="lg:col-span-2">
                <Panel title="Temperature Distribution">
                  <ThermalSurface3D
                    field={field}
                    calibration={calibration}
                    meltThresholdC={thresholdC ?? thermalIndex?.meltThresholdC ?? 1560}
                    loading={loadingThermal || !field}
                    error={fieldError}
                  />
                </Panel>
              </div>
            </>
          )}
        </div>

        <StatsStrip stats={stats} loading={loadingStats} />

        {session && <QueryPanel sessionId={session.id} buildId={session.config.sampleId} />}
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
      <span className="eyebrow">{label}</span>
      <span className={mono ? 'readout' : 'text-steel-100'}>{value}</span>
      {note && <span className="text-steel-500">{note}</span>}
    </span>
  )
}
