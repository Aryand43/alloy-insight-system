import type { BoundaryPoint, MeltPoolPhysics } from '../../domain/types'
import { BoundaryMap } from './BoundaryMap'
import { rotateQuarterTurns } from '../../domain/orientation'

interface PhysicsPanelProps {
  physics: MeltPoolPhysics | null
  loading?: boolean
  error?: string | null
  /** Quarter turns applied so travel runs down the screen. */
  quarterTurns?: number
  /** Probed contour point, shared by all three maps. */
  selectedIndex?: number | null
  onSelectPoint?: (index: number) => void
}

/**
 * What was measured at the probed point on the contour.
 *
 * The same line appears under each map, because the three quantities are read
 * together: a gradient means little without knowing whether that stretch of
 * boundary was freezing, and the ratio of the two is what maps to morphology.
 */
function ProbeReadout({
  point,
  index,
  total,
  quarterTurns = 0,
}: {
  point: BoundaryPoint | undefined
  index: number | null
  total: number
  quarterTurns?: number
}) {
  if (!point || index === null) {
    return (
      <p className="text-xs text-steel-500">
        Click the contour to measure a point, then use the arrow keys to walk along it.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[color:var(--border-hairline)] pt-2 text-xs">
      <span className="eyebrow text-accent-300">Point {index + 1} of {total}</span>
      {/* Position as shown: the view is turned, so camera-frame coordinates
          would not match where the probe sits on screen. */}
      <span className="text-steel-400" title="Position relative to the pool centre, as displayed">
        at{' '}
        <span className="readout text-steel-200">
          {rotateQuarterTurns(point.xMm, point.yMm, quarterTurns)[0].toFixed(2)}
        </span>
        ,{' '}
        <span className="readout text-steel-200">
          {rotateQuarterTurns(point.xMm, point.yMm, quarterTurns)[1].toFixed(2)}
        </span>{' '}
        mm
      </span>
      <span className="text-steel-400">
        G <span className="readout text-steel-100">{Math.round(point.gradientCPerMm).toLocaleString('en-US')}</span> °C/mm
      </span>
      <span className="text-steel-400" title="Angle between the outward normal here and the direction of travel">
        θ <span className="readout text-steel-200">{point.thetaDeg.toFixed(0)}</span>°
      </span>
      {point.solidificationMmPerS === null ? (
        <span className="text-steel-500">leading edge, so no solidification rate</span>
      ) : (
        <span className="text-steel-400">
          R <span className="readout text-steel-100">{point.solidificationMmPerS.toFixed(2)}</span> mm/s
        </span>
      )}
    </div>
  )
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
          <BoundaryMap
            points={p.points}
            metric="none"
            headingDeg={p.travel.headingDeg}
            unit=""
            quarterTurns={props.quarterTurns}
            selectedIndex={props.selectedIndex}
            onSelectPoint={props.onSelectPoint}
          />
          <ProbeReadout
            point={props.selectedIndex === null || props.selectedIndex === undefined ? undefined : p.points[props.selectedIndex]}
            index={props.selectedIndex ?? null}
            total={p.points.length}
            quarterTurns={props.quarterTurns}
          />
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
            <span className="readout text-steel-200">{p.thresholdC.toFixed(0)} °C</span>{' '}
            {p.thresholdSource === 'user' ? '(melting temperature)' : '(machine log)'} · travel{' '}
            <span className="font-mono text-steel-200">{p.travel.speedMmPerS.toFixed(1)} mm/s</span>{' '}
            {p.travel.speedSource === 'measured' ? 'from the machine log' : '(nominal, no log)'}
          </p>
        </div>
      )}
    </Shell>
  )
}

/**
 * Thermal gradient G around the boundary.
 *
 * Sampled outward along the normal and fitted by least squares, which is the
 * procedure Shubham specified. The window is stated on screen because the
 * measured profile is not linear — the surroundings stay hot — so G at 0.09 mm
 * is roughly double G at 0.36 mm. A number without its baseline would not be
 * reproducible.
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
            quarterTurns={props.quarterTurns}
            selectedIndex={props.selectedIndex}
            onSelectPoint={props.onSelectPoint}
          />
          <ProbeReadout
            point={props.selectedIndex === null || props.selectedIndex === undefined ? undefined : p.points[props.selectedIndex]}
            index={props.selectedIndex ?? null}
            total={p.points.length}
            quarterTurns={props.quarterTurns}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
            <span title="Median across all boundary points">
              G median{' '}
              <span className="readout text-steel-200">
                {p.summary.gradientMedianCPerMm.toLocaleString('en-US')} °C/mm
              </span>
            </span>
            <span title="10th to 90th percentile across the boundary">
              range{' '}
              <span className="readout text-steel-200">
                {p.summary.gradientP10CPerMm.toLocaleString('en-US')}–
                {p.summary.gradientP90CPerMm.toLocaleString('en-US')}
              </span>
            </span>
            <span title="Boundary points whose temperature rises outward: sensor noise at the pool edge, reported rather than hidden">
              rising outward{' '}
              <span className="readout text-steel-200">{p.summary.gradientNegativePct}%</span>
            </span>
          </div>
          <p className="text-xs leading-relaxed text-steel-400">
            Least-squares fit of temperature over{' '}
            <span className="readout text-steel-200">{p.summary.gradientSamples}</span> samples
            stepping outward along the normal, a{' '}
            <span className="readout text-steel-200">
              {(p.summary.gradientWindowMm * 1000).toFixed(0)} µm
            </span>{' '}
            baseline. The profile is not linear, because the surroundings stay hot, so a longer baseline
            returns a smaller gradient.
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
            quarterTurns={props.quarterTurns}
            selectedIndex={props.selectedIndex}
            onSelectPoint={props.onSelectPoint}
          />
          <ProbeReadout
            point={props.selectedIndex === null || props.selectedIndex === undefined ? undefined : p.points[props.selectedIndex]}
            index={props.selectedIndex ?? null}
            total={p.points.length}
            quarterTurns={props.quarterTurns}
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
