import type { ThermalLayerSummary } from '../../domain/types'

const LEVEL_BAR = {
  stable: 'bg-signal-green',
  transition: 'bg-signal-yellow',
  alert: 'bg-signal-red',
} as const

interface ThermalProfilePanelProps {
  layers: ThermalLayerSummary[]
  activeLayer: number | null
  onSelectLayer: (layer: number) => void
  loading?: boolean
}

/**
 * Left panel in Alloy Insight. Stays pinned on the selected layer while the
 * melt-pool panel scrubs the frames captured within it.
 */
export function ThermalProfilePanel({
  layers,
  activeLayer,
  onSelectLayer,
  loading,
}: ThermalProfilePanelProps) {
  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Indexing thermal frames…
      </div>
    )
  }

  if (!layers.length) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        No thermal layers
      </div>
    )
  }

  const current = layers.find((l) => l.layer === activeLayer) ?? layers[0]

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-3">
      <div className="flex flex-1 items-center justify-center overflow-hidden rounded-sm bg-steel-950/50">
        <img
          src={current.profileUrl}
          alt={`Layer ${current.layer} temperature profile`}
          className="max-h-44 w-auto object-contain"
          decoding="async"
        />
      </div>

      <div className="flex gap-[3px] overflow-x-auto pb-0.5">
        {layers.map((l) => {
          const active = l.layer === current.layer
          return (
            <button
              key={l.layer}
              type="button"
              onClick={() => onSelectLayer(l.layer)}
              title={`Layer ${l.layer} · z ${l.zMm.toFixed(2)} mm · ${l.frameCount} frames · ${l.meanTempC.toFixed(0)} °C`}
              className={[
                'h-9 w-2.5 shrink-0 rounded-[1px] transition-opacity',
                LEVEL_BAR[l.level],
                active ? 'opacity-100 ring-1 ring-signal-yellow' : 'opacity-45 hover:opacity-80',
              ].join(' ')}
            />
          )
        })}
      </div>

      <p className="font-mono text-[11px] text-steel-500">
        Layer {current.layer} · z {current.zMm.toFixed(2)} mm ·{' '}
        {current.meanTempC.toFixed(0)} °C mean · {current.frameCount} frames
      </p>
    </div>
  )
}
