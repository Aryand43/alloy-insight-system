import { ramp, rgbToCss, TEMP_MAX_C, TEMP_MIN_C } from '../../domain/thermalColor'

interface ThermalColorBarProps {
  domainC?: [number, number]
  /** Authoritative, from the run header. */
  meltThresholdC: number
  /** An assumption pending domain review; drawn dashed. */
  transitionC?: number
  className?: string
}

const SAMPLES = 24

/**
 * The °C scale for the thermal views.
 *
 * The gradient is sampled from the same `ramp()` the server PNGs and the WebGL
 * surfaces use, so it cannot drift from what it is describing.
 */
export function ThermalColorBar({
  domainC = [TEMP_MIN_C, TEMP_MAX_C],
  meltThresholdC,
  transitionC,
  className = '',
}: ThermalColorBarProps) {
  const [min, max] = domainC
  const span = max - min || 1

  const stops = Array.from({ length: SAMPLES }, (_, i) => {
    const t = i / (SAMPLES - 1)
    return `${rgbToCss(ramp(t))} ${(t * 100).toFixed(1)}%`
  }).join(', ')

  const pct = (c: number) => ((c - min) / span) * 100

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="relative h-2 w-full rounded-sm">
        <div
          className="absolute inset-0 rounded-sm"
          style={{ backgroundImage: `linear-gradient(to right, ${stops})` }}
        />
        <div
          className="absolute top-[-2px] bottom-[-2px] w-px bg-steel-50"
          style={{ left: `${pct(meltThresholdC)}%` }}
          title={`${meltThresholdC.toFixed(0)} °C — melt threshold, from the machine log`}
        />
        {transitionC !== undefined && (
          <div
            className="absolute top-[-2px] bottom-[-2px] w-px"
            style={{
              left: `${pct(transitionC)}%`,
              backgroundImage:
                'repeating-linear-gradient(to bottom, #c5d0db 0 2px, transparent 2px 4px)',
            }}
            title={`${transitionC.toFixed(0)} °C — assumed lower band edge, pending review`}
          />
        )}
      </div>
      <div className="flex justify-between gap-2 text-xs text-steel-400">
        <span className="font-mono">{min.toFixed(0)} °C</span>
        <span>
          Melt threshold{' '}
          <span className="font-mono text-steel-200">{meltThresholdC.toFixed(0)} °C</span>
        </span>
        <span title="Pixels at this value have saturated the camera">
          <span className="font-mono">≥ {max.toFixed(0)} °C</span>{' '}
          (sensor limit)
        </span>
      </div>
    </div>
  )
}
