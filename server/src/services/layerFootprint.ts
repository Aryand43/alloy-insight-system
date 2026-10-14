import type { LayerFootprint, FootprintGap, FrameOutline } from '../../../src/domain/types.js'
import { PIXEL_PITCH_UM, ROI_CENTER_COL, ROI_CENTER_ROW } from '../config.js'
import type { IndexedLayer } from './frameIndex.js'
import { loadFrame, meltPoolMask, type ThresholdChoice } from './thermal.js'

/**
 * Every melt-pool footprint in one layer, laid out in machine coordinates.
 *
 * The camera is coaxial, so each frame shows its own pool sitting at the same
 * place in the image; what differs is where the nozzle was. Putting the
 * frames back on the machine's own axes turns a stack of near-identical
 * pictures into the layer's actual melted footprint, and the question that
 * matters for porosity follows directly: did consecutive passes overlap, or
 * is there a patch between them that never reached melting temperature?
 *
 * Two honest limits travel with the result.
 *
 * This is the surface isotherm, not the bead. The contour is where the metal
 * reached melting temperature, which extends beyond the material actually
 * deposited, so coverage here is generous: a gap is strong evidence of lack
 * of fusion, but the absence of gaps is weaker evidence of soundness.
 *
 * And it is one plane. Nothing here can see whether a layer fused to the one
 * below it; that needs the pool's depth, which a top-down camera does not
 * measure.
 */

const PITCH_MM = PIXEL_PITCH_UM / 1000

/** Coverage grid resolution. 0.1 mm is a third of a camera pixel pitch. */
const CELL_MM = 0.1
/** Points kept per outline; enough to draw a smooth pool at panel size. */
const OUTLINE_POINTS = 56
/** Gaps smaller than this are grid noise rather than a defect worth naming. */
const MIN_GAP_MM2 = 0.04
/** Beyond this, a step between pool centres is a move to the next pass. */
const PASS_JUMP_MM = 10

/**
 * Where a pixel sits on the machine, in mm.
 *
 * Machine +X runs up the image and +Y runs to the left, which is the mapping
 * the thermal tail and the controller's own ROI both point to. The pool sits
 * at the ROI centre in every frame, so a pixel's offset from that centre is
 * its offset from the nozzle.
 */
