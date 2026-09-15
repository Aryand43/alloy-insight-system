import type { AlertLevel, ThermalLayerSummary } from '../../domain/types'

const LEVEL_BAR: Record<AlertLevel, string> = {
  stable: 'bg-signal-green',
  transition: 'bg-signal-yellow',
  alert: 'bg-signal-red',
}

const LEVEL_LABEL: Record<AlertLevel, string> = {
  stable: 'Stable',
  transition: 'Transition',
  alert: 'Alert',
}

const LEVELS: AlertLevel[] = ['stable', 'transition', 'alert']

interface ThermalProfilePanelProps {
  layers: ThermalLayerSummary[]
  activeLayer: number | null
  onSelectLayer: (layer: number) => void
  loading?: boolean
}

/**
 * Left panel in Alloy Insight. Stays pinned on the selected layer while the
 * melt-pool panel scrubs the frames captured within it.
 */
export function ThermalProfilePanel({
  layers,
  activeLayer,
  onSelectLayer,
  loading,
}: ThermalProfilePanelProps) {
  if (loading || !layers.length) {
    return (
      <div className="viz-primary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Preparing thermal frames…' : 'No thermal frames available for this build.'}
      </div>
    )
  }

  const current = layers.find((l) => l.layer === activeLayer) ?? layers[0]
  // Number every bar when there are few layers; otherwise about eight labels.
  const labelEvery = layers.length <= 12 ? 1 : Math.ceil(layers.length / 8)

  return (
    <div className="flex flex-col gap-3">
      <div className="viz-primary relative overflow-hidden rounded-sm bg-steel-950/50">
        <img
          src={current.profileUrl}
          alt={`Mean temperature by layer, with layer ${current.layer} marked`}
          className="absolute inset-0 h-full w-full object-contain"
          decoding="async"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          className="flex items-end gap-1 overflow-x-auto pb-0.5"
          role="group"
          aria-label="Layers"
        >
          {layers.map((l, i) => {
            const active = l.layer === current.layer
            const numbered = active || i % labelEvery === 0
            return (
              <button
                key={l.layer}
                type="button"
                onClick={() => onSelectLayer(l.layer)}
                aria-pressed={active}
                aria-label={`Layer ${l.layer}: ${LEVEL_LABEL[l.level]}, mean ${l.meanTempC.toFixed(0)} °C, ${l.frameCount} frames`}
                title={`Layer ${l.layer} · z ${l.zMm.toFixed(2)} mm · ${l.frameCount} frames · ${l.meanTempC.toFixed(0)} °C`}
                className="flex min-w-3 shrink-0 flex-col items-center gap-1"
              >
                <span
                  className={[
                    'block w-2.5 rounded-[1px] transition-all',
                    LEVEL_BAR[l.level],
                    active
                      ? 'h-10 opacity-100 ring-2 ring-steel-50'
                      : 'h-7 opacity-50 hover:opacity-90',
                  ].join(' ')}
                />
                <span
                  className={[
                    'font-mono text-xs leading-none',
                    active ? 'text-steel-50' : 'text-steel-400',
                    numbered ? '' : 'invisible',
                  ].join(' ')}
                >
                  {l.layer}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-steel-400">
          <span>Layer mean vs build median:</span>
          {LEVELS.map((level) => (
            <span key={level} className="inline-flex items-center gap-1.5 text-steel-300">
              <span aria-hidden className={`h-2 w-2 rounded-full ${LEVEL_BAR[level]}`} />
              {LEVEL_LABEL[level]}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-steel-400">
        Layer <span className="font-mono text-steel-200">{current.layer}</span> · z{' '}
        <span className="font-mono text-steel-200">{current.zMm.toFixed(2)} mm</span> · mean{' '}
        <span className="font-mono text-steel-200">{current.meanTempC.toFixed(0)} °C</span> ·{' '}
        <span className="font-mono text-steel-200">{current.frameCount}</span> frames · from layer
        means
      </p>
    </div>
  )
}
