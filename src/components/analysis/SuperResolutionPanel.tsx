import { useEffect, useMemo, useRef } from 'react'
import type { Calibration, ThermalField } from '../../api/thermalField'
import { TEMP_MAX_C, TEMP_MIN_C, celsiusToRgb } from '../../domain/thermalColor'

/** Margin left around the melt pool, in native camera pixels. */
const MARGIN = 8
/** Upscale factor, and the smallest window worth showing. */
const SCALE = 4
const MIN_WINDOW = 24

interface SuperResolutionPanelProps {
  field: ThermalField | null
  calibration: Calibration | null
  /** Threshold the pool is bounded by — the operator's when they set one. */
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

/** Catmull-Rom, the usual cubic kernel for image resampling. */
function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    b +
    0.5 * t * (c - a) +
    0.5 * t2 * (2 * a - 5 * b + 4 * c - d) +
    0.5 * t3 * (-a + 3 * b - 3 * c + d)
  )
}

function paint(
  canvas: HTMLCanvasElement | null,
  w: Window,
  mode: 'nearest' | 'bicubic',
): void {
  if (!canvas) return
  const outW = w.cols * SCALE
  const outH = w.rows * SCALE
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const image = ctx.createImageData(outW, outH)
  for (let y = 0; y < outH; y++) {
    // Sample at pixel centres, so the two views line up exactly.
    const sy = (y + 0.5) / SCALE - 0.5
    const r0 = Math.floor(sy)
    const fy = sy - r0
    for (let x = 0; x < outW; x++) {
      const sx = (x + 0.5) / SCALE - 0.5
      const c0 = Math.floor(sx)
      const fx = sx - c0

      let temp: number
      if (mode === 'nearest') {
        temp = sample(w, Math.round(sy), Math.round(sx))
      } else {
        // Interpolate temperature, then colour it — interpolating the colours
        // instead would bend values across the ramp's stops.
        const rows: number[] = []
        for (let m = -1; m <= 2; m++) {
          rows.push(
            cubic(
              sample(w, r0 + m, c0 - 1),
              sample(w, r0 + m, c0),
              sample(w, r0 + m, c0 + 1),
              sample(w, r0 + m, c0 + 2),
              fx,
            ),
          )
        }
        temp = cubic(rows[0], rows[1], rows[2], rows[3], fy)
      }

      const [red, green, blue] = celsiusToRgb(
        Math.max(TEMP_MIN_C, Math.min(temp, TEMP_MAX_C)),
      )
      const o = (y * outW + x) * 4
      image.data[o] = red
      image.data[o + 1] = green
      image.data[o + 2] = blue
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * The whole melt pool in raw camera pixels, beside an upscaled view of the
 * same window.
 *
 * This is **bicubic interpolation, not a super-resolution network**. It adds no
 * detail that was not in the frame — it only stops the melt-pool boundary
 * reading as a staircase at this magnification. The trained SR network is meant
 * to go here, and when it does the only thing that changes is how the right
 * canvas is filled: same crop, same colour map, same labels.
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

  useEffect(() => {
    if (!window) return
    paint(rawRef.current, window, 'nearest')
    paint(upRef.current, window, 'bicubic')
  }, [window])

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
            title: `${SCALE}× upscaled`,
            note: 'bicubic',
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
        Interpolated, not a trained super-resolution model — it adds no detail the camera did not
        capture. The SR network drops in here.
      </p>
    </div>
  )
}
