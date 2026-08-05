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
import { useAnalysisUiStore } from '../store/sessionStore'
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
  const { selectedFrameId, setSelectedFrameId } = useAnalysisUiStore()

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
          <Panel title="Raw images">
            <RawImagesPanel
              frames={frames}
              selectedId={selectedFrameId}
              onSelect={setSelectedFrameId}
              loading={loadingFrames}
            />
          </Panel>
          <Panel title="Thresholded data">
            <ThresholdPanel overlay={overlay} loading={loadingOverlay} />
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
