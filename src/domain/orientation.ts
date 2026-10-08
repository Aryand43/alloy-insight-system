/**
 * Presenting the melt pool with travel running top to bottom.
 *
 * The machine rasters along X, so the camera sees the pool travelling left to
 * right (and right to left on the return pass). Every solidification diagram
 * in the literature — and the ones this analysis follows — draws the pool
 * travelling up the page with the trailing edge below it, so the views are
 * turned to match. Reading melt-pool shape is a trained skill, and a reader
 * should not have to re-orient between the screen and the reference figures.
 *
 * Rotation is by whole quarter turns, never an arbitrary angle: a quarter turn
 * is exact on a pixel grid, so no raster is ever resampled for presentation
 * and no measurement is taken from a resampled image. Everything is measured
 * in the camera's own frame first; this only turns the picture.
 */

/** Quarter turns (clockwise on screen) that bring the travel direction to point down. */
export function quarterTurnsForDown(headingDeg: number): number {
  /*
   * Headings are anticlockwise-from-east with y positive upward, so travelling
   * down the screen is a heading of -90. Each clockwise quarter turn subtracts
   * 90 from the heading, so the turns needed are (heading + 90) / 90: a pool
   * travelling east (heading 0) takes one clockwise turn to travel down the
   * screen, and one travelling west (180) takes three.
   */
  const delta = (((headingDeg + 90) % 360) + 360) % 360
  return Math.round(delta / 90) % 4
}

/** The same rotation as degrees, for CSS or an image request. */
export function quarterTurnDegrees(turns: number): number {
  return (((turns % 4) + 4) % 4) * 90
}

/** Rotates a point about the origin by whole quarter turns, screen-clockwise. */
export function rotateQuarterTurns(x: number, y: number, turns: number): [number, number] {
  switch ((((turns % 4) + 4) % 4)) {
    case 1:
      return [-y, x]
    case 2:
      return [-x, -y]
    case 3:
      return [y, -x]
    default:
      return [x, y]
  }
}

/** Rotates a heading in degrees by whole quarter turns, screen-clockwise. */
export function rotateHeading(headingDeg: number, turns: number): number {
  return headingDeg - quarterTurnDegrees(turns)
}
