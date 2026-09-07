import { useEffect, useRef, useState } from 'react'
import type { ThermalFrameRef, ThermalFrameStats } from '../../domain/types'
import { Button } from '../ui/Button'

interface MeltPoolImagesPanelProps {
  frames: ThermalFrameRef[]
  total: number
  position: number
  onSeek: (position: number) => void
  stats: ThermalFrameStats | null
  meltThresholdC: number
  loading?: boolean
  error?: string | null
}

/**
 * Right panel in Alloy Insight: the ~380 melt-pool frames captured within the
 * pinned layer, thresholded at the melt temperature.
 */
export function MeltPoolImagesPanel({
  frames,
  total,
  position,
  onSeek,
  stats,
  meltThresholdC,
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
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Loading melt-pool frames…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-sm bg-steel-950/60">
        {error ? (
          <p className="px-4 text-center text-xs text-signal-red">{error}</p>
        ) : current ? (
          <img
            src={current.imageUrl}
            alt={`Melt pool, frame ${position + 1} of ${total}`}
            /* Native frames are 218x164; keep the pixels crisp when upscaled. */
            className="max-h-44 w-auto object-contain [image-rendering:pixelated]"
            decoding="async"
          />
        ) : (
          <p className="text-sm text-steel-500">No frame</p>
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
        <input
          type="range"
          min={0}
          max={Math.max(total - 1, 0)}
          value={position}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer accent-signal-yellow"
          aria-label="Frame within layer"
        />
        <span className="shrink-0 font-mono text-[11px] text-steel-400">
          {position + 1}/{total}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-steel-300">
          <span className="h-2 w-2 rounded-full bg-signal-red" />
          Melt pool boundary
        </span>
        <span className="text-steel-500">&gt; {meltThresholdC.toFixed(0)} °C</span>
        {stats && (
          <>
            <span className="text-steel-500" title="Pixels above the melt threshold in the evaluated region">
              {stats.maskPixels.toLocaleString()} px
              <span className="text-steel-600"> (machine {stats.loggedSizePx.toLocaleString()})</span>
            </span>
            <span className="text-steel-500" title="Mean temperature of the melt pool">
              {stats.meanTempC.toFixed(0)} °C
              <span className="text-steel-600"> (machine {stats.loggedTempC.toFixed(0)})</span>
            </span>
            <span className="text-steel-500">peak {stats.maxTempC.toFixed(0)} °C</span>
          </>
        )}
      </div>
    </div>
  )
}
