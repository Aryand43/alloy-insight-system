import type { MeltPoolPhysics } from '../../domain/types'
import { BoundaryMap } from './BoundaryMap'

interface PhysicsPanelProps {
  physics: MeltPoolPhysics | null
  loading?: boolean
  error?: string | null
}

function Shell({
  physics,
  loading,
  error,
  children,
}: PhysicsPanelProps & { children: (p: MeltPoolPhysics) => React.ReactNode }) {
  if (error) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-signal-red-text">
        {error}
      </div>
    )
  }
  if (loading || !physics) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Measuring the boundary…' : 'No boundary measurements for this frame.'}
      </div>
    )
  }
  return <>{children(physics)}</>
}

/**
 * The melt-pool boundary on its own, at the threshold in force.
 *
 * This is the outline both other panels measure on, so it is worth seeing
 * plainly: the trailing half — the freezing front — is marked, because
 * solidification rate is only defined there.
 */
export function MeltPoolBoundaryPanel(props: PhysicsPanelProps) {
  return (
    <Shell {...props}>
      {(p) => (
        <div className="flex flex-col gap-2">
          <BoundaryMap points={p.points} metric="none" headingDeg={p.travel.headingDeg} unit="" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-melt-boundary" /> Trailing edge
              (freezing)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="h-2 w-2 rounded-full bg-signal-blue" /> Leading edge
              (melting)
            </span>
            <span className="text-steel-400">
              <span className="font-mono text-steel-200">{p.summary.boundaryPoints}</span> boundary
              points ·{' '}
              <span className="font-mono text-steel-200">{p.summary.trailingPoints}</span> trailing
            </span>
          </div>
          <p className="text-xs text-steel-400">
            Boundary at{' '}
            <span className="font-mono text-steel-200">{p.thresholdC.toFixed(0)} °C</span>{' '}
            {p.thresholdSource === 'user' ? '(set in setup)' : '(machine log)'} · travel{' '}
            <span className="font-mono text-steel-200">{p.travel.speedMmPerS.toFixed(1)} mm/s</span>{' '}
            {p.travel.speedSource === 'measured' ? 'from the machine log' : '(nominal — no log)'}
          </p>
        </div>
      )}
    </Shell>
  )
}

/**
 * Thermal gradient G around the boundary.
 *
 * One pixel outward along the normal, temperature difference over the pixel
 * pitch. A small share of points come back negative — the edge is noisy at
 * this scale — and that share is reported rather than clipped away.
 */
export function ThermalGradientPanel(props: PhysicsPanelProps) {
  return (
    <Shell {...props}>
      {(p) => (
        <div className="flex flex-col gap-2">
          <BoundaryMap
            points={p.points}
            metric="gradient"
            headingDeg={p.travel.headingDeg}
            unit="°C/mm"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
            <span title="Median across all boundary points">
              G median{' '}
              <span className="font-mono text-steel-200">
                {p.summary.gradientMedianCPerMm.toLocaleString('en-US')} °C/mm
              </span>
            </span>
            <span title="10th to 90th percentile across the boundary">
              range{' '}
              <span className="font-mono text-steel-200">
                {p.summary.gradientP10CPerMm.toLocaleString('en-US')}–
                {p.summary.gradientP90CPerMm.toLocaleString('en-US')}
              </span>
            </span>
            <span title="Boundary points whose temperature rises outward — sensor noise at the pool edge, reported rather than hidden">
              rising outward{' '}
              <span className="font-mono text-steel-200">{p.summary.gradientNegativePct}%</span>
            </span>
          </div>
          <p className="text-xs text-steel-400">
            Temperature drop from each boundary pixel to one pixel outward along the normal, over
            the <span className="font-mono text-steel-200">30 µm</span> pixel pitch.
          </p>
        </div>
      )}
    </Shell>
  )
}

/**
 * Solidification rate R = V·|cos θ| on the trailing edge.
 *
 * The leading edge is drawn faint: it is melting, not freezing, so R is not
 * defined there. V comes from the machine's own x/y/t at this frame.
 */
export function SolidificationRatePanel(props: PhysicsPanelProps) {
  return (
    <Shell {...props}>
      {(p) => (
        <div className="flex flex-col gap-2">
          <BoundaryMap
            points={p.points}
            metric="solidification"
            headingDeg={p.travel.headingDeg}
            unit="mm/s"
            trailingOnly
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
            <span title="Median across the trailing edge">
              R median{' '}
              <span className="font-mono text-steel-200">
                {p.summary.solidificationMedianMmPerS.toFixed(1)} mm/s
              </span>
            </span>
            <span title="Reached at the rear of the pool, where the boundary normal is antiparallel to travel and |cos θ| = 1">
              max{' '}
              <span className="font-mono text-steel-200">
                {p.summary.solidificationMaxMmPerS.toFixed(1)} mm/s
              </span>
            </span>
            <span title="G/R governs solidification morphology; G·R is the cooling rate">
              G/R{' '}
              <span className="font-mono text-steel-200">
                {p.summary.gOverR.toLocaleString('en-US')}
              </span>{' '}
              °C·s/mm² · cooling{' '}
              <span className="font-mono text-steel-200">
                {p.summary.coolingRateCPerS.toLocaleString('en-US')}
              </span>{' '}
              °C/s
            </span>
          </div>
          <p className="text-xs text-steel-400">
            R = V·|cos θ| on the trailing edge, with V ={' '}
            <span className="font-mono text-steel-200">{p.travel.speedMmPerS.toFixed(1)} mm/s</span>{' '}
            measured from the machine log at this frame
            {p.travel.speedSource === 'measured' && ' (logged runs hold ~1,000 mm/min)'}.
          </p>
        </div>
      )}
    </Shell>
  )
}
