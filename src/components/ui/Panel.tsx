import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({ title, actions, className = '', children }: PanelProps) {
  return (
    <section
      className={[
        'panel-surface flex min-h-0 flex-col overflow-hidden rounded-sm',
        className,
      ].join(' ')}
    >
      <header className="flex items-center justify-between gap-3 border-b border-steel-700/40 px-3 py-2">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-steel-400">
          {title}
        </h2>
        {actions}
      </header>
      <div className="relative min-h-0 flex-1 p-3">{children}</div>
    </section>
  )
}
