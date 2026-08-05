import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { ColorClass, ThreeColorPayload } from '../../domain/types'

const CLASS_COLORS: Record<ColorClass, string> = {
  red: '#d64545',
  blue: '#3d7ab5',
  green: '#3d9a6a',
}

function VoxelCloud({ data }: { data: ThreeColorPayload }) {
  return (
    <group>
      {data.voxels.map((v, i) => (
        <mesh key={i} position={[v.x, v.y, v.z]}>
          <boxGeometry args={[v.size * 0.9, v.size * 0.9, v.size * 0.9]} />
          <meshStandardMaterial
            color={CLASS_COLORS[v.class]}
            metalness={0.2}
            roughness={0.55}
            transparent
            opacity={v.class === 'green' ? 0.95 : 0.75}
          />
        </mesh>
      ))}
    </group>
  )
}

interface ThreeColor3DProps {
  data: ThreeColorPayload | null
  loading?: boolean
}

export function ThreeColor3D({ data, loading }: ThreeColor3DProps) {
  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Classifying volume…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        No three-color volume
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="relative flex-1 overflow-hidden rounded-sm bg-steel-950/50">
        <Canvas
          camera={{ position: [3.4, 2.6, 3.4], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 2]} intensity={1} />
          <VoxelCloud data={data} />
          <OrbitControls enablePan={false} minDistance={2} maxDistance={9} />
        </Canvas>
      </div>
      <div className="flex flex-wrap gap-3 font-mono text-[11px] text-steel-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-signal-red" /> Red
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-signal-blue" /> Blue
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-signal-green" /> Green
        </span>
      </div>
    </div>
  )
}
