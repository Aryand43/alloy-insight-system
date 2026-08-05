import type { ThresholdStats } from '../../domain/types'

interface StatsStripProps {
  stats: ThresholdStats | null
  loading?: boolean
}

export function StatsStrip({ stats, loading }: StatsStripProps) {
  if (loading || !stats) {
    return (
      <div className="panel-surface rounded-sm px-4 py-3 text-sm text-steel-500">
        {loading ? 'Loading statistics…' : 'No statistics'}
      </div>
    )
  }

  const bins = [
    {
      key: 'stable',
      label: `Stable < ${stats.stableThreshold}%`,
      pct: stats.stablePct,
      bar: 'bg-signal-green',
    },
    {
      key: 'transition',
      label: `Transition ${stats.stableThreshold}–${stats.transitionThreshold}%`,
      pct: stats.transitionPct,
      bar: 'bg-signal-yellow',
    },
    {
      key: 'alert',
      label: `Alert ≥ ${stats.transitionThreshold}%`,
      pct: stats.alertPct,
      bar: 'bg-signal-red',
    },
  ] as const

  const levelLabel =
    stats.level === 'stable'
      ? 'Stable'
      : stats.level === 'transition'
        ? 'Transition (yellow)'
        : 'Alert (red)'

  const levelColor =
    stats.level === 'stable'
      ? 'text-signal-green'
      : stats.level === 'transition'
        ? 'text-signal-yellow'
        : 'text-signal-red'

  return (
    <div className="panel-surface rounded-sm px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.12em] text-steel-400">
          Statistics
        </h2>
        <p className={`font-mono text-xs ${levelColor}`}>
          Status · {levelLabel}
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
          <div key={b.key} className="flex items-center gap-2 text-xs text-steel-300">
            <span className={`h-2 w-2 shrink-0 rounded-full ${b.bar}`} />
            <span className="text-steel-500">{b.label}</span>
            <span className="ml-auto font-mono text-steel-200">{b.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
