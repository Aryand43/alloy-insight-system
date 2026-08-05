import type { ThresholdOverlay } from '../../domain/types'

interface ThresholdPanelProps {
  overlay: ThresholdOverlay | null
  loading?: boolean
}

export function ThresholdPanel({ overlay, loading }: ThresholdPanelProps) {
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

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-sm bg-steel-950/60">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full max-h-48 w-full"
          role="img"
          aria-label="Thresholded melt-pool contours"
        >
          <rect width={width} height={height} fill="#0d1117" />
          {/* subtle radial field */}
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
                fill="rgba(214, 69, 69, 0.25)"
                stroke="#d64545"
                strokeWidth={1.5}
                opacity={c.opacity + 0.35}
              />
            ))}

          {/* reference axis */}
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
      </div>
      <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-steel-300">
          <span className="h-2 w-2 rounded-full bg-signal-red" />
          Red {(redFraction * 100).toFixed(0)}%
        </span>
        <span className="inline-flex items-center gap-1.5 text-steel-300">
          <span className="h-2 w-2 rounded-full bg-signal-blue" />
          Blue {(blueFraction * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
