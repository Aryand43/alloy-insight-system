import { useState } from 'react'
import type { AnomalyReport } from '../../domain/types'
import { Button } from '../ui/Button'

const VERDICT = {
  alert: {
    label: 'Anomalies detected',
    ring: 'border-signal-red/50 bg-signal-red/10',
    dot: 'bg-signal-red',
    text: 'text-signal-red-text',
  },
  watch: {
    label: 'Worth a look',
    ring: 'border-signal-yellow/45 bg-signal-yellow/10',
    dot: 'bg-signal-yellow',
    text: 'text-signal-yellow',
  },
  clean: {
    label: 'No anomalies detected',
    ring: 'border-signal-green/40 bg-signal-green/10',
    dot: 'bg-signal-green',
    text: 'text-signal-green',
  },
} as const

interface AnomalyBannerProps {
  report: AnomalyReport | null
  loading?: boolean
  /** Selects the layer an event began at, in whichever mode is open. */
  onGoToLayer: (layer: number) => void
  /** Opens the same layer in the other mode; absent when that is not possible. */
  onInspectLayer?: ((layer: number) => void) | null
  inspectLabel?: string
  busy?: boolean
}

/**
 * The first thing on the page: whether this build is clean, and if not, where
 * it went wrong.
 *
 * Events, not layers — a drift lasting five layers is one excursion, and the
 * onset layer is the actionable number. Each one links straight to that layer,
 * and to the same layer in the other mode where that applies.
 */
export function AnomalyBanner({
  report,
  loading,
  onGoToLayer,
  onInspectLayer,
  inspectLabel = 'Inspect frames',
  busy,
}: AnomalyBannerProps) {
  const [showModel, setShowModel] = useState(false)

  if (loading || !report) {
    return (
      <div className="rounded-sm border border-steel-700/40 bg-steel-900/40 px-3 py-2 text-xs text-steel-400">
        {loading ? 'Scoring layers…' : 'Anomaly detection unavailable for this build.'}
      </div>
    )
  }

  const style = VERDICT[report.verdict]
  const alerts = report.anomalies.filter((a) => a.severity === 'alert').length

  return (
    <div className={`rounded-sm border px-3 py-2.5 ${style.ring}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
          <span className={`font-medium ${style.text}`}>{style.label}</span>
        </span>

        <span className="text-steel-300">
          <span className="font-mono text-steel-100">{report.events.length}</span>{' '}
          {report.events.length === 1 ? 'event' : 'events'} ·{' '}
          <span className="font-mono text-steel-100">{alerts}</span> of{' '}
          <span className="font-mono text-steel-100">{report.layersScored}</span> scored layers
          flagged (<span className="font-mono text-steel-100">{report.flaggedPct}%</span>)
        </span>

        <span
          className="text-steel-400"
          title="Temperature is still climbing to steady state over these layers, so they are excluded from scoring"
        >
          Layers 1–
          <span className="font-mono text-steel-200">{report.transition.endLayer}</span> are the
          ramp-up, not scored
        </span>

        <button
          type="button"
          onClick={() => setShowModel((v) => !v)}
          className="ml-auto text-steel-400 underline decoration-dotted underline-offset-2 hover:text-steel-200"
          aria-expanded={showModel}
        >
          How this is detected
        </button>
      </div>

      {report.events.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-steel-700/30 pt-2">
          {report.events.map((event) => (
            <li
              key={`${event.onsetLayer}-${event.endLayer}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${
                  event.severity === 'alert' ? 'bg-signal-red' : 'bg-signal-yellow'
                }`}
              />
              <span className="text-steel-200">{event.summary}</span>
              <span className="text-steel-400">
                peak at layer <span className="font-mono text-steel-200">{event.peakLayer}</span>
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => onGoToLayer(event.onsetLayer)}
                >
                  Go to layer {event.onsetLayer}
                </Button>
                {onInspectLayer && (
                  <Button
                    variant="secondary"
                    className="text-xs"
                    disabled={busy}
                    onClick={() => onInspectLayer(event.onsetLayer)}
                  >
                    {busy ? 'Opening…' : inspectLabel}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showModel && (
        <div className="mt-2 border-t border-steel-700/30 pt-2 text-xs leading-relaxed text-steel-300">
          <p>
            Each layer past the ramp-up is scored on how far its mean temperature and melt-pool
            size sit from this build&rsquo;s own steady state, plus how abruptly they moved. The
            model was fitted on the coupons ranked best in the quality sheet, and flags a layer
            above a score of{' '}
            <span className="font-mono text-steel-200">{report.model.alertThreshold}</span>.
          </p>
          <p className="mt-1.5 text-steel-400">{report.model.validation}</p>
          <p className="mt-1.5 text-steel-400">
            A low flag rate is not proof of a good part: the 10-pass coupon ranked worst flags only
            ~7%, which overlaps the best-ranked range.
          </p>
        </div>
      )}
    </div>
  )
}
