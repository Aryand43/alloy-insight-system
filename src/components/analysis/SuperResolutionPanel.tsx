import { useEffect, useMemo, useRef } from 'react'
import type { Calibration, ThermalField } from '../../api/thermalField'
import { TEMP_MAX_C, TEMP_MIN_C, celsiusToRgb } from '../../domain/thermalColor'
import { SR_MODEL } from '../../domain/srModel'
import { superResolve, type Grid } from '../../domain/superResolution'

/** Margin left around the melt pool, in native camera pixels. */
const MARGIN = 8
/** Upscale factor is the model's; the window has a floor so tiny pools stay readable. */
const SCALE = SR_MODEL.scale
const MIN_WINDOW = 24

interface SuperResolutionPanelProps {
  field: ThermalField | null
  calibration: Calibration | null
  /** Threshold the pool is bounded by: the operator's when they set one. */
  thresholdC: number
  loading?: boolean
  error?: string | null
}

interface Window {
  /** Temperatures in °C, row-major. */
  temps: Float32Array
  rows: number
  cols: number
}

/**
 * Crops to the whole melt pool: the bounding box of everything above the
 * threshold, plus a margin so the boundary is not flush with the edge.
 *
 * Framing the pool rather than a fixed box around the hottest pixel is what
 * makes the two canvases comparable frame to frame — the window follows the
 * pool as it grows and shrinks, and the whole of it is always in view.
 */
function cropMeltPool(
  field: ThermalField,
  calibration: Calibration,
  thresholdC: number,
): Window {
  const { width, height, counts } = field

  let minRow = height
  let maxRow = -1
  let minCol = width
  let maxCol = -1
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const celsius = calibration.celsius[counts[r * width + c]] ?? TEMP_MIN_C
      if (celsius < thresholdC) continue
      if (r < minRow) minRow = r
      if (r > maxRow) maxRow = r
      if (c < minCol) minCol = c
      if (c > maxCol) maxCol = c
    }
  }

  // Nothing above the threshold: show the whole frame rather than nothing.
  if (maxRow < 0) {
    minRow = 0
    minCol = 0
    maxRow = height - 1
    maxCol = width - 1
  }

  const grow = (lo: number, hi: number, limit: number) => {
    let a = Math.max(0, lo - MARGIN)
    let b = Math.min(limit - 1, hi + MARGIN)
    // Keep the window usefully large when the pool is tiny.
    const shortfall = MIN_WINDOW - (b - a + 1)
    if (shortfall > 0) {
      a = Math.max(0, a - Math.ceil(shortfall / 2))
      b = Math.min(limit - 1, b + Math.ceil(shortfall / 2))
    }
    return [a, b] as const
  }

  const [r0, r1] = grow(minRow, maxRow, height)
  const [c0, c1] = grow(minCol, maxCol, width)
  const rows = r1 - r0 + 1
  const cols = c1 - c0 + 1

  const temps = new Float32Array(rows * cols)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      temps[r * cols + c] =
        calibration.celsius[counts[(r0 + r) * width + c0 + c]] ?? TEMP_MIN_C
    }
  }
  return { temps, rows, cols }
}

function sample(w: Window, r: number, c: number): number {
  const row = r < 0 ? 0 : r >= w.rows ? w.rows - 1 : r
  const col = c < 0 ? 0 : c >= w.cols ? w.cols - 1 : c
  return w.temps[row * w.cols + col]
}

/**
 * Paints a temperature grid through the thermal colour map.
 *
 * Reconstruction happens in °C and only the result is coloured: interpolating
 * colours instead would bend values across the ramp's stops and invent
 * temperatures that were never measured.
 */
