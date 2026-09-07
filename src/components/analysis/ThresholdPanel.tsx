import { useState } from 'react'
import type { ThresholdOverlay } from '../../domain/types'

interface ThresholdPanelProps {
  overlay: ThresholdOverlay | null
  loading?: boolean
}

type View = 'temp' | 'size'

export function ThresholdPanel({ overlay, loading }: ThresholdPanelProps) {
  const [view, setView] = useState<View>('temp')

  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Computing thresholds…
      </div>
    )
  }

  if (!overlay) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Select a frame to view thresholded data
      </div>
    )
  }

  const { width, height, contours, redFraction, blueFraction } = overlay
  const histogram = view === 'temp' ? overlay.imageUrl : overlay.sizeImageUrl
  const hasBoth = Boolean(overlay.imageUrl && overlay.sizeImageUrl)

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-sm bg-steel-950/60">
        {histogram ? (
          /* The measured per-layer distribution, when the build has KIV images. */
          <img
            src={histogram}
            alt={`Layer ${overlay.layer ?? ''} ${view} distribution`}
            className="max-h-48 w-auto object-contain"
            decoding="async"
          />
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full max-h-48 w-full"
            role="img"
            aria-label="Measured melt-pool area against the build's steady-state reference"
          >
            <rect width={width} height={height} fill="#0d1117" />
            <defs>
              <radialGradient id="field" cx="50%" cy="48%" r="50%">
                <stop offset="0%" stopColor="#243040" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#0d1117" stopOpacity="1" />
              </radialGradient>
            </defs>
            <rect width={width} height={height} fill="url(#field)" />

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
                  strokeWidth={1.5}
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

            <line
              x1={40}
              y1={height / 2}
              x2={width - 40}
              y2={height / 2}
              stroke="#4a5d72"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          </svg>
        )}

        {hasBoth && (
          <div className="absolute right-1.5 top-1.5 flex gap-1">
            {(['temp', 'size'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={[
                  'rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors',
                  view === v
                    ? 'border-signal-yellow/50 bg-steel-800 text-steel-100'
                    : 'border-steel-700/50 bg-steel-950/70 text-steel-400 hover:text-steel-200',
                ].join(' ')}
              >
                {v === 'temp' ? 'temp' : 'size'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
        <span
          className="inline-flex items-center gap-1.5 text-steel-300"
          title="How far this layer runs hot, as a fraction of the alert threshold"
        >
          <span className="h-2 w-2 rounded-full bg-signal-red" />
          Hot {(redFraction * 100).toFixed(0)}%
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-steel-300"
          title="How far this layer runs cold, as a fraction of the alert threshold"
        >
          <span className="h-2 w-2 rounded-full bg-signal-blue" />
          Cold {(blueFraction * 100).toFixed(0)}%
        </span>
        {overlay.meanTempC !== undefined && (
          <span className="text-steel-500">
            {overlay.meanTempC.toFixed(0)} °C
            {overlay.tempDriftPct !== undefined &&
              ` (${overlay.tempDriftPct >= 0 ? '+' : ''}${overlay.tempDriftPct.toFixed(1)}%)`}
          </span>
        )}
        {overlay.meanSizeMm2 !== undefined && (
          <span className="text-steel-500">
            {overlay.meanSizeMm2.toFixed(2)} mm²
            {overlay.sizeDriftPct !== undefined &&
              ` (${overlay.sizeDriftPct >= 0 ? '+' : ''}${overlay.sizeDriftPct.toFixed(1)}%)`}
          </span>
        )}
      </div>
    </div>
  )
}
