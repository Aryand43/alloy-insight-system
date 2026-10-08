import type { AnomalySeverity, Frame } from '../../domain/types'
import { ProfileChart } from './ProfileChart'

interface RawImagesPanelProps {
  frames: Frame[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  /** Flagged layers, for the chart's click targets and tooltips. */
  flagged?: Map<number, AnomalySeverity>
  /** Layers up to here are the ramp-up, shown but never flagged. */
  transitionEndLayer?: number
}

function describe(frame: Frame): string {
  if (frame.zMm !== undefined) return `${frame.label} · z ${frame.zMm.toFixed(2)} mm`
  return `${frame.label} · ${frame.timestampMs} ms`
}

/**
 * Process Insight's left panel: the layer profile, with this layer marked.
 *
 * Clicking a point on the chart selects that layer, which is the quickest way
 * to get from a flagged point on the trend to the layer behind it; the strip
 * below steps layer by layer.
 */
export function RawImagesPanel({
  frames,
  selectedId,
  onSelect,
  loading,
  flagged,
  transitionEndLayer = 0,
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
      <div className="relative">
        {selected && (
          <ProfileChart
            src={selected.imageUrl}
            alt={describe(selected)}
            layerCount={frames.length}
            activeLayer={selected.layer ?? null}
            onSelectLayer={(layer) => onSelect(`L${layer}`)}
            flagged={flagged}
            describeLayer={(layer) => {
              const frame = frames.find((f) => f.layer === layer)
              const severity = flagged?.get(layer)
              return [
                `Layer ${layer}`,
                frame?.zMm !== undefined ? `z ${frame.zMm.toFixed(2)} mm` : null,
                layer <= transitionEndLayer ? 'ramp-up, not scored' : null,
                severity ? `flagged (${severity})` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            }}
          />
        )}
        {selected?.measured === false && (
          <span
            className="pointer-events-none absolute right-2 top-2 rounded-sm border border-[color:var(--border-hairline)] bg-steel-950/88 px-2 py-0.5 text-xs text-steel-300 backdrop-blur-[2px]"
            title="The corpus stores one mean per layer, so this chart is drawn from the per-layer mean temperatures"
          >
            Chart from layer means
          </span>
        )}
      </div>
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
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
                'focus-ring shrink-0 overflow-hidden rounded-sm border transition-colors duration-100',
                active
                  ? 'border-accent-400/70 ring-1 ring-accent-400/35'
                  : 'border-[color:var(--border-hairline)] hover:border-[color:var(--border-control-hover)]',
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
