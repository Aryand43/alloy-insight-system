/**
 * The layer-profile chart, with its layers selectable.
 *
 * The chart is server-rendered SVG — the same image for both modes, already
 * carrying the ramp-up shading and the model's flags. Clicking a point has to
 * work anyway, so the plot area is overlaid with one transparent button per
 * layer. That keeps selection pixel-accurate without re-plotting the chart in
 * the browser, and gives keyboard users the same target.
 *
 * The geometry below mirrors `layerProfileSvg` in `server/src/services/charts.ts`:
 * a 640x420 viewBox with an 84px left margin and 24px right margin. The
 * container is locked to that aspect ratio so `object-contain` leaves no
 * letterboxing, and a layer's position maps straight to a percentage.
 */
const CHART_W = 640
const PLOT_LEFT = 84
const PLOT_RIGHT = CHART_W - 24

interface ProfileChartProps {
  src: string
  alt: string
  /** Layers plotted, which sets the x scale. */
  layerCount: number
  activeLayer: number | null
  onSelectLayer: (layer: number) => void
  /** Rendered into each layer's tooltip, e.g. its temperature. */
  describeLayer?: (layer: number) => string
  flagged?: Map<number, 'watch' | 'alert'>
}

function xFraction(index: number, count: number): number {
  const span = PLOT_RIGHT - PLOT_LEFT
  const x = count <= 1 ? PLOT_LEFT + span / 2 : PLOT_LEFT + (index / (count - 1)) * span
  return x / CHART_W
}

export function ProfileChart({
  src,
  alt,
  layerCount,
  activeLayer,
  onSelectLayer,
  describeLayer,
  flagged,
}: ProfileChartProps) {
  // Half the gap between adjacent layers, so the buttons tile the plot area.
  const halfStep =
    layerCount > 1 ? (xFraction(1, layerCount) - xFraction(0, layerCount)) / 2 : 0.5

  return (
    <div className="surface-inset viz-primary relative overflow-hidden rounded-sm">
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 h-full w-full object-contain"
        decoding="async"
      />
      <div
        className="absolute inset-0"
        role="group"
        aria-label="Select a layer on the chart"
      >
        {Array.from({ length: layerCount }, (_, i) => {
          const layer = i + 1
          const centre = xFraction(i, layerCount)
          const severity = flagged?.get(layer)
          const active = layer === activeLayer
          return (
            <button
              key={layer}
              type="button"
              onClick={() => onSelectLayer(layer)}
              aria-pressed={active}
              aria-label={`Layer ${layer}${severity ? `, flagged (${severity})` : ''}`}
              title={describeLayer?.(layer) ?? `Layer ${layer}`}
              style={{
                left: `${Math.max(0, (centre - halfStep) * 100)}%`,
                width: `${halfStep * 200}%`,
              }}
              className={[
                'absolute top-0 h-full border-0 bg-transparent p-0',
                // A hairline on hover is enough feedback; the chart itself
                // already marks the selected layer.
                'hover:bg-steel-50/5 focus-visible:bg-steel-50/10 focus-visible:outline-none',
              ].join(' ')}
            />
          )
        })}
      </div>
    </div>
  )
}
