import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * The unit the analysis grid is built from.
 *
 * A quiet header strip carries the title as a tracked micro-label, so panels
 * read as instrument modules in one rack rather than as separate cards: the
 * eye lands on the data, and the titles are there when it needs to orient.
 */
export function Panel({ title, actions, className = '', children }: PanelProps) {
  return (
    <section
      className={[
        /*
         * min-w-0 matters: as a grid item the default is min-width:auto, so a
         * wide child — a layer rail of 80 bars, a filmstrip — stretches the
         * panel past the viewport instead of scrolling inside it. With this,
         * the panel keeps its track and the scrollable strips scroll.
         */
        'panel-surface flex min-h-0 min-w-0 flex-col overflow-hidden rounded-sm',
        className,
      ].join(' ')}
    >
      <header className="panel-head flex items-center justify-between gap-3 px-3 py-2 sm:px-3.5">
        <h2 className="eyebrow truncate text-steel-300">{title}</h2>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </header>
      <div className="relative min-h-0 min-w-0 flex-1 p-3 sm:p-3.5">{children}</div>
    </section>
  )
}
