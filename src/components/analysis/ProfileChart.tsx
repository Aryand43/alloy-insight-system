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
 * a 640x420 viewBox with 84px left, 24px right, 72px top and 56px bottom
 * margins. The panel is sized by height alone, so `object-contain` letterboxes
 * the image whenever the panel's aspect ratio differs from the chart's; the
 * overlay is measured onto the drawn image rather than the container, because
 * tiling the container instead puts every target out by the letterbox — about
 * a layer's width at a wide panel size.
 */
import { useEffect, useRef, useState } from 'react'
import { useThemeStore } from '../../store/themeStore'

const CHART_W = 640
const CHART_H = 420
const PLOT_LEFT = 84
const PLOT_RIGHT = CHART_W - 24
const PLOT_TOP = 72
const PLOT_BOTTOM = CHART_H - 56
const RATIO = CHART_W / CHART_H

/** The plotted band, as insets within the drawn image. */
const PLOT_BAND = {
  top: `${(PLOT_TOP / CHART_H) * 100}%`,
  bottom: `${((CHART_H - PLOT_BOTTOM) / CHART_H) * 100}%`,
}
/** Keeps the hover readout clear of the plot's own edges. */
const READOUT_MARGIN = 0.14

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

interface DrawnBox {
  left: number
  top: number
  width: number
  height: number
}

function xFraction(index: number, count: number): number {
  const span = PLOT_RIGHT - PLOT_LEFT
  const x = count <= 1 ? PLOT_LEFT + span / 2 : PLOT_LEFT + (index / (count - 1)) * span
  return x / CHART_W
}

/** Charts are server-rendered images, so the palette goes in the request. */
function themed(src: string, theme: string): string {
  return theme === 'light' ? `${src}${src.includes('?') ? '&' : '?'}theme=light` : src
}

/** Where `object-contain` actually draws the chart inside the panel. */
function containedBox(width: number, height: number): DrawnBox {
  if (width <= 0 || height <= 0) return { left: 0, top: 0, width, height }
  const wide = width / height > RATIO
  const drawnW = wide ? height * RATIO : width
  const drawnH = wide ? height : width / RATIO
  return {
    left: (width - drawnW) / 2,
    top: (height - drawnH) / 2,
    width: drawnW,
    height: drawnH,
  }
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
  const theme = useThemeStore((s) => s.theme)
  const hostRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<DrawnBox | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  // The panel resizes with the window and with the layout, so the drawn box is
  // remeasured rather than computed once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => {
      const rect = host.getBoundingClientRect()
      setBox(containedBox(rect.width, rect.height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  // Half the gap between adjacent layers, so the buttons tile the plot area.
  const halfStep =
    layerCount > 1 ? (xFraction(1, layerCount) - xFraction(0, layerCount)) / 2 : 0.5

  return (
    <div ref={hostRef} className="surface-inset viz-primary relative overflow-hidden rounded-sm">
      <img
        src={themed(src, theme)}
        alt={alt}
        className="absolute inset-0 h-full w-full object-contain"
        decoding="async"
      />
      {box && (
        <div
          className="absolute"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
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
                onPointerEnter={() => setHovered(layer)}
                onPointerLeave={() => setHovered((h) => (h === layer ? null : h))}
                onFocus={() => setHovered(layer)}
                onBlur={() => setHovered((h) => (h === layer ? null : h))}
                className="group absolute top-0 h-full cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none"
              >
                {/*
                 * Feedback is drawn down the plotted band only, so it reads as
                 * part of the chart rather than washing over its title and
                 * axis. The line marks which layer the click will take, which
                 * matters most here: at 56 layers the columns are about seven
                 * pixels apart, too fine to judge by eye.
                 */}
                <span
                  aria-hidden
                  style={PLOT_BAND}
                  className="absolute inset-x-0 bg-accent-500/0 transition-colors group-hover:bg-accent-500/14 group-focus-visible:bg-accent-500/18"
                />
                <span
                  aria-hidden
                  style={PLOT_BAND}
                  className="absolute left-1/2 w-0.5 -translate-x-1/2 bg-accent-500/0 transition-colors group-hover:bg-accent-500 group-focus-visible:bg-accent-500"
                />
              </button>
            )
          })}
          {/*
           * The native tooltip takes about a second to appear, which is too
           * slow to scrub a chart with. This says what a click would select
           * straight away, down at the foot of the plot where the series very
           * rarely runs.
           */}
          {hovered !== null && (
            <span
              aria-hidden
              className="surface-sunken pointer-events-none absolute -translate-x-1/2 whitespace-nowrap rounded-sm border border-[color:var(--border-hairline)] px-1.5 py-0.5 text-xs text-steel-100"
              style={{
                left: `${Math.min(1 - READOUT_MARGIN, Math.max(READOUT_MARGIN, xFraction(hovered - 1, layerCount))) * 100}%`,
                bottom: `calc(${PLOT_BAND.bottom} + 6px)`,
              }}
            >
              {describeLayer?.(hovered) ?? `Layer ${hovered}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
