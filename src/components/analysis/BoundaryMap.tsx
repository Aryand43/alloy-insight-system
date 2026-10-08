import { useMemo, useRef } from 'react'
import type { BoundaryPoint } from '../../domain/types'
import { metricColor, metricGradientCss } from '../../domain/metricColor'
import { rotateHeading, rotateQuarterTurns } from '../../domain/orientation'

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
  /** Quarter turns applied so the direction of travel runs down the screen. */
  quarterTurns?: number
  /** Index into `points` of the probed point, shared across the three maps. */
  selectedIndex?: number | null
  onSelectPoint?: (index: number) => void
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
  quarterTurns = 0,
  selectedIndex = null,
  onSelectPoint,
}: BoundaryMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Rotation is applied to the plotted coordinates, not to the measurements:
  // every value was computed in the camera's frame and is unchanged by it.
  const placed = useMemo(
    () =>
      points.map((p) => {
        const [x, y] = rotateQuarterTurns(p.xMm, p.yMm, quarterTurns)
        return { point: p, x, y }
      }),
    [points, quarterTurns],
  )

  const view = useMemo(() => {
    if (!placed.length) return null
    const xs = placed.map((p) => p.x)
    const ys = placed.map((p) => p.y)
    const pad = 0.35
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const values = placed
      .map((p) => valueOf(p.point, metric))
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)

    // Clip the scale to the 5th-95th percentile so a couple of noisy edge
    // pixels cannot flatten the whole map to one colour.
    const lo = domain?.[0] ?? values[Math.floor(values.length * 0.05)] ?? 0
    const hi = domain?.[1] ?? values[Math.floor(values.length * 0.95)] ?? 1

    return { minX, maxX, minY, maxY, lo, hi }
  }, [placed, metric, domain])

  const heading = rotateHeading(headingDeg, quarterTurns)

  if (!view) {
    return (
      <div className={`${height} flex items-center justify-center px-6 text-center text-sm text-steel-400`}>
        No melt pool detected at this threshold in this frame.
      </div>
    )
  }

  const width = view.maxX - view.minX
  const depth = view.maxY - view.minY
  // Captured as plain numbers: a hoisted function cannot rely on the narrowing
  // that the null check above gives `view`.
  const originX = view.minX
  const originY = view.minY

  /*
   * Clicking picks the nearest boundary point rather than requiring a hit on
   * the drawn dot. The dots are a fraction of a millimetre across in a ~5 mm
   * field, so demanding a direct hit would make probing the contour a test of
   * mouse control; anywhere near the edge is unambiguous about which point was
   * meant.
   */
  function selectNearest(clientX: number, clientY: number): void {
    const svg = svgRef.current
    if (!svg || !onSelectPoint) return
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    // Undo preserveAspectRatio="xMidYMid meet" to get viewBox coordinates.
    const scale = Math.min(rect.width / width, rect.height / depth)
    const drawnX = (rect.width - width * scale) / 2
    const drawnY = (rect.height - depth * scale) / 2
    const x = originX + (clientX - rect.left - drawnX) / scale
    const y = originY + (clientY - rect.top - drawnY) / scale

    let best = -1
    let bestDistance = Infinity
    placed.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = i
      }
    })
    if (best >= 0) onSelectPoint(best)
  }

  /** Steps the probe along the contour, so it is reachable without a mouse. */
  function step(delta: number): void {
    if (!onSelectPoint || !placed.length) return
    const from = selectedIndex ?? 0
    onSelectPoint((from + delta + placed.length) % placed.length)
  }

  const selected = selectedIndex !== null ? placed[selectedIndex] : undefined
  // Arrow sits top-left, in the same mm space as the points.
  const arrowLength = Math.min(width, depth) * 0.22
  const radians = (heading * Math.PI) / 180
  const ax = view.minX + width * 0.14
  const ay = view.minY + depth * 0.14
  const bx = ax + Math.cos(radians) * arrowLength
  // SVG y grows downward, which matches the image rows the points came from.
  const by = ay - Math.sin(radians) * arrowLength

  return (
    <div className="flex flex-col gap-2">
      <div className={`surface-inset ${height} relative overflow-hidden rounded-sm`}>
        <svg
          ref={svgRef}
          viewBox={`${view.minX} ${view.minY} ${width} ${depth}`}
          className={[
            'absolute inset-0 h-full w-full focus-ring',
            onSelectPoint ? 'cursor-crosshair' : '',
          ].join(' ')}
          preserveAspectRatio="xMidYMid meet"
          role={onSelectPoint ? 'application' : 'img'}
          tabIndex={onSelectPoint ? 0 : undefined}
          onClick={(e) => selectNearest(e.clientX, e.clientY)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault()
              step(1)
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault()
              step(-1)
            }
          }}
          aria-label={
            metric === 'none'
              ? 'Melt-pool boundary. Click a point on the contour to measure it.'
              : `Melt-pool boundary coloured by ${metric === 'gradient' ? 'thermal gradient' : 'solidification rate'}. Click a point on the contour to measure it.`
          }
        >
          {placed.map(({ point: p, x, y }, i) => {
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
                cx={x}
                cy={y}
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
          {selected && (
            <g pointerEvents="none">
              {/* Hairlines to the axes, so the probe reads as an instrument
                  cursor rather than another data point. */}
              <line
                x1={view.minX}
                y1={selected.y}
                x2={selected.x}
                y2={selected.y}
                stroke="#f2f5f9"
                strokeWidth={Math.max(width, depth) / 500}
                opacity="0.35"
              />
              <line
                x1={selected.x}
                y1={view.minY}
                x2={selected.x}
                y2={selected.y}
                stroke="#f2f5f9"
                strokeWidth={Math.max(width, depth) / 500}
                opacity="0.35"
              />
              <circle
                cx={selected.x}
                cy={selected.y}
                r={Math.max(width, depth) / 45}
                fill="none"
                stroke="#f2f5f9"
                strokeWidth={Math.max(width, depth) / 300}
              />
            </g>
          )}
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
        <span className="absolute bottom-1.5 right-2 rounded-sm bg-steel-950/80 px-1.5 py-0.5 font-mono text-xs text-steel-400">
          {width.toFixed(1)} × {depth.toFixed(1)} mm
        </span>
      </div>

      {metric !== 'none' && (
        <div className="flex items-center gap-2 text-xs text-steel-400">
          <span className="readout text-steel-200">{Math.round(view.lo)}</span>
          <span
            aria-hidden
            className="h-1.5 flex-1 rounded-sm ring-1 ring-inset ring-[color:var(--border-hairline)]"
            style={{ background: metricGradientCss() }}
          />
          <span className="font-mono text-steel-200">{Math.round(view.hi)}</span>
          <span>{unit}</span>
        </div>
      )}
    </div>
  )
}
