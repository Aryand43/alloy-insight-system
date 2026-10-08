import { useEffect, useRef, useState } from 'react'
import { askQuestion, type QueryTurn } from '../../api/anomaly'
import { userMessage } from '../../api/errors'
import { AnswerText } from './AnswerText'
import { Button } from '../ui/Button'

/** Starting points that the build data can actually answer. */
const EXAMPLES = [
  'At what height does the temperature start to fluctuate?',
  'Which builds drift most after the ramp-up?',
  'How do the process parameters differ between the best and worst coupons?',
]

interface QueryPanelProps {
  sessionId: string
  buildId: string
}

/**
 * Natural-language questions about the loaded build and the other 25.
 *
 * A conversation rather than one-shot answers: the useful questions are
 * follow-ups ("why?", "what about the 7-pass ones?"), and the model keeps the
 * same grounding across the thread because the data brief rides in the system
 * prompt rather than in the turns.
 *
 * The brief is assembled from the same endpoints this page reads — never the
 * raw corpus — so answers stay checkable against what is on screen.
 */
export function QueryPanel({ sessionId, buildId }: QueryPanelProps) {
  const [question, setQuestion] = useState('')
  const [turns, setTurns] = useState<QueryTurn[]>([])
  const [model, setModel] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  // A new build is a new conversation; carrying turns across would ground the
  // follow-ups in a brief that no longer applies.
  useEffect(() => {
    setTurns([])
    setError(null)
  }, [sessionId])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns, asking])

  async function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed || asking) return

    const history = turns
    setTurns([...history, { role: 'user', content: trimmed }])
    setQuestion('')
    setAsking(true)
    setError(null)
    try {
      const answer = await askQuestion(sessionId, trimmed, history)
      setModel(answer.model)
      setTurns((current) => [...current, { role: 'assistant', content: answer.answer }])
    } catch (err) {
      // Drop the unanswered question rather than leaving it hanging in the thread.
      setTurns(history)
      setError(
        userMessage(err, 'The query assistant could not be reached. Try again in a moment.'),
      )
    } finally {
      setAsking(false)
    }
  }

  return (
    <section className="surface-sunken rounded-sm px-3 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="eyebrow text-steel-300">Ask about this data</h2>
        <span className="text-xs text-steel-500">
          Grounded in {buildId} and the other 25 builds: layer profiles, flagged layers, process
          parameters and measured geometry
        </span>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => setTurns([])}
            className="focus-ring ml-auto text-xs text-steel-400 underline decoration-dotted underline-offset-2 transition-colors hover:text-steel-200"
          >
            Clear thread
          </button>
        )}
      </div>

      {turns.length > 0 && (
        <div
          ref={threadRef}
          className="mt-3 flex max-h-96 flex-col gap-3 overflow-y-auto border-t border-[color:var(--border-hairline)] pt-3 pr-1"
        >
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <p
                key={i}
                className="border-l-2 border-accent-600/60 pl-2.5 text-xs font-medium text-steel-300"
              >
                {turn.content}
              </p>
            ) : (
              <AnswerText key={i} text={turn.content} />
            ),
          )}
          {asking && <p className="text-xs text-steel-400">Thinking…</p>}
        </div>
      )}

      <form
        className="mt-2.5 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void ask(question)
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={
            turns.length
              ? 'Ask a follow-up…'
              : 'e.g. at what height does the temperature start to fluctuate?'
          }
          maxLength={600}
          aria-label="Question about this build"
          className="ctl min-w-0 flex-1 px-2.5 py-2 text-sm placeholder:text-steel-500"
        />
        <Button type="submit" disabled={asking || !question.trim()} className="py-2 text-sm">
          {asking ? 'Asking…' : turns.length ? 'Send' : 'Ask'}
        </Button>
      </form>

      {turns.length === 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              disabled={asking}
              onClick={() => void ask(example)}
              className="focus-ring rounded-sm border border-[color:var(--border-hairline)] bg-steel-900/40 px-2 py-1 text-xs text-steel-300 transition-colors hover:border-[color:var(--border-control-hover)] hover:text-steel-100 disabled:opacity-45"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-signal-red-text">{error}</p>}

      {model && (
        <p className="mt-2 text-xs text-steel-500">
          Answered by {model} from the build data on this page. Check anything you act on against
          the charts.
        </p>
      )}
    </section>
  )
}
