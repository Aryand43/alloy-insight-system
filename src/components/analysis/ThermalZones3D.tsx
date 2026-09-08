import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Calibration, ThermalField } from '../../api/thermalField'

/**
 * Three MEASURED temperature bands of the current frame.
 *
 * These are thermal zones, not microstructure. There are no micrographs in the
 * corpus to validate against, and at 29.7 µm/px the camera cannot resolve
 * grains, so nothing here is named after a grain morphology.
 */
export type Zone = 'molten' | 'transition' | 'below'

const ZONE_COLOR: Record<Zone, string> = {
  molten: '#bd0026',
  transition: '#fd8d3c',
  below: '#fed976',
}

const ZONE_LABEL: Record<Zone, string> = {
  molten: 'Molten',
  transition: 'Transition',
  below: 'Below',
}

const ZONES: Zone[] = ['molten', 'transition', 'below']

/** Cell size in source pixels. 8 gives ~28x21 cells over a 218x164 frame. */
const CELL = 8
const SPAN = 2.6
const MAX_HEIGHT = 1.4

interface Cell {
  x: number
  z: number
  height: number
  zone: Zone
}

function ZoneInstances({
  cells,
  zone,
  cellW,
  cellD,
}: {
  cells: Cell[]
  zone: Zone
  cellW: number
  cellD: number
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const scale = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    cells.forEach((c, i) => {
      scale.set(cellW * 0.88, Math.max(c.height, 0.02), cellD * 0.88)
      pos.set(c.x, Math.max(c.height, 0.02) / 2, c.z)
      m.compose(pos, quat, scale)
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [cells, cellW, cellD])

  if (!cells.length) return null

  return (
    <instancedMesh key={cells.length} ref={ref} args={[undefined, undefined, cells.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={ZONE_COLOR[zone]}
        metalness={0.1}
        roughness={0.6}
        transparent={zone === 'below'}
        opacity={zone === 'below' ? 0.4 : 1}
      />
    </instancedMesh>
  )
}

interface ThermalZones3DProps {
  field: ThermalField | null
  calibration: Calibration | null
  /** Authoritative raw-count threshold the controller used for this frame. */
  thresholdCount: number
  meltThresholdC: number
  /** Assumed lower band edge, pending domain review. */
  transitionC: number
  loading?: boolean
  error?: string | null
}

export function ThermalZones3D({
  field,
  calibration,
  thresholdCount,
  meltThresholdC,
  transitionC,
  loading,
  error,
}: ThermalZones3DProps) {
  const built = useMemo(() => {
    if (!field || !calibration) return null
    const { width, height, counts } = field
    const { celsius } = calibration

    const cols = Math.ceil(width / CELL)
    const rows = Math.ceil(height / CELL)
    const cellW = SPAN / cols
    const cellD = (SPAN * (height / width)) / rows

    const byZone: Record<Zone, Cell[]> = { molten: [], transition: [], below: [] }
    const totals: Record<Zone, number> = { molten: 0, transition: 0, below: 0 }

    for (let cr = 0; cr < rows; cr++) {
      for (let cc = 0; cc < cols; cc++) {
        let molten = 0
        let transition = 0
        let below = 0

        for (let r = cr * CELL; r < Math.min((cr + 1) * CELL, height); r++) {
          for (let c = cc * CELL; c < Math.min((cc + 1) * CELL, width); c++) {
            const count = counts[r * width + c]
            // The molten test uses the machine's own raw-count rule, not a °C
            // comparison, so it selects exactly the pixels the controller did.
            if (count > thresholdCount) molten += 1
            else if (celsius[count] >= transitionC) transition += 1
            else below += 1
          }
        }

        const n = molten + transition + below || 1
        totals.molten += molten
        totals.transition += transition
        totals.below += below

        const zone: Zone =
          molten >= transition && molten >= below
            ? 'molten'
            : transition >= below
              ? 'transition'
              : 'below'

        // Height carries sub-cell melt coverage — what this panel adds over the
        // continuous surface next to it.
        const moltenFraction = molten / n
        const base = zone === 'below' ? 0.08 : zone === 'transition' ? 0.28 : 0.35
        const h = base + moltenFraction * (MAX_HEIGHT - base)

        byZone[zone].push({
          x: (cc + 0.5) * cellW - SPAN / 2,
          z: (cr + 0.5) * cellD - (SPAN * (height / width)) / 2,
          height: h,
          zone,
        })
      }
    }

    const grand = totals.molten + totals.transition + totals.below || 1
    return {
      byZone,
      cellW,
      cellD,
      pct: {
        molten: Math.round((totals.molten / grand) * 100),
        transition: Math.round((totals.transition / grand) * 100),
        below: Math.round((totals.below / grand) * 100),
      },
    }
  }, [field, calibration, thresholdCount, transitionC])

  if (error) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-center text-xs text-signal-red">
        {error}
      </div>
    )
  }
  if (!built) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        {loading ? 'Classifying thermal zones…' : 'No thermal field'}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="flex-1 overflow-hidden rounded-sm bg-steel-950/50">
        <Canvas
          camera={{ position: [3.4, 2.6, 3.4], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[5, 6, 3]} intensity={1} />
          {ZONES.map((z) => (
            <ZoneInstances
              key={z}
              zone={z}
              cells={built.byZone[z]}
              cellW={built.cellW}
              cellD={built.cellD}
            />
          ))}
          <OrbitControls enablePan={false} minDistance={2} maxDistance={9} />
        </Canvas>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-steel-300">
        {ZONES.map((z) => (
          <span key={z} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: ZONE_COLOR[z] }}
            />
            {ZONE_LABEL[z]} {built.pct[z]}%
          </span>
        ))}
      </div>
      <p className="font-mono text-[10px] text-steel-500">
        molten &gt; {meltThresholdC.toFixed(0)} °C (machine) · transition ≥{' '}
        {transitionC.toFixed(0)} °C (assumed) · measured bands, not microstructure
      </p>
    </div>
  )
}
