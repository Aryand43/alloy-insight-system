import type { Frame } from '../../domain/types'

interface RawImagesPanelProps {
  frames: Frame[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
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
      <div className="flex flex-1 items-center justify-center overflow-hidden rounded-sm bg-steel-950/50">
        {selected && (
          <img
            src={selected.imageUrl}
            alt={selected.label}
            className="max-h-44 w-auto object-contain"
          />
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
              className={[
                'shrink-0 overflow-hidden rounded-sm border transition-colors',
                active
                  ? 'border-signal-yellow/70 ring-1 ring-signal-yellow/30'
                  : 'border-steel-700/50 hover:border-steel-500',
              ].join(' ')}
            >
              <img
                src={frame.imageUrl}
                alt={frame.label}
                className="h-12 w-12 object-cover"
              />
            </button>
          )
        })}
      </div>
      {selected && (
        <p className="font-mono text-[11px] text-steel-500">
          {selected.label} · {selected.timestampMs} ms
        </p>
      )}
    </div>
  )
}
