import type { BoundaryPoint, MeltPoolPhysics } from '../../domain/types'

/**
 * A synthetic elliptical pool, so the physics panels render without the data
 * bridge. The shape and the trailing/leading split are right; the values are
 * invented.
 */
export async function mockGetPhysics(
  layer: number,
  position: number,
): Promise<MeltPoolPhysics> {
  await new Promise((r) => setTimeout(r, 80))
  const speed = 16.7
  const points: BoundaryPoint[] = []
  for (let i = 0; i < 240; i++) {
    const angle = (i / 240) * Math.PI * 2
    const x = Math.cos(angle) * 1.9
    const y = Math.sin(angle) * 1.65
    const cosTheta = Math.cos(angle)
    const trailing = cosTheta < 0
    points.push({
      xMm: Math.round(x * 1000) / 1000,
      yMm: Math.round(y * 1000) / 1000,
      gradientCPerMm: Math.round(900 + Math.cos(angle * 2) * 400),
      thetaDeg: Math.round((Math.acos(cosTheta) * 180) / Math.PI),
      solidificationMmPerS: trailing
        ? Math.round(speed * Math.abs(cosTheta) * 1000) / 1000
        : null,
      trailing,
    })
  }
  return {
    layer,
    position,
    thresholdC: 1560,
    thresholdSource: 'machine',
    points,
    travel: { headingDeg: 0, speedMmPerS: speed, speedSource: 'measured' },
    summary: {
      boundaryPoints: points.length,
      trailingPoints: points.filter((p) => p.trailing).length,
      gradientMedianCPerMm: 900,
      gradientP10CPerMm: 520,
      gradientP90CPerMm: 1300,
      gradientNegativePct: 0,
      gradientWindowMm: 0.089,
      gradientSamples: 4,
      solidificationMedianMmPerS: 11.8,
      solidificationMaxMmPerS: speed,
      gOverR: 76,
      coolingRateCPerS: 10620,
    },
  }
}
