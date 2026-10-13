import { useMemo, useRef } from 'react'
import type { MeltPoolPhysics } from '../../domain/types'
import { metricColor, metricGradientCss } from '../../domain/metricColor'

/**
 * The G against R plot, one point per place on the solidification front.
 *
 * Thermal gradient on the vertical axis, growth rate on the horizontal, both
 * logarithmic: these span decades around a melt pool, and the quantities that
 * matter are ratios. Two families of straight lines fall out of that choice,
 * and they are the reason the plot is read this way:
 *
 *   G/R constant  runs at 45 degrees  and sets the solidification morphology
 *   G*R constant  runs at -45 degrees and is the cooling rate
 *
 * Every frame puts a cluster on this plot, so scrubbing shows the front moving
 * through morphology space as the pool changes shape.
 *
 * What is deliberately NOT drawn is the columnar-to-equiaxed boundary itself.
 * That curve is material-specific, and inventing one would turn a measurement
 * into a claim about this alloy's microstructure that nothing here supports.
 * It is a single overlay to add once the criterion for 316L is supplied.
 */

/** Plot box in viewBox units, with room for axis labels. */
const W = 100
const H = 76
const L = 13
const R = 4
const T = 5
const B = 13

interface SolidificationMapProps {
  physics: MeltPoolPhysics | null
  loading?: boolean
  error?: string | null
  selectedIndex?: number | null
  onSelectPoint?: (index: number) => void
}

interface Plotted {
  index: number
  /** log10 of growth rate and gradient. */
  lx: number
  ly: number
  ratio: number
}

function decadesAround(lo: number, hi: number): [number, number] {
  const min = Math.floor(lo)
  const max = Math.ceil(hi)
  // Always show at least one decade, or a single point has nothing to sit in.
  return max - min < 1 ? [min, min + 1] : [min, max]
}

