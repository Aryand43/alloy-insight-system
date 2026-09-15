import { ApiError } from './client'

/**
 * Turns a failed request into text fit for the screen.
 *
 * Only messages the server deliberately words for users (422 — e.g. an
 * unreadable source frame) pass through. Everything else gets the caller's
 * plain-language fallback, so file paths, stack text and "Failed to fetch"
 * never reach an evaluator.
 */
export function userMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 422 && err.message) return err.message
  return fallback
}
