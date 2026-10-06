import type { BuildBrief } from '../../domain/types'

interface BuildBriefStripProps {
  brief: BuildBrief | null
  loading?: boolean
}

function Item({
  label,
  value,
  title,
  mono,
}: {
  label: string
  value: string
  title?: string
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={title}>
      <span className="text-xs uppercase tracking-[0.08em] text-steel-400">{label}</span>
      <span className={`truncate text-xs ${mono ? 'font-mono text-steel-100' : 'text-steel-100'}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * What was built and what the analysis covered, shown once the build loads.
 *
 * Deliberately factual: machine, material, geometry and date come from the
 * run's own header and the build id, and the counts are what was actually
 * scored. Builds with no run log say so rather than borrowing another build's
 * parameters.
 */
export function BuildBriefStrip({ brief, loading }: BuildBriefStripProps) {
  if (loading || !brief) {
    return (
      <div className="rounded-sm border border-steel-700/30 bg-steel-900/30 px-3 py-2 text-xs text-steel-400">
        {loading ? 'Reading build record…' : 'No build record available.'}
      </div>
    )
  }

  return (
    <div className="rounded-sm border border-steel-700/30 bg-steel-900/30 px-3 py-2.5">
      <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Item label="Machine" value={brief.machine} title="From the machine documentation; the run header logs only a serial" />
        <Item label="Material" value={brief.material} />
        <Item label="Process" value={brief.process} />
        <Item label="Built" value={brief.builtOn ?? 'not recorded'} />
        <Item
          label="Layers analysed"
          value={`${brief.layersAnalysed} (${brief.transitionEndLayer} ramp-up)`}
          mono
          title="Layers in the build, and how many of them are the ramp-up region excluded from scoring"
        />
        <Item
          label="Monitoring frames"
          value={
            brief.monitoringFrames
              ? brief.monitoringFrames.toLocaleString()
              : 'none for this build'
          }
          mono
          title="Thermal camera frames matched to a layer"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-steel-700/30 pt-2 text-xs">
        <span className="text-steel-300">{brief.geometry}</span>
        {brief.keyParameters.map((p) => (
          <span key={p.label} className="text-steel-400">
            {p.label} <span className="font-mono text-steel-200">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
