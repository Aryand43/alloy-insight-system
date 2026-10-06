import { useState } from 'react'
import { askQuestion } from '../../api/anomaly'
import { userMessage } from '../../api/errors'
import type { QueryAnswer } from '../../domain/types'
import { Button } from '../ui/Button'

/** Starting points that the build data can actually answer. */
const EXAMPLES = [
  'At what height does the temperature start to fluctuate?',
  'Which builds drift most after the ramp-up?',
  'What could have caused the deviation in this build?',
]

interface QueryPanelProps {
  sessionId: string
  buildId: string
}

/**
 * Natural-language questions about the loaded build and the other 25.
 *
 * The model is given a JSON brief assembled from the same endpoints this page
 * reads — never the raw corpus — and is told to answer only from it. Answers
 * are therefore checkable against what is on screen, which is the point: an
 * assistant that cannot be checked is not useful on a shop floor.
 */
export function QueryPanel({ sessionId, buildId }: QueryPanelProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<QueryAnswer | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking) return
    setAsking(true)
    setError(null)
    try {
      setAnswer(await askQuestion(sessionId, trimmed))
    } catch (err) {
      setAnswer(null)
      setError(
        userMessage(err, 'The query assistant could not be reached. Try again in a moment.'),
      )
    } finally {
      setAsking(false)
    }
  }

  return (
    <section className="rounded-sm border border-steel-700/30 bg-steel-900/30 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium text-steel-100">Ask about this data</h2>
        <span className="text-xs text-steel-400">
          Grounded in {buildId} and the other 25 builds — layer profiles, flagged layers and
          measured geometry
        </span>
      </div>

      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. at what height does the temperature start to fluctuate?"
          maxLength={600}
          aria-label="Question about this build"
          className="min-w-0 flex-1 rounded-sm border border-steel-600/60 bg-steel-950/60 px-2.5 py-2 text-sm text-steel-100 placeholder:text-steel-500 focus:border-signal-yellow/50 focus:outline-none"
        />
        <Button type="submit" disabled={asking || !question.trim()} className="py-2 text-sm">
          {asking ? 'Asking…' : 'Ask'}
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={asking}
            onClick={() => {
              setQuestion(example)
              void ask(example)
            }}
            className="rounded-sm border border-steel-700/50 px-2 py-1 text-xs text-steel-300 hover:border-steel-500 hover:text-steel-100 disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-xs text-signal-red-text">{error}</p>}

      {answer && (
        <div className="mt-2.5 border-t border-steel-700/30 pt-2.5">
          <p className="text-xs text-steel-400">{answer.question}</p>
          {/* Model output is rendered as plain text — never as markup. */}
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-steel-100">
            {answer.answer}
          </p>
          <p className="mt-1.5 text-xs text-steel-500">
            Answered by {answer.model} from the build data on this page. Check anything you act on
            against the charts.
          </p>
        </div>
      )}
    </section>
  )
}
