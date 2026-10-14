import { useMemo } from 'react'
import type { LayerFootprint } from '../../domain/types'

/**
 * Every melt-pool outline in one layer, drawn where the nozzle actually was.
 *
 * The camera travels with the nozzle, so each frame on its own shows a pool in
 * the middle of the picture and tells you nothing about coverage. Put back on
 * the machine's axes, the same frames become the layer's melted footprint, and
 * the porosity question is visible directly: did consecutive passes overlap, or
 * is there a patch between them that never melted?
 *
 * Outlines are drawn faintly and additively, so where many passes overlap the
 * contours pile up and read darker. Any enclosed patch no pool covered is
 * ringed in red.
 */

interface LayerFootprintPanelProps {
  footprint: LayerFootprint | null
  loading?: boolean
  error?: string | null
  /** Shown beside the coverage, from the porosity report. */
  trackSpacingMm?: number | null
  poolWidthMm?: number | null
}

export function LayerFootprintPanel({
  footprint,
  loading,
  error,
  trackSpacingMm,
  poolWidthMm,
}: LayerFootprintPanelProps) {
  const paths = useMemo(() => {
    if (!footprint) return []
    return footprint.outlines.map(
      (o) => `M${o.points.map(([x, y]) => `${x} ${y}`).join('L')}Z`,
    )
  }, [footprint])

  if (error) {
    return (
      <div className="viz-primary flex items-center justify-center px-6 text-center text-sm text-signal-red-text">
        {error}
      </div>
    )
  }
  if (loading || !footprint) {
    return (
      <div className="viz-primary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading
          ? 'Reading every frame in this layer…'
          : 'Select a layer with thermal frames to see its footprint.'}
      </div>
    )
  }
  if (!footprint.outlines.length) {
    return (
      <div className="viz-primary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        No melt pool was detected in this layer at {footprint.thresholdC.toFixed(0)} °C.
      </div>
    )
  }

  const { minXMm, maxXMm, minYMm, maxYMm } = footprint.bounds
  const pad = 0.6
  const width = maxXMm - minXMm + pad * 2
  const height = maxYMm - minYMm + pad * 2

  return (
    <div className="flex flex-col gap-2">
      <div className="surface-inset viz-primary relative overflow-hidden rounded-sm">
        <svg
          viewBox={`${minXMm - pad} ${minYMm - pad} ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Melt-pool outlines for all ${footprint.framesUsed} frames of layer ${footprint.layer}, in machine coordinates`}
        >
          {/*
            Drawn twice. A near-transparent fill accumulates where passes
            overlap, so the band that was remelted many times reads solid and
            a patch nothing covered stays empty; the outline on top keeps the
            individual pools visible rather than dissolving them into a blob.
          */}
          <g fill="var(--color-melt-boundary)" opacity="0.03">
            {paths.map((d, i) => (
              <path key={`f${i}`} d={d} />
            ))}
          </g>
          <g
            fill="none"
            stroke="var(--color-melt-boundary)"
            strokeWidth={Math.max(width, height) / 700}
            opacity="0.3"
          >
            {paths.map((d, i) => (
              <path key={`s${i}`} d={d} />
            ))}
          </g>
          {footprint.gaps.map((gap, i) => (
            <circle
              key={i}
              cx={gap.xMm}
              cy={gap.yMm}
              // Radius of a circle with the gap's area, floored so a small one
              // is still findable at panel scale.
              // Floored generously: a real gap can be a fraction of a
              // millimetre across in a field 65 mm wide, and an unfindable
              // marker is the same as no marker.
              r={Math.max(Math.sqrt(gap.areaMm2 / Math.PI), width / 90)}
              fill="none"
              stroke="var(--color-signal-red)"
              strokeWidth={width / 320}
            />
          ))}
        </svg>
        <span className="absolute bottom-1.5 right-2 rounded-sm bg-steel-950/80 px-1.5 py-0.5 font-mono text-xs text-steel-400">
          {width.toFixed(0)} × {height.toFixed(0)} mm
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-2 rounded-full bg-melt-boundary" />
          <span className="readout text-steel-200">{footprint.framesUsed}</span> pool outlines
        </span>
        {!footprint.gapsAssessed ? (
          <span className="text-steel-300">Gaps not assessed at this frame spacing</span>
        ) : footprint.gapCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-signal-red-text">
            <span aria-hidden className="h-2 w-2 rounded-full bg-signal-red" />
            <span className="readout">{footprint.gapCount}</span> unmelted{' '}
            {footprint.gapCount === 1 ? 'patch' : 'patches'},{' '}
            <span className="readout">{footprint.gapAreaMm2}</span> mm² in total
          </span>
        ) : (
          <span className="text-signal-green">
            No unmelted patch enclosed by the melted area
          </span>
        )}
        <span className="text-steel-400">
          melted <span className="readout text-steel-200">{footprint.coveredAreaMm2}</span> mm²
        </span>
      </div>

      <p className="text-xs leading-relaxed text-steel-400">
        Every frame of layer{' '}
        <span className="readout text-steel-200">{footprint.layer}</span> at its logged position,
        outlined at{' '}
        <span className="readout text-steel-200">{footprint.thresholdC.toFixed(0)} °C</span>
        {trackSpacingMm && poolWidthMm ? (
          <>
            {' '}· passes <span className="readout text-steel-200">
              {trackSpacingMm.toFixed(2)} mm
            </span>{' '}
            apart into a <span className="readout text-steel-200">{poolWidthMm.toFixed(2)} mm</span>{' '}
            pool
          </>
        ) : null}
        .{' '}
        {!footprint.gapsAssessed && footprint.stepMm && footprint.poolWidthMm ? (
          <>
            The frames of this layer step{' '}
            <span className="readout text-steel-200">{footprint.stepMm.toFixed(2)} mm</span> between
            pools that are{' '}
            <span className="readout text-steel-200">{footprint.poolWidthMm.toFixed(2)} mm</span>{' '}
            across, so consecutive pools do not touch and the bare strip between each pair is the
            capture interval rather than the process. The traces are drawn as measured; enclosed
            gaps are not counted here, and need a layer captured at the full frame rate.{' '}
          </>
        ) : null}
        This is the surface melt isotherm, which reaches beyond the bead itself, and it is one
        plane: a gap here is strong evidence of lack of fusion, but no gap does not prove the layer
        fused to the one below.
      </p>
    </div>
  )
}
