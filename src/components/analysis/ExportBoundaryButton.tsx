import { useEffect, useRef, useState } from 'react'
import type { MeltPoolPhysics } from '../../domain/types'
import {
  boundaryCsv,
  boundaryCsvFilename,
  type BoundaryCsvContext,
} from '../../domain/boundaryCsv'
import { Button } from '../ui/Button'

interface ExportBoundaryButtonProps {
  physics: MeltPoolPhysics | null
  context: BoundaryCsvContext | null
}

/**
 * Downloads the frame's boundary curve as CSV.
 *
 * Built in the browser from the measurements already on screen, so the file
 * is exactly what the panels are showing rather than a second computation
 * that could drift from it.
 */
export function ExportBoundaryButton({ physics, context }: ExportBoundaryButtonProps) {
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const ready = Boolean(physics?.points.length && context)

  function download() {
    if (!physics || !context) return
    const blob = new Blob([boundaryCsv(physics, context)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = boundaryCsvFilename(context)
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Freed on the next tick; revoking immediately cancels the download in
    // some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)

    setSaved(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Button
      variant="ghost"
      className="px-2 py-1 text-xs"
      onClick={download}
      disabled={!ready}
      title={
        ready
          ? `Download ${physics?.points.length} boundary points as CSV: x, y, G, R`
          : 'No boundary measured in this frame'
      }
    >
      {saved ? 'Saved' : 'Export CSV'}
    </Button>
  )
}
