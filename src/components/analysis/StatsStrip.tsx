import type { AlertLevel, ThresholdStats } from '../../domain/types'

interface StatsStripProps {
  stats: ThresholdStats | null
  loading?: boolean
}

const LEVEL_LABEL: Record<AlertLevel, string> = {
  stable: 'Stable',
  transition: 'Transition',
  alert: 'Alert',
}

const LEVEL_TEXT: Record<AlertLevel, string> = {
  stable: 'text-signal-green',
  transition: 'text-signal-yellow',
  alert: 'text-signal-red-text',
}

/**
 * Layer temperature stability across the build. Always derived from the
 * per-layer mean temperatures — in both modes — so it says so.
 */
export function StatsStrip({ stats, loading }: StatsStripProps) {
  if (loading || !stats) {
    return (
      <div className="panel-surface rounded-sm px-4 py-3 text-sm text-steel-400">
        {loading ? 'Loading stability summary…' : 'No layer statistics available for this build.'}
      </div>
    )
  }

  const bins = [
    {
      key: 'stable',
      label: `Stable (< ${stats.stableThreshold}% from build median)`,
      pct: stats.stablePct,
      bar: 'bg-signal-green',
    },
    {
      key: 'transition',
      label: `Transition (${stats.stableThreshold}–${stats.transitionThreshold}%)`,
      pct: stats.transitionPct,
      bar: 'bg-signal-yellow',
    },
    {
      key: 'alert',
      label: `Alert (≥ ${stats.transitionThreshold}%)`,
      pct: stats.alertPct,
      bar: 'bg-signal-red',
    },
  ] as const

  return (
    <div className="panel-surface rounded-sm px-4 py-3">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-steel-400">
            Layer Temperature Stability
          </h2>
          <p className="text-xs text-steel-400">
            From per-layer mean temperatures
            {stats.layerCount ? ` across ${stats.layerCount} layers` : ''}
          </p>
        </div>
        <p className="text-sm text-steel-300">
          Overall:{' '}
          <span className={`font-medium ${LEVEL_TEXT[stats.level]}`}>
            {LEVEL_LABEL[stats.level]}
          </span>
        </p>
      </div>

      <div className="flex h-2.5 w-full overflow-hidden rounded-sm bg-steel-900">
        {bins.map((b) => (
          <div
            key={b.key}
            className={b.bar}
            style={{ width: `${b.pct}%` }}
            title={`${b.label}: ${b.pct}%`}
          />
        ))}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {bins.map((b) => (
          <div key={b.key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${b.bar}`} />
            <span className="text-steel-400">{b.label}</span>
            <span className="ml-auto font-mono text-steel-200">{b.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
