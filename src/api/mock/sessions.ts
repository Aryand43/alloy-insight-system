import type {
  AnalysisSession,
  ClassifiedVoxel,
  Frame,
  MeshPayload,
  SessionConfig,
  ThresholdOverlay,
  ThresholdStats,
  ThreeColorPayload,
} from '../../domain/types'

function delay(ms = 280): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const sessions = new Map<string, AnalysisSession>()

function uid(): string {
  return `ses_${Math.random().toString(36).slice(2, 10)}`
}

/** Procedural grayscale melt-pool-ish frame as a data URL */
function makeFrameImage(index: number, seed: number): string {
  const size = 160
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const g = ctx.createRadialGradient(
    size * 0.45 + (seed % 5),
    size * 0.48,
    8,
    size * 0.5,
    size * 0.5,
    size * 0.55,
  )
  g.addColorStop(0, `rgb(${220 - index * 8}, ${180 - index * 5}, ${90 + index * 4})`)
  g.addColorStop(0.45, `rgb(${90 + index * 6}, ${95}, ${110})`)
  g.addColorStop(1, '#1a222c')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)

  // noise speckles
  for (let i = 0; i < 80; i++) {
    const x = (seed * 17 + i * 31 + index * 13) % size
    const y = (seed * 11 + i * 19 + index * 7) % size
    ctx.fillStyle = `rgba(200,210,220,${0.05 + (i % 5) * 0.02})`
    ctx.fillRect(x, y, 1.5, 1.5)
  }

  // melt pool ellipse
  ctx.beginPath()
  ctx.ellipse(size * 0.5, size * 0.5, 28 + index, 18 + (index % 3), 0.2, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(232, 184, 74, 0.55)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  return canvas.toDataURL('image/png')
}

export async function mockCreateSession(
  config: SessionConfig,
): Promise<AnalysisSession> {
  await delay()
  const session: AnalysisSession = {
    id: uid(),
    config,
    status: 'ready',
    createdAt: new Date().toISOString(),
  }
  sessions.set(session.id, session)
  return session
}

export async function mockGetSession(id: string): Promise<AnalysisSession> {
  await delay(120)
  const existing = sessions.get(id)
  if (existing) return existing

  // Allow deep-link / refresh with synthetic session from id
  const fallback: AnalysisSession = {
    id,
    config: {
      materialId: '316l-ss',
      materialLabel: '316L SS',
      processType: 'laser_powder_bed_fusion',
      meltingTempC: 1450,
      dataSourceName: 'demo_sequence.zip',
      configName: 'default_preset.json',
    },
    status: 'ready',
    createdAt: new Date().toISOString(),
  }
  sessions.set(id, fallback)
  return fallback
}

export async function mockGetFrames(sessionId: string): Promise<Frame[]> {
  await delay(200)
  void sessionId
  const seed = 42
  return Array.from({ length: 6 }, (_, index) => ({
    id: `frame_${index}`,
    index,
    label: `Frame ${String(index + 1).padStart(3, '0')}`,
    imageUrl: makeFrameImage(index, seed),
    timestampMs: index * 120,
  }))
}

export async function mockGetThreshold(
  sessionId: string,
  frameId: string,
): Promise<ThresholdOverlay> {
  await delay(100)
  void sessionId
  const n = Number(frameId.replace(/\D/g, '')) || 0
  return {
    frameId,
    width: 320,
    height: 240,
    redFraction: 0.22 + n * 0.03,
    blueFraction: 0.35 - n * 0.02,
    contours: [
      {
        id: 'red-core',
        channel: 'red',
        cx: 150 + n * 4,
        cy: 110,
        rx: 42 + n * 2,
        ry: 28,
        opacity: 0.55,
      },
      {
        id: 'blue-halo',
        channel: 'blue',
        cx: 168,
        cy: 122,
        rx: 72,
        ry: 48 + n,
        opacity: 0.35,
      },
      {
        id: 'blue-rim',
        channel: 'blue',
        cx: 140,
        cy: 100,
        rx: 55,
        ry: 40,
        opacity: 0.25,
      },
    ],
  }
}

function boxMesh(
  w: number,
  h: number,
  d: number,
  color: string,
): MeshPayload {
  // Unit box scaled — 8 corners of a box centered at origin
  const hw = w / 2
  const hh = h / 2
  const hd = d / 2
  const vertices = [
    { x: -hw, y: -hh, z: -hd },
    { x: hw, y: -hh, z: -hd },
    { x: hw, y: hh, z: -hd },
    { x: -hw, y: hh, z: -hd },
    { x: -hw, y: -hh, z: hd },
    { x: hw, y: -hh, z: hd },
    { x: hw, y: hh, z: hd },
    { x: -hw, y: hh, z: hd },
  ]
  const indices = [
    0, 1, 2, 0, 2, 3, // front
    4, 6, 5, 4, 7, 6, // back
    0, 4, 5, 0, 5, 1, // bottom
    2, 6, 7, 2, 7, 3, // top
    0, 3, 7, 0, 7, 4, // left
    1, 5, 6, 1, 6, 2, // right
  ]
  return { vertices, indices, color }
}

export async function mockGetReconstruction(
  sessionId: string,
): Promise<MeshPayload> {
  await delay(220)
  void sessionId
  return boxMesh(2.2, 1.4, 1.8, '#7a8a9a')
}

export async function mockGetThreeColor(
  sessionId: string,
): Promise<ThreeColorPayload> {
  await delay(220)
  void sessionId
  const voxels: ClassifiedVoxel[] = []
  const classes = ['red', 'blue', 'green'] as const
  for (let ix = 0; ix < 6; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      for (let iz = 0; iz < 5; iz++) {
        // Prefer green in a callout band (notebook callout)
        let cls: (typeof classes)[number]
        if (ix >= 3 && iy >= 1 && iy <= 2 && iz >= 1) {
          cls = 'green'
        } else if ((ix + iy + iz) % 3 === 0) {
          cls = 'red'
        } else {
          cls = 'blue'
        }
        voxels.push({
          x: ix * 0.38 - 1.0,
          y: iy * 0.38 - 0.6,
          z: iz * 0.38 - 0.8,
          size: 0.32,
          class: cls,
        })
      }
    }
  }
  return {
    voxels,
    bounds: { width: 2.4, height: 1.6, depth: 2.0 },
  }
}

export async function mockGetStats(sessionId: string): Promise<ThresholdStats> {
  await delay(100)
  void sessionId
  const stablePct = 48
  const transitionPct = 34
  const alertPct = 18
  let level: ThresholdStats['level'] = 'stable'
  if (alertPct >= 25) level = 'alert'
  else if (transitionPct + alertPct >= 30) level = 'transition'
  return {
    stablePct,
    transitionPct,
    alertPct,
    level,
    stableThreshold: 10,
    transitionThreshold: 30,
  }
}
