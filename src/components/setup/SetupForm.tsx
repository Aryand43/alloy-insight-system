import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCatalog } from '../../api/catalog'
import { createSession } from '../../api/sessions'
import { MATERIALS, PROCESS_TYPES } from '../../domain/materials'
import type { AnalysisMode, BuildSummary } from '../../domain/types'
import { useSetupStore } from '../../store/sessionStore'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Select } from '../ui/Select'
import { SegmentedControl } from '../ui/SegmentedControl'

function QualityBadge({ quality }: { quality: BuildSummary['quality'] }) {
  if (!quality) return null
  const best = quality === 'best'
  return (
    <span
      className={[
        'rounded-sm border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em]',
        best
          ? 'border-signal-green/40 bg-signal-green/10 text-signal-green'
          : 'border-signal-red/40 bg-signal-red/10 text-signal-red',
      ].join(' ')}
      title="Verdict from COUPON QUALITY.xlsx, which ranks one best and one worst coupon per pass group"
    >
      {best ? 'best of group' : 'worst of group'}
    </span>
  )
}

export function SetupForm() {
  const navigate = useNavigate()
  const {
    materialId,
    processType,
    meltingTempC,
    sampleId,
    passFilter,
    thermalOnly,
    setThermalOnly,
    setMaterialId,
    setProcessType,
    setMeltingTempC,
    setSampleId,
    setPassFilter,
    toConfig,
  } = useSetupStore()

  const [builds, setBuilds] = useState<BuildSummary[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<AnalysisMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tempError, setTempError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingCatalog(true)
      setCatalogError(null)
      try {
        const list = await getCatalog()
        if (cancelled) return
        setBuilds(list)
      } catch (err) {
        if (!cancelled) {
          setCatalogError(
            err instanceof Error ? err.message : 'Could not load the build catalog',
          )
        }
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const passOptions = useMemo(
    () => [...new Set(builds.map((b) => b.passes))].sort((a, b) => a - b),
    [builds],
  )

  const visible = useMemo(() => {
    let list = builds
    if (passFilter !== null) list = list.filter((b) => b.passes === passFilter)
    if (thermalOnly) list = list.filter((b) => b.hasThermal)
    return list
  }, [builds, passFilter, thermalOnly])

  // Keep the selection valid whenever the catalog loads or the filter narrows.
  useEffect(() => {
    if (!visible.length) return
    if (!visible.some((b) => b.id === sampleId)) setSampleId(visible[0].id)
  }, [visible, sampleId, setSampleId])

  const selected = builds.find((b) => b.id === sampleId) ?? null
  const busy = submitting !== null || loadingCatalog

  // Only 7 of 26 builds recorded raw frames, and one of those cannot be used.
  const thermalHint = !selected
    ? null
    : selected.hasThermal
      ? null
      : selected.hasRawFrames
        ? `${selected.id} has raw frames but no Data.dat, so they cannot be mapped to layers. Alloy Insight is unavailable.`
        : `${selected.id} has no raw thermal frames — only 7 of ${builds.length} builds recorded them. Alloy Insight is unavailable.`

  async function run(mode: AnalysisMode) {
    setError(null)

    if (!Number.isFinite(meltingTempC) || meltingTempC <= 0) {
      setTempError('Enter a valid melting temperature in °C.')
      return
    }
    setTempError(null)

    if (!sampleId) {
      setError('Select a build sample to analyse.')
      return
    }

    setSubmitting(mode)
    try {
      const session = await createSession(toConfig(mode))
      navigate(`/analysis/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void run('process')
      }}
      className="flex flex-col gap-6"
    >
      <Field
        label="Build sample"
        htmlFor="sample"
        hint={
          catalogError
            ? undefined
            : loadingCatalog
              ? 'Loading builds…'
              : `${builds.length} builds available${passFilter === null ? '' : ` · showing ${visible.length}`}`
        }
        error={catalogError ?? undefined}
      >
        <div className="flex flex-col gap-2">
          {passOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by pass count">
              <FilterChip
                active={passFilter === null}
                onClick={() => setPassFilter(null)}
                label="All"
              />
              {passOptions.map((p) => (
                <FilterChip
                  key={p}
                  active={passFilter === p}
                  onClick={() => setPassFilter(p)}
                  label={`${p}-pass`}
                />
              ))}
              <FilterChip
                active={thermalOnly}
                onClick={() => setThermalOnly(!thermalOnly)}
                label="Thermal only"
              />
            </div>
          )}
          <Select
            id="sample"
            disabled={loadingCatalog || !visible.length}
            options={visible.map((b) => ({ value: b.id, label: b.label }))}
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
          />
        </div>
      </Field>

      {selected && (
        <div className="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded border border-steel-700/40 bg-steel-900/40 px-3 py-2.5 text-xs">
          <Detail label="Layers" value={String(selected.layers)} />
          <Detail label="Increment" value={`${selected.layerHeightMm.toFixed(1)} mm`} />
          <Detail label="Built height" value={`${selected.targetHeightMm} mm`} />
          <Detail label="Passes" value={String(selected.passes)} />
          <QualityBadge quality={selected.quality} />
          <span
            className="ml-auto text-[11px] text-steel-500"
            title={
              selected.hasKivImages
                ? 'Per-layer KIV histogram images exist for this build'
                : 'No KIV images — layer charts are generated from the spreadsheet means'
            }
          >
            {selected.hasKivImages ? 'KIV images' : 'spreadsheet only'}
            {selected.hasThermal ? ' · thermal frames' : ''}
          </span>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Materials" htmlFor="material">
          <Select
            id="material"
            options={MATERIALS.map((m) => ({ value: m.id, label: m.label }))}
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          />
        </Field>

        <Field
          label="Melting temperature"
          htmlFor="melt-temp"
          hint="Ensure the melting temperature is accurate."
          error={tempError ?? undefined}
        >
          <div className="relative">
            <input
              id="melt-temp"
              type="number"
              min={1}
              step={1}
              value={meltingTempC}
              onChange={(e) => setMeltingTempC(Number(e.target.value))}
              className="w-full rounded border border-steel-600/50 bg-steel-900/80 px-3 py-2.5 pr-12 font-mono text-sm text-steel-100 focus:border-signal-yellow/50 focus:outline-none focus:ring-1 focus:ring-signal-yellow/30"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-steel-500">
              °C
            </span>
          </div>
        </Field>
      </div>

      <Field label="Type of process">
        <SegmentedControl
          name="process-type"
          value={processType}
          options={PROCESS_TYPES.map((p) => ({ value: p.id, label: p.label }))}
          onChange={setProcessType}
        />
      </Field>

      {error && (
        <p className="rounded border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={busy || !sampleId}
            className="min-w-[11rem]"
          >
            {submitting === 'process' ? 'Starting…' : 'Process Insight'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void run('alloy')}
            disabled={busy || !sampleId || !selected?.hasThermal}
            className="min-w-[11rem]"
            title={thermalHint ?? 'Threshold the raw thermal frames at the melt temperature'}
          >
            {submitting === 'alloy' ? 'Starting…' : 'Alloy Insight'}
          </Button>
          <p className="text-xs text-steel-500">Stage 1 of 2 — process setup</p>
        </div>
        <p className="text-xs text-steel-500 leading-relaxed">
          {thermalHint ?? (
            <>
              <span className="text-steel-400">Process Insight</span> reads the
              per-layer spreadsheet summaries.{' '}
              <span className="text-steel-400">Alloy Insight</span> thresholds
              this build&rsquo;s raw thermal frames at the melt temperature.
            </>
          )}
        </p>
      </div>
    </form>
  )
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'rounded-sm border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-signal-yellow/40 bg-steel-800/80 text-steel-50'
          : 'border-steel-700/40 bg-steel-900/40 text-steel-400 hover:border-steel-600/60',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="uppercase tracking-[0.08em] text-steel-500">{label}</span>
      <span className="font-mono text-steel-200">{value}</span>
    </span>
  )
}
