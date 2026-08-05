import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createSession } from '../../api/sessions'
import { MATERIALS, PROCESS_TYPES } from '../../domain/materials'
import { useSetupStore } from '../../store/sessionStore'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Select } from '../ui/Select'
import { SegmentedControl } from '../ui/SegmentedControl'

export function SetupForm() {
  const navigate = useNavigate()
  const {
    materialId,
    processType,
    meltingTempC,
    dataSourceName,
    configName,
    setMaterialId,
    setProcessType,
    setMeltingTempC,
    setDataSourceName,
    setConfigName,
    toConfig,
  } = useSetupStore()

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tempError, setTempError] = useState<string | null>(null)

  function onDataFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setDataSourceName(file.name)
  }

  function onConfigFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setConfigName(file.name)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!Number.isFinite(meltingTempC) || meltingTempC <= 0) {
      setTempError('Enter a valid melting temperature in °C.')
      return
    }
    setTempError(null)
    setSubmitting(true)

    try {
      const session = await createSession(toConfig())
      navigate(`/analysis/${session.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Materials" htmlFor="material">
          <Select
            id="material"
            options={MATERIALS.map((m) => ({
              value: m.id,
              label: m.label,
            }))}
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
          options={PROCESS_TYPES.map((p) => ({
            value: p.id,
            label: p.label,
          }))}
          onChange={setProcessType}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Data"
          htmlFor="data-source"
          hint={dataSourceName || 'Image sequence or archive'}
        >
          <label className="flex cursor-pointer items-center gap-3 rounded border border-dashed border-steel-600/50 bg-steel-900/50 px-3 py-3 transition-colors hover:border-steel-500">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-steel-600 text-steel-400">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 2v8M4.5 6.5 8 3l3.5 3.5M3 12h10"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm text-steel-200">
                {dataSourceName || 'Select dataset…'}
              </p>
            </div>
            <input
              id="data-source"
              type="file"
              accept="image/*,.zip,.tar"
              className="sr-only"
              onChange={onDataFile}
            />
          </label>
        </Field>

        <Field label="Configuration" htmlFor="config-source">
          <label className="flex cursor-pointer items-center gap-3 rounded border border-steel-600/50 bg-steel-900/50 px-3 py-3 transition-colors hover:border-steel-500">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm text-steel-200">
                {configName}
              </p>
              <p className="mt-0.5 text-xs text-steel-500">JSON / YAML / preset</p>
            </div>
            <input
              id="config-source"
              type="file"
              accept=".json,.yaml,.yml"
              className="sr-only"
              onChange={onConfigFile}
            />
          </label>
        </Field>
      </div>

      {error && (
        <p className="rounded border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" disabled={submitting} className="min-w-[10rem]">
          {submitting ? 'Starting…' : 'Run analysis'}
        </Button>
        <p className="text-xs text-steel-500">
          Stage 1 of 2 — process setup
        </p>
      </div>
    </form>
  )
}