function paintGrid(canvas: HTMLCanvasElement | null, grid: Grid): void {
  if (!canvas) return
  canvas.width = grid.width
  canvas.height = grid.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const image = ctx.createImageData(grid.width, grid.height)
  for (let i = 0; i < grid.values.length; i++) {
    const [red, green, blue] = celsiusToRgb(
      Math.max(TEMP_MIN_C, Math.min(grid.values[i], TEMP_MAX_C)),
    )
    const o = i * 4
    image.data[o] = red
    image.data[o + 1] = green
    image.data[o + 2] = blue
    image.data[o + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
}

/** Nearest-neighbour blow-up: the raw pixels, honestly blocky. */
function nearestGrid(w: Window): Grid {
  const width = w.cols * SCALE
  const height = w.rows * SCALE
  const values = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      values[y * width + x] = sample(w, (y / SCALE) | 0, (x / SCALE) | 0)
    }
  }
  return { values, width, height }
}

/**
 * The whole melt pool in raw camera pixels, beside the super-resolved view of
 * the same window.
 *
 * The right canvas is a learned reconstruction, not a sharpening filter: a
 * sub-pixel regressor trained self-supervised on this camera's own frames,
 * which predicts the detail a 4x downscale destroys and adds it to a bicubic
 * baseline. Measured on frames from a build it never saw, it is worth about
 * +0.8 dB PSNR over bicubic — a real gain, and a modest one, because a thermal
 * field this smooth has little high-frequency detail left to recover.
 */
export function SuperResolutionPanel({
  field,
  calibration,
  thresholdC,
  loading,
  error,
}: SuperResolutionPanelProps) {
  const rawRef = useRef<HTMLCanvasElement>(null)
  const upRef = useRef<HTMLCanvasElement>(null)

  const window = useMemo(
    () => (field && calibration ? cropMeltPool(field, calibration, thresholdC) : null),
    [field, calibration, thresholdC],
  )

  // Reconstruction is the expensive step, so it is memoised on the window
  // rather than redone whenever the component happens to re-render.
  const restored = useMemo(
    () =>
      window
        ? superResolve(
            { values: window.temps, width: window.cols, height: window.rows },
            SR_MODEL,
          )
        : null,
    [window],
  )

  useEffect(() => {
    if (!window || !restored) return
    paintGrid(rawRef.current, nearestGrid(window))
    paintGrid(upRef.current, restored)
  }, [window, restored])

  if (error) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-signal-red-text">
        {error}
      </div>
    )
  }

  if (loading || !window || !field) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Loading frame…' : 'No frame data for this position.'}
      </div>
    )
  }

  const widthMm = (window.cols * field.stride * 0.0297).toFixed(2)
  const heightMm = (window.rows * field.stride * 0.0297).toFixed(2)

  return (
    <div className="flex flex-col gap-2">
      <div className="viz-secondary grid grid-cols-2 gap-2.5">
        {[
          {
            ref: rawRef,
            title: 'Raw',
            note: `${window.cols}×${window.rows} px`,
          },
          {
            ref: upRef,
            title: `Super resolution ${SCALE}×`,
            note: `${window.cols * SCALE}×${window.rows * SCALE} px`,
          },
        ].map((pane) => (
          <div
            key={pane.title}
            className="surface-inset relative overflow-hidden rounded-sm"
          >
            <canvas
              ref={pane.ref}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
              aria-label={`${pane.title} melt-pool window`}
            />
            <span className="absolute left-1.5 top-1.5 rounded-sm border border-[color:var(--border-hairline)] bg-steel-950/85 px-1.5 py-0.5 text-xs text-steel-200">
              {pane.title}
            </span>
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-steel-950/80 px-1.5 py-0.5 font-mono text-xs text-steel-400">
              {pane.note}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-steel-400">
        The whole melt pool at{' '}
        <span className="font-mono text-steel-200">{thresholdC.toFixed(0)} °C</span>, same window
        in both ·{' '}
        <span className="font-mono text-steel-200">
          {widthMm} × {heightMm} mm
        </span>
      </p>
      <p className="text-xs text-steel-400">
        Reconstructed by a model trained on this camera&rsquo;s own frames ·{' '}
        <span className="readout text-steel-200">
          +{(SR_MODEL.meta.psnrModel - SR_MODEL.meta.psnrBicubic).toFixed(2)} dB
        </span>{' '}
        over bicubic on held-out builds
      </p>
    </div>
  )
}
