import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCatalog } from '../../api/catalog'
import { userMessage } from '../../api/errors'
import { createSession } from '../../api/sessions'
import { MATERIALS, MATERIALS_WITH_DATA, PROCESS_TYPES } from '../../domain/materials'
import type { AnalysisMode, BuildSummary } from '../../domain/types'
import { MACHINE_MELT_THRESHOLD_C, useSetupStore } from '../../store/sessionStore'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Select } from '../ui/Select'
import { SegmentedControl } from '../ui/SegmentedControl'

/**
 * What the camera can measure, from its calibration table. A threshold outside
 * this cannot be expressed in raw counts at all, so the server rejects it.
 */
const CAMERA_MIN_C = 980
const CAMERA_MAX_C = 2008

function QualityBadge({ build }: { build: BuildSummary }) {
  if (!build.quality) return null
  const best = build.quality === 'best'
  return (
    <span
      className={[
        'rounded-sm border px-1.5 py-0.5 text-xs font-medium',
        best
          ? 'border-signal-green/35 bg-signal-green/10 text-signal-green'
          : 'border-signal-red/35 bg-signal-red/10 text-signal-red-text',
      ].join(' ')}
      title="From the coupon quality ranking, which names the highest- and lowest-rated coupon in each pass group"
    >
      {best ? 'Highest-rated' : 'Lowest-rated'} in {build.passes}-pass group
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
      } catch {
        if (!cancelled) {
          setCatalogError('Couldn’t load the build list. Check the connection and reload the page.')
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

  // Keep the selection valid whenever the catalog loads or the filter narrows,
  // preferring a build that can run both analyses so neither path starts disabled.
  useEffect(() => {
    if (!visible.length) return
    if (visible.some((b) => b.id === sampleId)) return
    setSampleId((visible.find((b) => b.hasThermal) ?? visible[0]).id)
  }, [visible, sampleId, setSampleId])

  const selected = builds.find((b) => b.id === sampleId) ?? null
  const selectedMaterial = MATERIALS.find((m) => m.id === materialId) ?? null
  const selectedMaterialLabel = selectedMaterial?.label ?? 'This alloy'
  const materialMeltC = selectedMaterial?.defaultMeltTempC ?? null
  const busy = submitting !== null || loadingCatalog
  const thermalCount = builds.filter((b) => b.hasThermal).length
  const filtered = passFilter !== null || thermalOnly

  const alloyUnavailable =
    !selected || selected.hasThermal
      ? null
      : selected.hasRawFrames
        ? 'Alloy Insight is unavailable for this build: its frames have no position log, so they can’t be matched to layers.'
        : 'Alloy Insight is unavailable for this build: no thermal-camera frames were recorded.'

  async function run(mode: AnalysisMode) {
    setError(null)

    if (!Number.isFinite(meltingTempC)) {
      setTempError('Enter a threshold in °C.')
      return
    }
    if (meltingTempC < CAMERA_MIN_C || meltingTempC > CAMERA_MAX_C) {
      setTempError(
        `The camera measures ${CAMERA_MIN_C}–${CAMERA_MAX_C} °C; pick a threshold inside that range.`,
      )
      return
    }
    setTempError(null)

    if (!sampleId) {
      setError('Select a coupon build to analyse.')
      return
    }

    setSubmitting(mode)
    try {
      const session = await createSession(toConfig(mode))
      navigate(`/analysis/${session.id}`)
    } catch (err) {
      setError(userMessage(err, 'Couldn’t start the analysis. Try again.'))
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
      <p className="eyebrow -mb-3 text-steel-500">Step 1 of 2</p>

      <Field
        label="Coupon build"
        htmlFor="sample"
        hint={
          catalogError
            ? undefined
            : loadingCatalog
              ? 'Loading builds…'
              : `${builds.length} builds · ${thermalCount} with thermal-camera frames${filtered ? ` · showing ${visible.length}` : ''}`
        }
        error={catalogError ?? undefined}
      >
        <div className="flex flex-col gap-2">
          {passOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter builds">
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
                label="With thermal frames"
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
        <div className="surface-sunken -mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-sm px-3 py-2.5 text-xs">
          <Detail label="Layers" value={String(selected.layers)} />
          <Detail label="Increment" value={`${selected.layerHeightMm.toFixed(1)} mm`} />
          <Detail label="Built height" value={`${selected.targetHeightMm} mm`} />
          <Detail label="Passes" value={String(selected.passes)} />
          {selected.geometryHeightDeviationMm !== null && (
            <span
              className="inline-flex items-baseline gap-1.5"
              title="Mean deviation of the finished top face from nominal, measured off the machine by GOM. Negative means the wall came out short."
            >
              <span className="eyebrow">Measured height</span>
              <span
                className={`readout ${
                  Math.abs(selected.geometryHeightDeviationMm) >= 5
                    ? 'text-signal-yellow'
                    : 'text-steel-200'
                }`}
              >
                {selected.geometryHeightDeviationMm >= 0 ? '+' : ''}
                {selected.geometryHeightDeviationMm.toFixed(1)} mm
              </span>
            </span>
          )}
          <QualityBadge build={selected} />
          <span
            className="ml-auto text-xs text-steel-400"
            title={
              selected.hasKivImages
                ? 'Per-layer temperature and size histogram images exist for this build'
                : 'No histogram images — layer charts are drawn from the per-layer mean values'
            }
          >
            {selected.hasKivImages ? 'Layer histograms' : 'Layer means only'}
            {selected.hasThermal ? ' · thermal frames' : ''}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Button type="submit" disabled={busy || !sampleId}>
              {submitting === 'process' ? 'Starting…' : 'Process Insight'}
            </Button>
            <p className="text-xs leading-relaxed text-steel-500">
              Layer-by-layer temperature and melt-pool trends
              {builds.length ? ` for all ${builds.length} builds` : ''}.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void run('alloy')}
              disabled={busy || !sampleId || !selected?.hasThermal}
              title={alloyUnavailable ?? undefined}
            >
              {submitting === 'alloy' ? 'Starting…' : 'Alloy Insight'}
            </Button>
            <p className="text-xs leading-relaxed text-steel-500">
              Melt-pool images segmented from thermal-camera frames
              {thermalCount ? ` (${thermalCount} ${thermalCount === 1 ? 'build' : 'builds'})` : ''}.
            </p>
          </div>
        </div>
        {alloyUnavailable && (
          <p className="text-xs leading-relaxed text-steel-400">{alloyUnavailable}</p>
        )}
        {error && (
          <p className="status-rule rounded-sm border border-[color:var(--border-hairline)] border-l-signal-red bg-signal-red/8 px-3 py-2 text-sm text-signal-red-text">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 border-t border-[color:var(--border-hairline)] pt-6">
        <p className="eyebrow">Detection parameters</p>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="Material"
            htmlFor="material"
            hint="Every build in this dataset is 316L stainless steel."
          >
            <Select
              id="material"
              options={MATERIALS.map((m) => {
                const hasData = MATERIALS_WITH_DATA.has(m.id)
                return {
                  value: m.id,
                  label: hasData ? m.label : `${m.label} (no data)`,
                  disabled: !hasData,
                }
              })}
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
            />
          </Field>

          <Field
            label="Melt-pool threshold"
            htmlFor="melt-temp"
            hint={
              meltingTempC === MACHINE_MELT_THRESHOLD_C
                ? `Pixels hotter than this are counted as melt pool. ${MACHINE_MELT_THRESHOLD_C} °C is the machine’s own logged threshold${
                    materialMeltC ? ` · ${selectedMaterialLabel} melts near ${materialMeltC} °C` : ''
                  }.`
                : `Your threshold, not the machine’s ${MACHINE_MELT_THRESHOLD_C} °C — segmentation and every melt-pool number will use ${meltingTempC} °C.`
            }
            error={tempError ?? undefined}
          >
            <div className="relative">
              <input
                id="melt-temp"
                type="number"
                min={CAMERA_MIN_C}
                max={CAMERA_MAX_C}
                step={10}
                value={meltingTempC}
                onChange={(e) => setMeltingTempC(Number(e.target.value))}
                className="ctl w-full px-3 py-2 pr-12 font-mono text-sm text-steel-100"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-steel-400">
                °C
              </span>
            </div>
            {meltingTempC !== MACHINE_MELT_THRESHOLD_C && (
              <button
                type="button"
                onClick={() => setMeltingTempC(MACHINE_MELT_THRESHOLD_C)}
                className="focus-ring mt-2 self-start text-xs text-steel-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-steel-200"
              >
                Reset to the machine’s {MACHINE_MELT_THRESHOLD_C} °C
              </button>
            )}
          </Field>
        </div>

        <Field label="Process (recorded for reference)">
          <SegmentedControl
            name="process-type"
            value={processType}
            options={PROCESS_TYPES.map((p) => ({ value: p.id, label: p.label }))}
            onChange={setProcessType}
          />
        </Field>
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
        'focus-ring rounded-sm border px-2.5 py-1 text-xs transition-colors duration-100',
        active
          ? 'border-accent-600/60 bg-accent-500/12 text-steel-50'
          : 'border-[color:var(--border-hairline)] bg-steel-900/40 text-steel-300 hover:border-[color:var(--border-control-hover)] hover:text-steel-100',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="eyebrow">{label}</span>
      <span className="readout text-steel-200">{value}</span>
    </span>
  )
}
