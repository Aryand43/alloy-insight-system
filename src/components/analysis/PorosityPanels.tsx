import type { PorosityReport } from '../../domain/types'

/**
 * Porosity Insight.
 *
 * Industry named porosity as the costly defect: a wall that comes out short
 * is absorbed by overbuild and machining, while a pore in the first layer is
 * invisible until the part fails. So these panels measure the melt-pool
 * conditions under which pores are known to form.
 *
 * They do not predict pores, and the UI says so rather than burying it: this
 * corpus has no measured porosity yet. The honest offer is a set of candidate
 * indicators, each with its mechanism, ready to be correlated against the
 * X-ray results when they land.
 */

interface PorosityProps {
  report: PorosityReport | null
  loading?: boolean
  error?: string | null
}

function Shell({
  report,
  loading,
  error,
  children,
}: PorosityProps & { children: (r: PorosityReport) => React.ReactNode }) {
  if (error) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-signal-red-text">
        {error}
      </div>
    )
  }
  if (loading || !report) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Measuring melt-pool conditions…' : 'No porosity indicators for this build.'}
      </div>
    )
  }
  return <>{children(report)}</>
}

/** Per-layer conditions, so a risk can be traced to a height. */
export function PorosityRiskPanel({
  onSelectLayer,
  activeLayer,
  ...props
}: PorosityProps & { onSelectLayer?: (layer: number) => void; activeLayer?: number | null }) {
  return (
    <Shell {...props}>
      {(r) => {
        if (!r.layers.length) {
          return (
            <div className="viz-primary flex items-center justify-center px-6 text-center text-sm text-steel-400">
              This build has no thermal frames, so per-layer melt-pool conditions cannot be
              measured. The indicators below use what the spreadsheets hold.
            </div>
          )
        }
        const worst = Math.max(...r.layers.map((l) => Math.max(l.undersizedPct, l.coldPct)), 1)
        return (
          <div className="flex flex-col gap-3">
            <div className="surface-inset viz-primary relative overflow-hidden rounded-sm p-2">
              <div className="flex h-full items-end gap-[2px]">
                {r.layers.map((l) => {
                  const active = l.layer === activeLayer
                  return (
                    <button
                      key={l.layer}
                      type="button"
                      onClick={() => onSelectLayer?.(l.layer)}
                      aria-pressed={active}
                      title={[
                        `Layer ${l.layer}`,
                        `z ${l.zMm.toFixed(2)} mm`,
                        `undersized ${l.undersizedPct}% of frames`,
                        `cold ${l.coldPct}%`,
                        `deviating ${l.deviatingPct}%`,
                        l.worst
                          ? `smallest pool ${l.worst.sizePx.toLocaleString('en-US')} px at x ${l.worst.xMm}, y ${l.worst.yMm}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      /* h-full matters: the bars are sized as a percentage,
                         which needs a resolved height on their parent. */
                      className={[
                        'focus-ring flex h-full min-w-[3px] flex-1 flex-col justify-end gap-[1px]',
                        active ? 'opacity-100 ring-1 ring-accent-300' : 'opacity-80 hover:opacity-100',
                      ].join(' ')}
                    >
                      <span
                        className="block w-full bg-signal-blue"
                        style={{
                          height: l.coldPct ? `${Math.max((l.coldPct / worst) * 45, 1.5)}%` : 0,
                        }}
                      />
                      <span
                        className="block w-full bg-signal-red"
                        style={{
                          height: l.undersizedPct
                            ? `${Math.max((l.undersizedPct / worst) * 45, 1.5)}%`
                            : 0,
                        }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-signal-red" /> Undersized pool
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-full bg-signal-blue" /> Cold pool
              </span>
              <span className="text-steel-400">
                <span className="readout text-steel-200">{r.layers.length}</span> layers, each bar
                one layer
              </span>
            </div>
            <p className="text-xs leading-relaxed text-steel-400">
              Share of each layer&rsquo;s frames whose melt pool ran smaller or cooler than this
              build&rsquo;s own steady state. Both are conditions associated with pore formation,
              not pores.
            </p>
          </div>
        )
      }}
    </Shell>
  )
}

/** Whether neighbouring passes actually remelted each other. */
export function TrackOverlapPanel(props: PorosityProps) {
  return (
    <Shell {...props}>
      {(r) => {
        if (r.overlapRatio === null || r.trackSpacingMm === null || !r.poolWidthMm) {
          return (
            <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
              Track overlap needs both a machine log and thermal frames. This build has neither.
            </div>
          )
        }
        const spacing = r.trackSpacingMm
        const width = r.poolWidthMm
        // Two neighbouring tracks drawn to scale, so the overlap is visible.
        const span = width + spacing
        const pct = (v: number) => `${(v / span) * 100}%`
        return (
          <div className="flex flex-col gap-3">
            <div className="surface-inset viz-secondary relative overflow-hidden rounded-sm">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
                <div className="relative h-16 w-full max-w-md">
                  <span
                    className="absolute top-0 h-7 rounded-full bg-signal-red/45 ring-1 ring-signal-red/70"
                    style={{ left: 0, width: pct(width) }}
                  />
                  <span
                    className="absolute top-5 h-7 rounded-full bg-accent-500/40 ring-1 ring-accent-400/70"
                    style={{ left: pct(spacing), width: pct(width) }}
                  />
                </div>
                <p className="text-center text-xs text-steel-300">
                  Two neighbouring passes, to scale. Spacing{' '}
                  <span className="readout text-steel-100">{spacing.toFixed(2)} mm</span> into a
                  pool <span className="readout text-steel-100">{width.toFixed(2)} mm</span> wide.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
              <span>
                Overlap{' '}
                <span className="readout text-steel-100">
                  {(r.overlapRatio * 100).toFixed(1)}%
                </span>
              </span>
              <span className="text-steel-500">
                {r.overlapRatio > 0.3
                  ? 'Comfortable: neighbouring tracks remelt each other well'
                  : r.overlapRatio > 0
                    ? 'Thin: tracks only just meet'
                    : 'Tracks never met, which is the lack-of-fusion condition'}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-steel-400">
              Spacing is measured from the machine&rsquo;s own Y positions and the width from the
              segmented frames, so both are measured rather than assumed.
            </p>
          </div>
        )
      }}
    </Shell>
  )
}

/** The candidate indicators, each with its mechanism and validation status. */
export function PorosityIndicatorsPanel(props: PorosityProps) {
  return (
    <Shell {...props}>
      {(r) => (
        <div className="flex flex-col gap-2.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {r.indicators.map((indicator) => (
              <div
                key={indicator.id}
                className={[
                  'surface-sunken flex flex-col gap-1.5 rounded-sm px-3 py-2.5',
                  indicator.available ? '' : 'opacity-60',
                ].join(' ')}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="eyebrow text-steel-300">{indicator.label}</span>
                  <span className="readout text-sm text-steel-50">
                    {indicator.available ? `${indicator.value} ${indicator.unit}` : 'no data'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-steel-400">{indicator.mechanism}</p>
                <p className="text-xs leading-relaxed text-steel-500">{indicator.validation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  )
}

/** The status of the whole mode, stated once and up front. */
export function PorosityValidationBanner({ report }: { report: PorosityReport | null }) {
  if (!report) return null
  return (
    <div className="status-rule rounded-sm border border-[color:var(--border-hairline)] border-l-signal-yellow bg-signal-yellow/8 px-3 py-2.5">
      <p className="text-xs font-semibold tracking-tight text-signal-yellow">
        Measured conditions, not predicted pores
      </p>
      <p className="mt-1 text-xs leading-relaxed text-steel-300">{report.validationNote}</p>
    </div>
  )
}
