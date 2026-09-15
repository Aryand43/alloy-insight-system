import type { Frame } from '../../domain/types'

interface RawImagesPanelProps {
  frames: Frame[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
}

function describe(frame: Frame): string {
  if (frame.zMm !== undefined) return `${frame.label} · z ${frame.zMm.toFixed(2)} mm`
  return `${frame.label} · ${frame.timestampMs} ms`
}

/**
 * Process Insight's left panel: one chart per layer. Builds with histogram
 * images show the measured distribution; the rest show a chart drawn from the
 * per-layer means, and say so.
 */
export function RawImagesPanel({
  frames,
  selectedId,
  onSelect,
  loading,
}: RawImagesPanelProps) {
  const selected = frames.find((f) => f.id === selectedId) ?? frames[0]

  if (loading || !frames.length) {
    return (
      <div className="viz-primary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Loading layer charts…' : 'No layer charts available for this build.'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="viz-primary relative overflow-hidden rounded-sm bg-steel-950/50">
        {selected && (
          <img
            src={selected.imageUrl}
            alt={describe(selected)}
            className="absolute inset-0 h-full w-full object-contain"
            decoding="async"
          />
        )}
        {selected?.measured === false && (
          <span
            className="absolute right-2 top-2 rounded-sm border border-steel-600/50 bg-steel-950/85 px-2 py-0.5 text-xs text-steel-300"
            title="No histogram images exist for this build — this chart is drawn from the per-layer mean temperatures"
          >
            Chart from layer means
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
              title={describe(frame)}
              aria-label={`Show ${frame.label}`}
              aria-pressed={active}
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
                alt=""
                className="h-12 w-12 object-cover"
                loading="lazy"
                decoding="async"
              />
            </button>
          )
        })}
      </div>
      {selected && (
        <p className="text-xs text-steel-400">
          {selected.label}
          {selected.zMm !== undefined && (
            <>
              {' '}· z <span className="font-mono text-steel-200">{selected.zMm.toFixed(2)} mm</span>
            </>
          )}
          {selected.measured === true && ' · measured histogram'}
          {selected.measured === false && ' · from layer means'}
        </p>
      )}
    </div>
  )
}
