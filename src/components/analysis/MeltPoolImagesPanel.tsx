import { useEffect, useRef, useState } from 'react'
import type {
  LayerFrameAnomalies,
  ThermalFrameRef,
  ThermalFrameStats,
} from '../../domain/types'
import { TEMP_MAX_C } from '../../domain/thermalColor'
import { Button } from '../ui/Button'

interface MeltPoolImagesPanelProps {
  frames: ThermalFrameRef[]
  total: number
  position: number
  onSeek: (position: number) => void
  stats: ThermalFrameStats | null
  meltThresholdC: number
  /** Sensor ceiling; peaks at or above it are saturated. */
  tempMaxC?: number
  /** Per-frame deviation for this layer, marked on the scrubber. */
  frameAnomalies?: LayerFrameAnomalies | null
  loading?: boolean
  error?: string | null
}

/**
 * An aspect ratio near 1 means the pool is round, and a round blob has no
 * meaningful long axis — the computed angle then flips frame to frame on
 * noise. Below this it is not shown.
 */
const ANGLE_MEANINGFUL_ASPECT = 1.15

/** Signed deviation from the build's steady-state pool, coloured by direction. */
function Deviation({ value }: { value: number }) {
  const big = Math.abs(value) >= 10
  return (
    <span
      className={big ? 'ml-1 text-signal-yellow' : 'ml-1 text-steel-400'}
      title="Difference from the median pool measured across this build's steady-state layers"
    >
      {value >= 0 ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  )
}

/** Pixel counts get thousands separators; temperatures never do (1817 °C). */
function whole(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/**
 * Right panel in Alloy Insight: the ~380 melt-pool frames captured within the
 * pinned layer, segmented at the melt threshold in force.
 *
 * The scrubber doubles as the layer's deviation track: frames the model
 * flagged are ticked along it, so the stretch of the pass where the pool left
 * the build's steady state can be scrubbed to directly.
 */
export function MeltPoolImagesPanel({
  frames,
  total,
  position,
  onSeek,
  stats,
  meltThresholdC,
  tempMaxC = TEMP_MAX_C,
  frameAnomalies,
  loading,
  error,
}: MeltPoolImagesPanelProps) {
  const [playing, setPlaying] = useState(false)
  const positionRef = useRef(position)
  positionRef.current = position

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => onSeek(positionRef.current + 1), 125)
    return () => clearInterval(id)
  }, [playing, onSeek])

  const current = frames.find((f) => f.position === position) ?? null

  // Warm the next few frames so scrubbing does not flash.
  useEffect(() => {
    for (const f of frames) {
      if (f.position > position && f.position <= position + 4) {
        const img = new Image()
        img.src = f.imageUrl
      }
    }
  }, [frames, position])

  if (loading && !current) {
    return (
      <div className="viz-primary flex items-center justify-center text-sm text-steel-400">
        Loading melt-pool frames…
      </div>
    )
  }

  const saturated = stats ? stats.maxTempC >= tempMaxC : false

  return (
    <div className="flex flex-col gap-2">
      <div className="viz-primary relative overflow-hidden rounded-sm bg-steel-950/60">
        {error ? (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-signal-red-text">
            {error}
          </p>
        ) : current ? (
          <>
            <img
              src={current.imageUrl}
              alt={`Melt pool, frame ${position + 1} of ${total}`}
              /* Native frames are 218x164; keep the pixels crisp when upscaled. */
              className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
              decoding="async"
            />
            <span className="absolute left-2 top-2 rounded-sm border border-steel-600/50 bg-steel-950/85 px-2 py-0.5 text-xs text-steel-300">
              Segmented from raw camera frame
            </span>
          </>
        ) : (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-steel-400">
            No image for this frame.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={() => onSeek(position - 1)}
          aria-label="Previous frame"
        >
          ‹
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause playback' : 'Play frames'}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={() => onSeek(position + 1)}
          aria-label="Next frame"
        >
          ›
        </Button>
        <div className="relative flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(total - 1, 0)}
            value={position}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="h-1 w-full cursor-pointer accent-signal-yellow"
            aria-label="Frame within layer"
          />
          {/* Ticks sit under the thumb and ignore pointer events, so dragging
              the scrubber still works across them. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-1 h-1.5">
            {(frameAnomalies?.anomalies ?? []).map((a) => (
              <span
                key={a.position}
                className="absolute h-1.5 w-0.5 rounded-full bg-signal-red"
                style={{ left: `${total > 1 ? (a.position / (total - 1)) * 100 : 50}%` }}
              />
            ))}
          </div>
        </div>
        <span className="shrink-0 text-xs text-steel-400">
          Frame <span className="font-mono text-steel-200">{position + 1}</span> of{' '}
          <span className="font-mono text-steel-200">{total}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full border-2 border-melt-boundary"
          />
          Melt pool boundary
        </span>
        <span className="text-steel-400">
          Threshold{' '}
          <span className="font-mono text-steel-200">
            {(stats?.thresholdC ?? meltThresholdC).toFixed(0)} °C
          </span>{' '}
          {stats?.thresholdSource === 'user' ? '(set in setup)' : '(machine log)'}
        </span>
        {frameAnomalies && (
          <span
            className="text-steel-400"
            title={frameAnomalies.note}
          >
            {frameAnomalies.anomalies.length
              ? `${frameAnomalies.anomalies.length} of ${frameAnomalies.frameCount} frames deviate (${frameAnomalies.flaggedPct}%)`
              : `All ${frameAnomalies.frameCount} frames within steady state`}
          </span>
        )}
      </div>

      {stats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
          <span title="Pixels above the melt threshold in the region the machine evaluates">
            Area <span className="font-mono text-steel-200">{whole(stats.maskPixels)} px</span> ·
            machine log{' '}
            <span className="font-mono text-steel-300">{whole(stats.loggedSizePx)} px</span>
          </span>
          {stats.maskPixels === 0 ? (
            // Mean and peak are undefined with no pixels, not 0 °C.
            <span className="text-steel-300">No pixels above the melt threshold in this frame.</span>
          ) : (
            <>
              <span title="Mean temperature of the segmented melt pool">
                Mean <span className="font-mono text-steel-200">{stats.meanTempC.toFixed(0)} °C</span> ·
                machine log{' '}
                <span className="font-mono text-steel-300">{stats.loggedTempC.toFixed(0)} °C</span>
              </span>
              <span
                title={
                  saturated
                    ? 'The camera saturates at this temperature, so the true peak may be higher'
                    : undefined
                }
              >
                Peak{' '}
                <span className="font-mono text-steel-200">
                  {saturated ? '≥ ' : ''}
                  {stats.maxTempC.toFixed(0)} °C
                </span>
                {saturated && ' (sensor limit)'}
              </span>
            </>
          )}
        </div>
      )}

      {stats?.dimensions && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-400">
          <span title="Measured end to end along the pool's long axis, which runs with the direction of travel">
            Length{' '}
            <span className="font-mono text-steel-200">
              {stats.dimensions.lengthMm.toFixed(2)} mm
            </span>
            {stats.dimensions.lengthDeviationPct !== null && (
              <Deviation value={stats.dimensions.lengthDeviationPct} />
            )}
          </span>
          <span title="Measured across the bead, perpendicular to the long axis">
            Width{' '}
            <span className="font-mono text-steel-200">
              {stats.dimensions.widthMm.toFixed(2)} mm
            </span>
            {stats.dimensions.widthDeviationPct !== null && (
              <Deviation value={stats.dimensions.widthDeviationPct} />
            )}
          </span>
          <span title="Length / width; 1 is round, higher is more elongated">
            Aspect{' '}
            <span className="font-mono text-steel-200">
              {stats.dimensions.aspect.toFixed(2)}
            </span>
          </span>
          {stats.dimensions.aspect >= ANGLE_MEANINGFUL_ASPECT && (
            <span title="Orientation of the long axis in the camera image">
              Axis{' '}
              <span className="font-mono text-steel-200">
                {stats.dimensions.angleDeg.toFixed(0)}°
              </span>
            </span>
          )}
          <span className="text-steel-500">vs this build&rsquo;s steady-state pool</span>
        </div>
      )}
    </div>
  )
}
