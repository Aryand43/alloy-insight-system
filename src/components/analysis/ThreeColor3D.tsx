import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type {
  ClassifiedVoxel,
  ColorClass,
  ThreeColorPayload,
} from '../../domain/types'

const CLASS_COLORS: Record<ColorClass, string> = {
  red: '#d64545',
  blue: '#3d7ab5',
  green: '#3d9a6a',
}

const CLASSES: ColorClass[] = ['green', 'red', 'blue']

interface Dims {
  x: number
  y: number
  z: number
}

/**
 * One instanced mesh per colour class.
 *
 * A real build is up to 84 layers x 12 columns, so drawing a separate mesh per
 * voxel would mean ~1000 draw calls per frame. Instancing keeps it at three.
 */
function VoxelInstances({
  voxels,
  dims,
  color,
}: {
  voxels: ClassifiedVoxel[]
  dims: Dims
  color: string
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4()
    voxels.forEach((v, i) => {
      matrix.makeTranslation(v.x, v.y, v.z)
      mesh.setMatrixAt(i, matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [voxels])

  if (!voxels.length) return null

  return (
    <instancedMesh
      // Recreate the buffer when the instance count changes.
      key={voxels.length}
      ref={ref}
      args={[undefined, undefined, voxels.length]}
    >
      <boxGeometry args={[dims.x * 0.92, dims.y * 0.92, dims.z * 0.92]} />
      <meshStandardMaterial
        color={color}
        metalness={0.2}
        roughness={0.55}
        transparent
        opacity={color === CLASS_COLORS.green ? 0.95 : 0.8}
      />
    </instancedMesh>
  )
}

interface ThreeColor3DProps {
  data: ThreeColorPayload | null
  loading?: boolean
}

export function ThreeColor3D({ data, loading }: ThreeColor3DProps) {
  const grouped = useMemo(() => {
    if (!data) return null
    const byClass = new Map<ColorClass, ClassifiedVoxel[]>()
    for (const cls of CLASSES) byClass.set(cls, [])
    for (const v of data.voxels) byClass.get(v.class)?.push(v)

    // Uniform voxel dimensions when the server supplies them; otherwise fall
    // back to the per-voxel cube size the mock adapter uses.
    const first = data.voxels[0]
    const dims: Dims = data.voxelSize ?? {
      x: first?.size ?? 0.3,
      y: first?.size ?? 0.3,
      z: first?.size ?? 0.3,
    }
    return { byClass, dims }
  }, [data])

  if (loading || !data || !grouped) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Loading stability map…' : 'No layer data available for this build.'}
      </div>
    )
  }

  const total = data.voxels.length || 1
  const pct = (cls: ColorClass) =>
    Math.round(((data.counts?.[cls] ?? grouped.byClass.get(cls)?.length ?? 0) / total) * 100)

  return (
    <div className="flex flex-col gap-2">
      <div className="viz-secondary relative overflow-hidden rounded-sm bg-steel-950/50">
        <Canvas
          camera={{ position: [3.4, 2.6, 3.4], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 2]} intensity={1} />
          {CLASSES.map((cls) => (
            <VoxelInstances
              key={cls}
              voxels={grouped.byClass.get(cls) ?? []}
              dims={grouped.dims}
              color={CLASS_COLORS[cls]}
            />
          ))}
          <OrbitControls enablePan={false} minDistance={2} maxDistance={9} />
        </Canvas>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steel-300">
        <span className="inline-flex items-center gap-1.5" title="Temperature and size both within their stable bands">
          <span aria-hidden className="h-2 w-2 rounded-full bg-signal-green" /> Stable{' '}
          <span className="font-mono text-steel-200">{pct('green')}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5" title="Running hot or oversized">
          <span aria-hidden className="h-2 w-2 rounded-full bg-signal-red" /> Hotter or larger{' '}
          <span className="font-mono text-steel-200">{pct('red')}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5" title="Running cold or undersized">
          <span aria-hidden className="h-2 w-2 rounded-full bg-signal-blue" /> Cooler or smaller{' '}
          <span className="font-mono text-steel-200">{pct('blue')}%</span>
        </span>
      </div>
      <p className="text-xs text-steel-400">
        One row per layer · from layer mean temperature and melt-pool size
      </p>
    </div>
  )
}
