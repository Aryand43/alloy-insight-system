import type {
  AnomalyReport,
  BuildBrief,
  LayerFrameAnomalies,
  QueryAnswer,
} from '../../domain/types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Stand-ins for the anomaly endpoints, used when the app runs without the data
 * bridge. Shapes match the server exactly; the numbers are invented and the
 * payloads say so, so a demo in mock mode can never be mistaken for measured
 * output.
 */
const MOCK_NOTE = 'Sample data — the data bridge is not connected.'

export async function mockGetAnomalies(sessionId: string): Promise<AnomalyReport> {
  await delay(120)
  void sessionId
  return {
    buildId: 'sample',
    model: {
      name: 'Steady-state deviation model',
      trainedOn: MOCK_NOTE,
      validation: MOCK_NOTE,
      alertThreshold: 5.9,
      watchThreshold: 3.37,
    },
    transition: { endLayer: 4, startTempC: 1640, endTempC: 1758, endZMm: 2.7 },
    layersAnalysed: 56,
    layersScored: 52,
    anomalies: [
      {
        layer: 5,
        zMm: 3.6,
        score: 6.9,
        severity: 'alert',
        meanTempC: 1785,
        tempDriftPct: -1.8,
        sizeDriftPct: -18.6,
      },
      {
        layer: 6,
        zMm: 4.5,
        score: 5.4,
        severity: 'watch',
        meanTempC: 1782,
        tempDriftPct: -2,
        sizeDriftPct: -18.7,
      },
    ],
    events: [
      {
        onsetLayer: 5,
        endLayer: 6,
        onsetZMm: 3.6,
        peakLayer: 5,
        peakScore: 6.9,
        severity: 'alert',
        summary: "Layers 5-6: 1.8% below the build's steady state, from z 3.6 mm.",
      },
    ],
    flaggedPct: 1.9,
    verdict: 'watch',
  }
}

export async function mockGetBuildBrief(sessionId: string): Promise<BuildBrief> {
  await delay(120)
  void sessionId
  return {
    buildId: 'sample',
    machine: 'DMG MORI LASERTEC 65 3D hybrid',
    material: '316L SS',
    process: 'Laser powder DED (coaxial nozzle)',
    geometry: '60 mm wall · 10-pass · 56 layers × 0.9 mm',
    builtOn: null,
    layersAnalysed: 56,
    monitoringFrames: 21290,
    detectedAnomalies: 1,
    verdict: 'watch',
    transitionEndLayer: 4,
    keyParameters: [{ label: 'Source', value: MOCK_NOTE }],
  }
}

export async function mockGetLayerFrameAnomalies(
  sessionId: string,
  layer: number,
): Promise<LayerFrameAnomalies> {
  await delay(100)
  void sessionId
  const frameCount = 380
  const scores = Array.from({ length: frameCount }, (_, i) =>
    Math.round((2 + Math.abs(Math.sin(i / 23)) * 3.2) * 100) / 100,
  )
  return {
    layer,
    zMm: layer * 0.9,
    frameCount,
    anomalies: [],
    flaggedPct: 0,
    scores,
    alertThreshold: 4.8,
    worst: null,
    note: MOCK_NOTE,
  }
}

export async function mockAskQuestion(
  sessionId: string,
  question: string,
): Promise<QueryAnswer> {
  await delay(400)
  void sessionId
  return {
    question,
    answer:
      'The query assistant needs the data bridge and an API key. Running against sample data, there is nothing real to answer from.',
    contextBuilds: [],
    model: 'none',
  }
}
