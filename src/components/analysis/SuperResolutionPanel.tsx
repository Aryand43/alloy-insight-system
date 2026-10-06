import { useEffect, useMemo, useRef } from 'react'
import type { Calibration, ThermalField } from '../../api/thermalField'
import { TEMP_MAX_C, TEMP_MIN_C, celsiusToRgb } from '../../domain/thermalColor'

/** Source window around the melt pool, in native camera pixels. */
const WINDOW = 56
/** On-screen magnification of that window. */
const SCALE = 6

interface SuperResolutionPanelProps {
  field: ThermalField | null
  calibration: Calibration | null
  loading?: boolean
  error?: string | null
}

interface Window {
  /** Temperatures in °C, row-major, WINDOW x WINDOW. */
  temps: Float32Array
  originRow: number
  originCol: number
  size: number
}

/** Centres a window on the hottest part of the frame. */
function cropHotRegion(field: ThermalField, calibration: Calibration): Window {
  const { width, height, counts } = field
  let hottest = -1
  let hotIndex = 0
  for (let i = 0; i < counts.length; i++) {
    if (counts[i] > hottest) {
      hottest = counts[i]
      hotIndex = i
    }
  }
  const size = Math.min(WINDOW, width, height)
  const centreRow = Math.floor(hotIndex / width)
  const centreCol = hotIndex % width
  const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max - size))
  const originRow = clamp(centreRow - (size >> 1), height)
  const originCol = clamp(centreCol - (size >> 1), width)

  const temps = new Float32Array(size * size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      temps[r * size + c] =
        calibration.celsius[counts[(originRow + r) * width + originCol + c]] ?? TEMP_MIN_C
    }
  }
  return { temps, originRow, originCol, size }
}

function sample(w: Window, r: number, c: number): number {
  const row = r < 0 ? 0 : r >= w.size ? w.size - 1 : r
  const col = c < 0 ? 0 : c >= w.size ? w.size - 1 : c
  return w.temps[row * w.size + col]
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
  const out = w.size * SCALE
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const image = ctx.createImageData(out, out)
  for (let y = 0; y < out; y++) {
    // Sample at pixel centres, so the two views line up exactly.
    const sy = (y + 0.5) / SCALE - 0.5
    const r0 = Math.floor(sy)
    const fy = sy - r0
    for (let x = 0; x < out; x++) {
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
      const o = (y * out + x) * 4
      image.data[o] = red
      image.data[o + 1] = green
      image.data[o + 2] = blue
      image.data[o + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
}

/**
 * Raw camera pixels beside an upscaled view of the same window.
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
  loading,
  error,
}: SuperResolutionPanelProps) {
  const rawRef = useRef<HTMLCanvasElement>(null)
  const upRef = useRef<HTMLCanvasElement>(null)

  const window = useMemo(
    () => (field && calibration ? cropHotRegion(field, calibration) : null),
    [field, calibration],
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

  const nativeMm = (window.size * field.stride * 0.0297).toFixed(2)

  return (
    <div className="flex flex-col gap-2">
      <div className="viz-secondary grid grid-cols-2 gap-2">
        {[
          {
            ref: rawRef,
            title: 'Raw',
            note: `${window.size}×${window.size} px`,
          },
          {
            ref: upRef,
            title: `${SCALE}× upscaled`,
            note: 'bicubic',
          },
        ].map((pane) => (
          <div
            key={pane.title}
            className="relative overflow-hidden rounded-sm bg-steel-950/50"
          >
            <canvas
              ref={pane.ref}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
              aria-label={`${pane.title} melt-pool window`}
            />
            <span className="absolute left-1.5 top-1.5 rounded-sm bg-steel-950/80 px-1.5 py-0.5 text-xs text-steel-200">
              {pane.title}
            </span>
            <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-steel-950/80 px-1.5 py-0.5 text-xs text-steel-400">
              {pane.note}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-steel-400">
        Same window, centred on the hottest pixels ·{' '}
        <span className="font-mono text-steel-200">{nativeMm} mm</span> across
      </p>
      <p className="text-xs text-steel-400">
        Interpolated, not a trained super-resolution model — it adds no detail the camera did not
        capture. The SR network drops in here.
      </p>
    </div>
  )
}