export function SolidificationMap({
  physics,
  loading,
  error,
  selectedIndex = null,
  onSelectPoint,
}: SolidificationMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  const view = useMemo(() => {
    if (!physics) return null

    /*
     * Only the trailing edge appears. R is the rate the front advances, and
     * the leading edge is melting rather than freezing, so it has no growth
     * rate to plot. Points whose fitted gradient came back negative are edge
     * noise and have no logarithm, so they are counted and left out.
     */
    const plotted: Plotted[] = []
    let excluded = 0
    physics.points.forEach((p, index) => {
      const r = p.solidificationMmPerS
      // Points whose temperature rose outward are edge noise; the magnitude
      // is positive now, so they are identified by the flag rather than sign.
      if (r === null || r <= 0 || p.risesOutward || p.gradientCPerMm <= 0) {
        if (p.trailing) excluded += 1
        return
      }
      plotted.push({
        index,
        lx: Math.log10(r),
        ly: Math.log10(p.gradientCPerMm),
        ratio: Math.log10(p.gradientCPerMm / r),
      })
    })
    if (!plotted.length) return null

    const [x0, x1] = decadesAround(
      Math.min(...plotted.map((p) => p.lx)),
      Math.max(...plotted.map((p) => p.lx)),
    )
    const [y0, y1] = decadesAround(
      Math.min(...plotted.map((p) => p.ly)),
      Math.max(...plotted.map((p) => p.ly)),
    )
    const ratios = plotted.map((p) => p.ratio).sort((a, b) => a - b)

    return {
      plotted,
      excluded,
      x0,
      x1,
      y0,
      y1,
      ratioLo: ratios[Math.floor(ratios.length * 0.05)],
      ratioHi: ratios[Math.floor(ratios.length * 0.95)],
    }
  }, [physics])

  if (error) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-signal-red-text">
        {error}
      </div>
    )
  }
  if (loading || !physics || !view) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading
          ? 'Measuring the boundary…'
          : 'No freezing front to plot in this frame.'}
      </div>
    )
  }

  const px = (lx: number) => L + ((lx - view.x0) / (view.x1 - view.x0)) * (W - L - R)
  const py = (ly: number) => H - B - ((ly - view.y0) / (view.y1 - view.y0)) * (H - T - B)

  function selectNearest(clientX: number, clientY: number): void {
    const svg = svgRef.current
    if (!svg || !onSelectPoint || !view) return
    const rect = svg.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const scale = Math.min(rect.width / W, rect.height / H)
    const x = (clientX - rect.left - (rect.width - W * scale) / 2) / scale
    const y = (clientY - rect.top - (rect.height - H * scale) / 2) / scale

    let best = -1
    let bestDistance = Infinity
    for (const p of view.plotted) {
      const d = (px(p.lx) - x) ** 2 + (py(p.ly) - y) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = p.index
      }
    }
    if (best >= 0) onSelectPoint(best)
  }

  const ticks = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)

  const label = (power: number) =>
    power >= 0 && power <= 4
      ? String(10 ** power)
      : power < 0 && power >= -2
        ? (10 ** power).toFixed(-power)
        : `1e${power}`

  const selected = view.plotted.find((p) => p.index === selectedIndex)

  return (
    <div className="flex flex-col gap-2">
      <div className="surface-inset viz-secondary relative overflow-hidden rounded-sm">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className={[
            'absolute inset-0 h-full w-full focus-ring',
            onSelectPoint ? 'cursor-crosshair' : '',
          ].join(' ')}
          role={onSelectPoint ? 'application' : 'img'}
          tabIndex={onSelectPoint ? 0 : undefined}
          onClick={(e) => selectNearest(e.clientX, e.clientY)}
          aria-label="Thermal gradient against growth rate for each point on the freezing front"
        >
          {/* Constant G/R: morphology. Constant G*R: cooling rate. */}
          {ticks(Math.floor(view.y0 - view.x1), Math.ceil(view.y1 - view.x0)).map((k) => (
            <line
              key={`gr${k}`}
              x1={px(view.x0)}
              y1={py(Math.min(Math.max(view.x0 + k, view.y0), view.y1))}
              x2={px(view.x1)}
              y2={py(Math.min(Math.max(view.x1 + k, view.y0), view.y1))}
              stroke="#2d3d4e"
              strokeWidth="0.25"
              strokeDasharray="1.5 1.5"
            />
          ))}
          {ticks(Math.floor(view.y0 + view.x0), Math.ceil(view.y1 + view.x1)).map((k) => (
            <line
              key={`cool${k}`}
              x1={px(view.x0)}
              y1={py(Math.min(Math.max(k - view.x0, view.y0), view.y1))}
              x2={px(view.x1)}
              y2={py(Math.min(Math.max(k - view.x1, view.y0), view.y1))}
              stroke="#1f2b38"
              strokeWidth="0.25"
            />
          ))}

          {/* Axes */}
          <line x1={L} y1={T} x2={L} y2={H - B} stroke="#425568" strokeWidth="0.3" />
          <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#425568" strokeWidth="0.3" />
          {ticks(view.x0, view.x1).map((t) => (
            <g key={`x${t}`}>
              <line x1={px(t)} y1={H - B} x2={px(t)} y2={H - B + 1.2} stroke="#425568" strokeWidth="0.3" />
              <text x={px(t)} y={H - B + 4.6} fill="#8a9aab" fontSize="3" textAnchor="middle">
                {label(t)}
              </text>
            </g>
          ))}
          {ticks(view.y0, view.y1).map((t) => (
            <g key={`y${t}`}>
              <line x1={L - 1.2} y1={py(t)} x2={L} y2={py(t)} stroke="#425568" strokeWidth="0.3" />
              <text x={L - 2} y={py(t) + 1} fill="#8a9aab" fontSize="3" textAnchor="end">
                {label(t)}
              </text>
            </g>
          ))}
          <text x={(L + W - R) / 2} y={H - 2} fill="#8a9aab" fontSize="3.2" textAnchor="middle">
            Growth rate R (mm/s)
          </text>
          <text
            x={3.2}
            y={(T + H - B) / 2}
            fill="#8a9aab"
            fontSize="3.2"
            textAnchor="middle"
            transform={`rotate(-90 3.2 ${(T + H - B) / 2})`}
          >
            Thermal gradient G (°C/mm)
          </text>

          {/* The frame's cluster. */}
          {view.plotted.map((p) => (
            <circle
              key={p.index}
              cx={px(p.lx)}
              cy={py(p.ly)}
              r="0.7"
              fill={metricColor(p.ratio, view.ratioLo, view.ratioHi)}
              opacity="0.9"
            />
          ))}
          {selected && (
            <circle
              cx={px(selected.lx)}
              cy={py(selected.ly)}
              r="1.8"
              fill="none"
              stroke="#f2f5f9"
              strokeWidth="0.4"
            />
          )}

          <text x={W - R} y={T + 3} fill="#64788d" fontSize="2.8" textAnchor="end">
            higher G/R upper left
          </text>
        </svg>
      </div>

      <div className="flex items-center gap-2 text-xs text-steel-400">
        <span className="readout text-steel-200">{Math.round(10 ** view.ratioLo)}</span>
        <span
          aria-hidden
          className="h-1.5 flex-1 rounded-sm ring-1 ring-inset ring-[color:var(--border-hairline)]"
          style={{ background: metricGradientCss() }}
        />
        <span className="readout text-steel-200">{Math.round(10 ** view.ratioHi)}</span>
        <span>G/R °C·s/mm²</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
        <span>
          <span className="readout text-steel-200">{view.plotted.length}</span> points on the
          freezing front
        </span>
        {view.excluded > 0 && (
          <span title="Trailing points whose fitted gradient came back negative, which is edge noise and has no place on a log axis">
            <span className="readout text-steel-200">{view.excluded}</span> excluded as edge noise
          </span>
        )}
        <span title="Median across the front">
          median G/R{' '}
          <span className="readout text-steel-200">
            {physics.summary.gOverR.toLocaleString('en-US')}
          </span>{' '}
          · cooling{' '}
          <span className="readout text-steel-200">
            {physics.summary.coolingRateCPerS.toLocaleString('en-US')}
          </span>{' '}
          °C/s
        </span>
      </div>

      <p className="text-xs leading-relaxed text-steel-400">
        Each point is one place on the freezing front. G/R sets how the grains grow and G·R is the
        cooling rate. The columnar-to-equiaxed boundary is specific to the alloy and is not drawn
        here; it goes on as one curve once the criterion for 316L is supplied.
      </p>
    </div>
  )
}
