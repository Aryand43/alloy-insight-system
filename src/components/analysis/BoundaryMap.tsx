import { useMemo } from 'react'
import type { BoundaryPoint } from '../../domain/types'
import { metricColor, metricGradientCss } from '../../domain/metricColor'

export type BoundaryMetric = 'none' | 'gradient' | 'solidification'

interface BoundaryMapProps {
  points: BoundaryPoint[]
  metric: BoundaryMetric
  /** Travel direction in the image, degrees, drawn as an arrow. */
  headingDeg: number
  /** Colour-scale bounds; computed from the points when omitted. */
  domain?: [number, number]
  unit: string
  /** Dims the leading edge, where solidification rate has no meaning. */
  trailingOnly?: boolean
  height?: string
}

function valueOf(point: BoundaryPoint, metric: BoundaryMetric): number | null {
  if (metric === 'gradient') return point.gradientCPerMm
  if (metric === 'solidification') return point.solidificationMmPerS
  return null
}

/**
 * The melt-pool boundary, drawn in millimetres around the pool centroid, with
 * each point coloured by what was measured there.
 *
 * Points rather than a stroked contour: the boundary comes back as a set of
 * pixels, and ordering them into a single closed path would be a guess
 * wherever the edge is ragged or the pool splits. Drawn at the real aspect
 * ratio, several hundred points read as a continuous outline anyway, and each
 * one keeps its own measured value.
 */
export function BoundaryMap({
  points,
  metric,
  headingDeg,
  domain,
  unit,
  trailingOnly,
  height = 'viz-secondary',
}: BoundaryMapProps) {
  const view = useMemo(() => {
    if (!points.length) return null
    const xs = points.map((p) => p.xMm)
    const ys = points.map((p) => p.yMm)
    const pad = 0.35
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const values = points
      .map((p) => valueOf(p, metric))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)

    // Clip the scale to the 5th-95th percentile so a couple of noisy edge
    // pixels cannot flatten the whole map to one colour.
    const lo = domain?.[0] ?? values[Math.floor(values.length * 0.05)] ?? 0
    const hi = domain?.[1] ?? values[Math.floor(values.length * 0.95)] ?? 1

    return { minX, maxX, minY, maxY, lo, hi }
  }, [points, metric, domain])

  if (!view) {
    return (
      <div className={`${height} flex items-center justify-center px-6 text-center text-sm text-steel-400`}>
        No melt pool detected at this threshold in this frame.
      </div>
    )
  }

  const width = view.maxX - view.minX
  const depth = view.maxY - view.minY
  // Arrow sits top-left, in the same mm space as the points.
  const arrowLength = Math.min(width, depth) * 0.22
  const radians = (headingDeg * Math.PI) / 180
  const ax = view.minX + width * 0.14
  const ay = view.minY + depth * 0.14
  const bx = ax + Math.cos(radians) * arrowLength
  // SVG y grows downward, which matches the image rows the points came from.
  const by = ay - Math.sin(radians) * arrowLength

  return (
    <div className="flex flex-col gap-2">
      <div className={`${height} relative overflow-hidden rounded-sm bg-steel-950/60`}>
        <svg
          viewBox={`${view.minX} ${view.minY} ${width} ${depth}`}
          className="absolute inset-0 h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={
            metric === 'none'
              ? 'Melt-pool boundary'
              : `Melt-pool boundary coloured by ${metric === 'gradient' ? 'thermal gradient' : 'solidification rate'}`
          }
        >
          {points.map((p, i) => {
            const value = valueOf(p, metric)
            const dimmed = trailingOnly && !p.trailing
            const fill =
              metric === 'none'
                ? p.trailing
                  ? '#22e7ee'
                  : '#3d7ab5'
                : value === null
                  ? '#2b3a52'
                  : metricColor(value, view.lo, view.hi)
            return (
              <circle
                key={`${p.xMm}:${p.yMm}:${i}`}
                cx={p.xMm}
                cy={p.yMm}
                r={Math.max(width, depth) / 110}
                fill={fill}
                opacity={dimmed ? 0.18 : 0.95}
              />
            )
          })}
          <g stroke="#8a9aab" strokeWidth={Math.max(width, depth) / 220} fill="none">
            <line x1={ax} y1={ay} x2={bx} y2={by} />
            <path
              d={`M${bx} ${by} L${bx - Math.cos(radians - 0.4) * arrowLength * 0.3} ${
                by + Math.sin(radians - 0.4) * arrowLength * 0.3
              } M${bx} ${by} L${bx - Math.cos(radians + 0.4) * arrowLength * 0.3} ${
                by + Math.sin(radians + 0.4) * arrowLength * 0.3
              }`}
            />
          </g>
          <text
            x={ax}
            y={ay - depth * 0.05}
            fill="#8a9aab"
            fontSize={Math.max(width, depth) / 28}
            textAnchor="middle"
          >
            travel
          </text>
        </svg>
        <span className="absolute bottom-1.5 right-2 rounded-sm bg-steel-950/80 px-1.5 py-0.5 text-xs text-steel-400">
          {width.toFixed(1)} × {depth.toFixed(1)} mm
        </span>
      </div>

      {metric !== 'none' && (
        <div className="flex items-center gap-2 text-xs text-steel-400">
          <span className="font-mono text-steel-200">{Math.round(view.lo)}</span>
          <span
            aria-hidden
            className="h-2 flex-1 rounded-sm"
            style={{ background: metricGradientCss() }}
          />
          <span className="font-mono text-steel-200">{Math.round(view.hi)}</span>
          <span>{unit}</span>
        </div>
      )}
    </div>
  )
}
