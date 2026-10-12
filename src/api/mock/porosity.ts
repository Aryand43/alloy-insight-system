import type { PorosityReport } from '../../domain/types'

/** Stand-in so the porosity view renders without the data bridge. */
export async function mockGetPorosity(sessionId: string): Promise<PorosityReport> {
  await new Promise((r) => setTimeout(r, 90))
  void sessionId
  return {
    buildId: 'sample',
    trackSpacingMm: 1.05,
    poolWidthMm: 4.03,
    overlapRatio: 0.739,
    indicators: [
      {
        id: 'overlap',
        label: 'Track overlap',
        value: 73.9,
        unit: '%',
        higherIsWorse: false,
        mechanism: 'Sample data. The data bridge is not connected.',
        validation: 'Sample data. The data bridge is not connected.',
        available: true,
      },
    ],
    layers: Array.from({ length: 12 }, (_, i) => ({
      layer: i + 1,
      zMm: (i + 1) * 0.9,
      undersizedPct: Math.max(0, 40 - i * 4),
      coldPct: Math.max(0, 30 - i * 3),
      deviatingPct: 2,
      worst: null,
    })),
    validationNote: 'Sample data. The data bridge is not connected.',
  }
}
