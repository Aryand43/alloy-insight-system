import { Fragment, type ReactNode } from 'react'

/**
 * Renders an answer's light markup: `**bold**` and `- ` bullets.
 *
 * Built as React elements rather than injected HTML — the text comes from a
 * model, so it is content, not markup, and nothing in it should be able to
 * become an element of its own. Anything beyond bold and bullets is left as
 * plain text, which is also what the assistant is told to produce.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  const pattern = /\*\*([^*]+)\*\*/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(
      <strong key={`${keyPrefix}-b${match.index}`} className="font-semibold text-steel-50">
        {match[1]}
      </strong>,
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function AnswerText({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let bullets: string[] = []

  const flush = (key: string) => {
    if (!bullets.length) return
    blocks.push(
      <ul key={`ul-${key}`} className="ml-4 flex list-disc flex-col gap-1">
        {bullets.map((b, i) => (
          <li key={`${key}-${i}`} className="text-steel-100">
            {inline(b, `${key}-${i}`)}
          </li>
        ))}
      </ul>,
    )
    bullets = []
  }

  lines.forEach((raw, i) => {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      bullets.push(bullet[1])
      return
    }
    flush(String(i))
    if (!line.trim()) return
    blocks.push(
      <p key={`p-${i}`} className="text-steel-100">
        {inline(line, `p-${i}`)}
      </p>,
    )
  })
  flush('end')

  return <div className="flex flex-col gap-2 text-sm leading-relaxed">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