function pixelToMachine(
  row: number,
  col: number,
  frameX: number,
  frameY: number,
): [number, number] {
  return [
    frameX - (row - ROI_CENTER_ROW) * PITCH_MM,
    frameY - (col - ROI_CENTER_COL) * PITCH_MM,
  ]
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/*
 * Enclosed gaps only mean anything when consecutive pools overlap. A capture
 * that samples frames — the hosted demo ships one frame in three — leaves the
 * pools standing apart, and the bare strip between each pair would otherwise
 * be counted as lack of fusion. Comparing the step between pool centres with
 * the pool's own width tells the two cases apart from the geometry itself,
 * which also catches a thin capture on real data.
 */
function medianStepMm(outlines: FrameOutline[]): number | null {
  const steps: number[] = []
  for (let i = 1; i < outlines.length; i += 1) {
    const dx = outlines[i].centreXMm - outlines[i - 1].centreXMm
    const dy = outlines[i].centreYMm - outlines[i - 1].centreYMm
    const step = Math.sqrt(dx * dx + dy * dy)
    // A jump to the next pass is not a step along one.
    if (step < PASS_JUMP_MM) steps.push(step)
  }
  if (!steps.length) return null
  steps.sort((a, b) => a - b)
  return steps[Math.floor(steps.length / 2)]
}

function medianPoolWidthMm(outlines: FrameOutline[]): number | null {
  const widths = outlines
    .map((o) => {
      const xs = o.points.map((pt) => pt[0])
      const ys = o.points.map((pt) => pt[1])
      return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    })
    .sort((a, b) => a - b)
  if (!widths.length) return null
  return widths[Math.floor(widths.length / 2)]
}

export async function buildLayerFootprint(
  layer: IndexedLayer,
  threshold: ThresholdChoice,
): Promise<LayerFootprint> {
  const outlines: FrameOutline[] = []

  // Coverage is accumulated in machine coordinates; the extent is not known
  // until the frames have been read, so cells are collected first.
  const covered = new Set<string>()
  const key = (ix: number, iy: number) => `${ix}:${iy}`
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let unreadable = 0

  for (const ref of layer.frames) {
    let frame
    try {
      frame = await loadFrame(ref.file)
    } catch {
      unreadable += 1
      continue
    }

    const { width, height } = frame
    const mask = meltPoolMask(frame, threshold.count)

    let n = 0
    let sumRow = 0
    let sumCol = 0
    const edge: [number, number][] = []

    for (let r = 1; r < height - 1; r++) {
      for (let c = 1; c < width - 1; c++) {
        const i = r * width + c
        if (!mask[i]) continue
        n += 1
        sumRow += r
        sumCol += c

        const [mx, my] = pixelToMachine(r, c, ref.xMm, ref.yMm)
        covered.add(key(Math.round(mx / CELL_MM), Math.round(my / CELL_MM)))
        if (mx < minX) minX = mx
        if (mx > maxX) maxX = mx
        if (my < minY) minY = my
        if (my > maxY) maxY = my

        const interior = mask[i - 1] && mask[i + 1] && mask[i - width] && mask[i + width]
        if (!interior) edge.push([r, c])
      }
    }
    if (n < 12 || edge.length < 8) continue

    // Order the edge pixels around the pool so they draw as one outline, then
    // thin them: a pool contour is several hundred pixels and the panel is a
    // few centimetres across.
    const centreRow = sumRow / n
    const centreCol = sumCol / n
    edge.sort(
      (a, b) =>
        Math.atan2(a[0] - centreRow, a[1] - centreCol) -
        Math.atan2(b[0] - centreRow, b[1] - centreCol),
    )
    const step = Math.max(1, Math.floor(edge.length / OUTLINE_POINTS))
    const points: [number, number][] = []
    for (let i = 0; i < edge.length; i += step) {
      const [mx, my] = pixelToMachine(edge[i][0], edge[i][1], ref.xMm, ref.yMm)
      points.push([round(mx, 2), round(my, 2)])
    }

    outlines.push({
      position: ref.position,
      centreXMm: round(ref.xMm, 2),
      centreYMm: round(ref.yMm, 2),
      points,
    })
  }

  /*
   * Gaps only count between the passes, not around the outside of them.
   * Consecutive pools scallop the outer edge of the first and last track, and
   * those notches are the shape of the wall's boundary rather than a defect;
   * requiring a gap to sit inside the area the nozzle centres swept keeps
   * them out of the count.
   */
  const centres = {
    minX: Math.min(...outlines.map((o) => o.centreXMm)),
    maxX: Math.max(...outlines.map((o) => o.centreXMm)),
    minY: Math.min(...outlines.map((o) => o.centreYMm)),
    maxY: Math.max(...outlines.map((o) => o.centreYMm)),
  }
  const allGaps = outlines.length
    ? findGaps(covered, key, minX, maxX, minY, maxY).filter(
        (g) =>
          g.xMm >= centres.minX &&
          g.xMm <= centres.maxX &&
          g.yMm >= centres.minY &&
          g.yMm <= centres.maxY,
      )
    : []
  /*
   * With the pools standing apart, every bare strip between them reads as an
   * enclosed gap. Those are the sampling interval, not the process, so the
   * outlines are still returned — they show the traces either way — and the
   * gap count is withheld rather than reported as porosity candidates.
   */
  const stepMm = medianStepMm(outlines)
  const poolWidthMm = medianPoolWidthMm(outlines)
  const gapsAssessed = stepMm === null || poolWidthMm === null ? false : stepMm <= poolWidthMm
  const reported = gapsAssessed ? allGaps : []
  const gaps = reported.slice(0, 50)
  const coveredAreaMm2 = covered.size * CELL_MM * CELL_MM

  return {
    layer: layer.layer,
    zMm: round(layer.zMm, 2),
    frames: layer.frames.length,
    framesUsed: outlines.length,
    framesUnreadable: unreadable,
    thresholdC: threshold.celsius,
    thresholdSource: threshold.source,
    bounds: outlines.length
      ? {
          minXMm: round(minX, 2),
          maxXMm: round(maxX, 2),
          minYMm: round(minY, 2),
          maxYMm: round(maxY, 2),
        }
      : { minXMm: 0, maxXMm: 0, minYMm: 0, maxYMm: 0 },
    outlines,
    gaps,
    gapCount: reported.length,
    gapsAssessed,
    stepMm: stepMm === null ? null : round(stepMm, 2),
    poolWidthMm: poolWidthMm === null ? null : round(poolWidthMm, 2),
    coveredAreaMm2: round(coveredAreaMm2, 2),
    gapAreaMm2: round(
      reported.reduce((sum, g) => sum + g.areaMm2, 0),
      3,
    ),
    cellMm: CELL_MM,
  }
}

/**
 * Uncovered patches that the melted area closes around.
 *
 * The ragged outer edge of a layer is not a defect, so only enclosed holes
 * count: everything reachable from outside the footprint is flooded first and
 * what remains uncovered is, by definition, surrounded by metal that melted.
 */
function findGaps(
  covered: Set<string>,
  key: (ix: number, iy: number) => string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
): FootprintGap[] {
  // One cell of margin so the flood always has somewhere to start.
  const x0 = Math.round(minX / CELL_MM) - 1
  const x1 = Math.round(maxX / CELL_MM) + 1
  const y0 = Math.round(minY / CELL_MM) - 1
  const y1 = Math.round(maxY / CELL_MM) + 1
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  if (w <= 2 || h <= 2 || w * h > 4_000_000) return []

  const OUTSIDE = 1
  const state = new Uint8Array(w * h)
  const at = (ix: number, iy: number) => (iy - y0) * w + (ix - x0)

  const stack: number[] = [at(x0, y0)]
  state[at(x0, y0)] = OUTSIDE
  while (stack.length) {
    const index = stack.pop() as number
    const ix = (index % w) + x0
    const iy = Math.floor(index / w) + y0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = ix + dx
      const ny = iy + dy
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
      const n = at(nx, ny)
      if (state[n] || covered.has(key(nx, ny))) continue
      state[n] = OUTSIDE
      stack.push(n)
    }
  }

  // Whatever is neither covered nor reachable from outside is an enclosed hole.
  const gaps: FootprintGap[] = []
  const seen = new Uint8Array(w * h)
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      const index = at(ix, iy)
      if (seen[index] || state[index] === OUTSIDE || covered.has(key(ix, iy))) continue

      let cells = 0
      let sumX = 0
      let sumY = 0
      const component: number[] = [index]
      seen[index] = 1
      while (component.length) {
        const current = component.pop() as number
        const cx = (current % w) + x0
        const cy = Math.floor(current / w) + y0
        cells += 1
        sumX += cx
        sumY += cy
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
          const n = at(nx, ny)
          if (seen[n] || state[n] === OUTSIDE || covered.has(key(nx, ny))) continue
          seen[n] = 1
          component.push(n)
        }
      }

      const areaMm2 = cells * CELL_MM * CELL_MM
      if (areaMm2 < MIN_GAP_MM2) continue
      gaps.push({
        xMm: round((sumX / cells) * CELL_MM, 2),
        yMm: round((sumY / cells) * CELL_MM, 2),
        areaMm2: round(areaMm2, 3),
      })
    }
  }
  return gaps.sort((a, b) => b.areaMm2 - a.areaMm2)
}
