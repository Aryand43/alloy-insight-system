import type { Frame } from '../../domain/types'

interface RawImagesPanelProps {
  frames: Frame[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}

function caption(frame: Frame): string {
  if (frame.zMm !== undefined) return `${frame.label} · z ${frame.zMm.toFixed(2)} mm`
  return `${frame.label} · ${frame.timestampMs} ms`
}

export function RawImagesPanel({
  frames,
  selectedId,
  onSelect,
  loading,
}: RawImagesPanelProps) {
  const selected = frames.find((f) => f.id === selectedId) ?? frames[0]

  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Loading frames…
      </div>
    )
  }

  if (!frames.length) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        No raw images available
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-3">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden rounded-sm bg-steel-950/50">
        {selected && (
          <img
            src={selected.imageUrl}
            alt={selected.label}
            className="max-h-44 w-auto object-contain"
            decoding="async"
          />
        )}
        {selected?.measured === false && (
          <span
            className="absolute right-1.5 top-1.5 rounded-sm border border-steel-600/50 bg-steel-950/80 px-1.5 py-0.5 text-[10px] text-steel-400"
            title="This build has no KIV histogram images — the chart is generated from the per-layer means in the spreadsheet"
          >
            generated
          </span>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {frames.map((frame) => {
          const active = frame.id === (selectedId ?? frames[0]?.id)
          return (
            <button
              key={frame.id}
              type="button"
              onClick={() => onSelect(frame.id)}
              title={caption(frame)}
              className={[
                'shrink-0 overflow-hidden rounded-sm border transition-colors',
                active
                  ? 'border-signal-yellow/70 ring-1 ring-signal-yellow/30'
                  : 'border-steel-700/50 hover:border-steel-500',
              ].join(' ')}
            >
              {/*
                Prefer the lightweight thumbnail: a build can have 84 layers and
                the full-size charts are ~875x656 each.
              */}
              <img
                src={frame.thumbnailUrl ?? frame.imageUrl}
                alt={frame.label}
                className="h-12 w-12 object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          )
        })}
      </div>
      {selected && (
        <p className="font-mono text-[11px] text-steel-500">{caption(selected)}</p>
      )}
    </div>
  )
}
