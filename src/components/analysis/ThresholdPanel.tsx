import { useState, type ReactNode } from 'react'
import type { ThresholdOverlay } from '../../domain/types'

interface ThresholdPanelProps {
  overlay: ThresholdOverlay | null
  loading?: boolean
  error?: string | null
}

type View = 'temp' | 'size'

const VIEW_LABEL: Record<View, string> = {
  temp: 'Temperature',
  size: 'Melt-pool size',
}

function PanelState({ children, error }: { children: ReactNode; error?: boolean }) {
  return (
    <div
      className={[
        'viz-primary flex items-center justify-center px-6 text-center text-sm',
        error ? 'text-signal-red-text' : 'text-steel-400',
      ].join(' ')}
    >
      {children}
    </div>
  )
}

function Drift({ pct }: { pct?: number }) {
  if (pct === undefined) return null
  return (
    <span className="font-mono text-steel-300">
      {' '}({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
    </span>
  )
}

/**
 * Process Insight's right panel. With histogram images it shows the measured
 * distribution for the layer; otherwise it draws an ESTIMATED melt-pool shape —
 * the ellipse area comes from the layer's mean melt-pool area and the
 * elongation is assumed. That is not image segmentation, and the panel says so.
 */
export function ThresholdPanel({ overlay, loading, error }: ThresholdPanelProps) {
  // Open on size: on builds with histogram images the temperature histogram is
  // already in the left panel, so this avoids showing the same image twice.
  const [view, setView] = useState<View>('size')

  if (loading) return <PanelState>Loading layer data…</PanelState>
  if (error) return <PanelState error>{error}</PanelState>
  if (!overlay) return <PanelState>Select a layer to view its deviation.</PanelState>

  const { width, height, contours, redFraction, blueFraction } = overlay
  const hasBoth = Boolean(overlay.imageUrl && overlay.sizeImageUrl)
  const image =
    view === 'size'
      ? (overlay.sizeImageUrl ?? overlay.imageUrl)
      : (overlay.imageUrl ?? overlay.sizeImageUrl)

  return (
    <div className="flex flex-col gap-2">
      <div className="viz-primary relative overflow-hidden rounded-sm bg-steel-950/60">
        {image ? (
          <img
            src={image}
            alt={`Layer ${overlay.layer ?? ''} ${VIEW_LABEL[view].toLowerCase()} histogram`}
            className="absolute inset-0 h-full w-full object-contain"
            decoding="async"
          />
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Estimated melt-pool shape for this layer, against the build median"
          >
            <rect width={width} height={height} fill="#0d1117" />
            <defs>
              <radialGradient id="field" cx="50%" cy="48%" r="50%">
                <stop offset="0%" stopColor="#243040" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#0d1117" stopOpacity="1" />
              </radialGradient>
            </defs>
            <rect width={width} height={height} fill="url(#field)" />

            {/* Dashed, so the reference reads without relying on colour. */}
            {contours
              .filter((c) => c.channel === 'blue')
              .map((c) => (
                <ellipse
                  key={c.id}
                  cx={c.cx}
                  cy={c.cy}
                  rx={c.rx}
                  ry={c.ry}
                  fill="rgba(61, 122, 181, 0.2)"
                  stroke="#3d7ab5"
                  strokeWidth={2}
                  strokeDasharray="7 5"
                  opacity={c.opacity + 0.3}
                />
              ))}
            {contours
              .filter((c) => c.channel === 'red')
              .map((c) => (
                <ellipse
                  key={c.id}
                  cx={c.cx}
                  cy={c.cy}
                  rx={c.rx}
                  ry={c.ry}
                  fill="rgba(214, 69, 69, 0.55)"
                  stroke="#ff5c5c"
                  strokeWidth={2.5}
                  opacity={Math.min(1, c.opacity + 0.5)}
                />
              ))}
          </svg>
        )}

        {hasBoth && (
          <div className="absolute right-2 top-2 flex gap-1">
            {(['temp', 'size'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={[
                  'rounded-sm border px-2 py-0.5 text-xs transition-colors',
                  view === v
                    ? 'border-signal-yellow/50 bg-steel-800 text-steel-100'
                    : 'border-steel-700/50 bg-steel-950/80 text-steel-300 hover:text-steel-100',
                ].join(' ')}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      {image ? (
        <p className="text-xs text-steel-400">
          Measured distribution for this layer (histogram image).
        </p>
      ) : (
        <>
          <p className="text-xs text-steel-400">
            Estimated shape — sized from this layer’s mean melt-pool area;
            elongation assumed. Not image segmentation.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2 border-[#ff5c5c]" />
              This layer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block w-4 border-t-2 border-dashed border-signal-blue"
              />
              Build median
            </span>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
        <span title="How far this layer’s mean temperature sits above the build median, as a share of the alert band">
          ▲ Above median{' '}
          <span className="font-mono text-steel-200">{(redFraction * 100).toFixed(0)}%</span>{' '}
          <span className="text-steel-400">of alert band</span>
        </span>
        <span title="How far this layer’s mean temperature sits below the build median, as a share of the alert band">
          ▼ Below median{' '}
          <span className="font-mono text-steel-200">{(blueFraction * 100).toFixed(0)}%</span>{' '}
          <span className="text-steel-400">of alert band</span>
        </span>
        {overlay.meanTempC !== undefined && (
          <span className="text-steel-400">
            Mean <span className="font-mono text-steel-200">{overlay.meanTempC.toFixed(0)} °C</span>
            <Drift pct={overlay.tempDriftPct} />
          </span>
        )}
        {overlay.meanSizeMm2 !== undefined && (
          <span className="text-steel-400">
            Area <span className="font-mono text-steel-200">{overlay.meanSizeMm2.toFixed(2)} mm²</span>
            <Drift pct={overlay.sizeDriftPct} />
          </span>
        )}
      </div>
    </div>
  )
}
