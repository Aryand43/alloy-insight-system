import type {
  ThermalFrameStats,
  ThermalFrameWindow,
  ThermalLayerIndex,
} from '../../domain/types'

/**
 * Demo-mode stand-in so the Alloy Insight flow renders without the data
 * bridge. The frames are drawn, not measured.
 */
const LAYERS = 12
const FRAMES_PER_LAYER = 40
const SIZE = 160

function delay(ms = 160): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function syntheticFrame(layer: number, position: number, overlay: boolean): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#000004'
  ctx.fillRect(0, 0, SIZE, SIZE)

  const cx = SIZE / 2 + Math.sin(position / 5) * 12
  const cy = SIZE / 2 + Math.cos(position / 7) * 8
  const r = 34 + layer * 0.6 + Math.sin(position / 3) * 4

  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r * 1.6)
  g.addColorStop(0, '#fcffa4')
  g.addColorStop(0.3, '#fb9b06')
  g.addColorStop(0.55, '#cf4446')
  g.addColorStop(0.8, '#4a0c6b')
  g.addColorStop(1, '#000004')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)

  if (overlay) {
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.78, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(214, 69, 69, 0.55)'
    ctx.fill()
    ctx.strokeStyle = '#ff5c5c'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  return canvas.toDataURL('image/png')
}

export async function mockGetThermalLayers(
  sessionId: string,
): Promise<ThermalLayerIndex> {
  await delay()
  void sessionId
  return {
    buildId: '60106308r3',
    meltThresholdC: 1560,
    tempRangeC: [980, 2008],
    frameSize: { width: SIZE, height: SIZE },
    totalFrames: LAYERS * FRAMES_PER_LAYER,
    matchedFrames: LAYERS * FRAMES_PER_LAYER,
    layers: Array.from({ length: LAYERS }, (_, i) => ({
      layer: i + 1,
      zMm: Number((i * 0.8 + 0.005).toFixed(3)),
      frameCount: FRAMES_PER_LAYER,
      meanTempC: 1640 + i * 14,
      meanSizeMm2: 5.6 + i * 0.35,
      level: i < 2 ? 'alert' : i < 4 ? 'transition' : 'stable',
      profileUrl: syntheticFrame(i + 1, 0, false),
    })),
  }
}

export async function mockGetThermalWindow(
  sessionId: string,
  layer: number,
  offset: number,
  limit: number,
): Promise<ThermalFrameWindow> {
  await delay(90)
  void sessionId
  const start = Math.max(0, Math.min(offset, FRAMES_PER_LAYER - 1))
  const count = Math.min(limit, FRAMES_PER_LAYER - start)
  return {
    layer,
    zMm: Number(((layer - 1) * 0.8 + 0.005).toFixed(3)),
    total: FRAMES_PER_LAYER,
    offset: start,
    limit,
    frames: Array.from({ length: count }, (_, i) => {
      const position = start + i
      return {
        position,
        tMs: position * 98,
        meltpoolSizePx: 9000 + Math.round(Math.sin(position / 3) * 1800),
        meltpoolTempC: 1780 + Math.round(Math.cos(position / 4) * 40),
        imageUrl: syntheticFrame(layer, position, true),
        plainUrl: syntheticFrame(layer, position, false),
      }
    }),
  }
}

export async function mockGetThermalStats(
  sessionId: string,
  layer: number,
  position: number,
): Promise<ThermalFrameStats> {
  await delay(60)
  void sessionId
  void layer
  const logged = 9000 + Math.round(Math.sin(position / 3) * 1800)
  return {
    maskPixels: logged - 40,
    meanTempC: 1782.4,
    maxTempC: 1994.1,
    loggedSizePx: logged,
    loggedTempC: 1780 + Math.round(Math.cos(position / 4) * 40),
    thresholdCount: 497,
    thresholdC: 1560,
  }
}

/** Synthetic calibration: monotonic, same 980-2008 °C range as the real one. */
export async function mockGetCalibration(): Promise<{
  minC: number
  maxC: number
  celsius: number[]
}> {
  await delay(40)
  const celsius: number[] = []
  for (let i = 0; i < 4096; i++) {
    // Mirrors the real curve's shape: steep at the bottom, flattening off.
    celsius.push(Math.round(980 + 1028 * Math.pow(i / 4095, 0.35)))
  }
  return { minC: 980, maxC: 2008, celsius }
}

/** A radial hot spot so the 3D panels have something to render in demo mode. */
export async function mockGetThermalField(
  buildId: string,
  layer: number,
  position: number,
): Promise<{ width: number; height: number; counts: Uint16Array }> {
  await delay(50)
  void buildId
  const width = 109
  const height = 82
  const counts = new Uint16Array(width * height)
  const cx = width / 2 + Math.sin(position / 5) * 6
  const cy = height / 2 + Math.cos(position / 7) * 4
  const radius = 22 + layer * 0.2 + Math.sin(position / 3) * 2

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const d = Math.hypot(c - cx, r - cy) / radius
      const t = Math.exp(-d * d * 1.6)
      counts[r * width + c] = Math.round(t * 4095)
    }
  }
  return { width, height, counts }
}
