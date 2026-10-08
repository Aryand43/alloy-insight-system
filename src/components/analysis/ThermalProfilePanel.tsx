import type { AlertLevel, AnomalySeverity, ThermalLayerSummary } from '../../domain/types'
import { ProfileChart } from './ProfileChart'

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
  /** Layers in the build, which is what the chart's x axis spans. */
  buildLayerCount: number
  /** Flagged layers, for the rail and the chart's click targets. */
  flagged?: Map<number, AnomalySeverity>
  /** Layers up to here are the ramp-up, so they are shown but never flagged. */
  transitionEndLayer?: number
}

/**
 * Left panel in Alloy Insight. Stays pinned on the selected layer while the
 * melt-pool panel scrubs the frames captured within it.
 *
 * Both the chart and the rail below it select a layer: the chart is the
 * natural target when reading the trend, the rail when stepping layer by
 * layer. Layers with no captured frames are absent from the rail, and the page
 * snaps a chart click to the nearest layer that has them.
 */
export function ThermalProfilePanel({
  layers,
  activeLayer,
  onSelectLayer,
  loading,
  buildLayerCount,
  flagged,
  transitionEndLayer = 0,
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
      <ProfileChart
        src={current.profileUrl}
        alt={`Mean temperature by layer, with layer ${current.layer} marked`}
        layerCount={Math.max(buildLayerCount, ...layers.map((l) => l.layer))}
        activeLayer={current.layer}
        onSelectLayer={onSelectLayer}
        flagged={flagged}
        describeLayer={(layer) => {
          const match = layers.find((l) => l.layer === layer)
          const severity = flagged?.get(layer)
          return [
            `Layer ${layer}`,
            match ? `z ${match.zMm.toFixed(2)} mm` : null,
            match ? `${match.meanTempC.toFixed(0)} °C` : 'no frames captured',
            layer <= transitionEndLayer ? 'ramp-up, not scored' : null,
            severity ? `flagged (${severity})` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        }}
      />

      <div className="flex flex-col gap-1.5">
        <div
          className="flex min-w-0 items-end gap-1 overflow-x-auto pb-1"
          role="group"
          aria-label="Layers"
        >
          {layers.map((l, i) => {
            const active = l.layer === current.layer
            const numbered = active || i % labelEvery === 0
            const severity = flagged?.get(l.layer)
            const rampUp = l.layer <= transitionEndLayer
            return (
              <button
                key={l.layer}
                type="button"
                onClick={() => onSelectLayer(l.layer)}
                aria-pressed={active}
                aria-label={`Layer ${l.layer}: ${LEVEL_LABEL[l.level]}, mean ${l.meanTempC.toFixed(0)} °C, ${l.frameCount} frames${severity ? `, flagged (${severity})` : ''}`}
                title={[
                  `Layer ${l.layer}`,
                  `z ${l.zMm.toFixed(2)} mm`,
                  `${l.frameCount} frames`,
                  `${l.meanTempC.toFixed(0)} °C`,
                  rampUp ? 'ramp-up, not scored' : null,
                  severity ? `flagged (${severity})` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                className="focus-ring flex min-w-3 shrink-0 flex-col items-center gap-1"
              >
                <span
                  className={[
                    'block w-2.5 rounded-[1px] transition-all',
                    severity === 'alert'
                      ? 'bg-signal-red'
                      : severity === 'watch'
                        ? 'bg-signal-yellow'
                        : LEVEL_BAR[l.level],
                    active
                      ? 'h-10 opacity-100 ring-2 ring-accent-300'
                      : severity
                        ? 'h-9 opacity-95 hover:opacity-100'
                        : rampUp
                          ? 'h-5 opacity-30 hover:opacity-70'
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
          {flagged && flagged.size > 0 && (
            <span className="text-steel-300">· taller bars are layers the model flagged</span>
          )}
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
