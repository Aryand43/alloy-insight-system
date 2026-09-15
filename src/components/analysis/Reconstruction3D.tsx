import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { MeshPayload } from '../../domain/types'

function ReconMesh({ data }: { data: MeshPayload }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const positions = new Float32Array(data.vertices.length * 3)
    data.vertices.forEach((v, i) => {
      positions[i * 3] = v.x
      positions[i * 3 + 1] = v.y
      positions[i * 3 + 2] = v.z
    })
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(data.indices)
    geo.computeVertexNormals()
    return geo
  }, [data])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={data.color}
        metalness={0.55}
        roughness={0.4}
        flatShading
      />
    </mesh>
  )
}

interface Reconstruction3DProps {
  data: MeshPayload | null
  loading?: boolean
}

export function Reconstruction3D({ data, loading }: Reconstruction3DProps) {
  if (loading || !data) {
    return (
      <div className="viz-secondary flex items-center justify-center px-6 text-center text-sm text-steel-400">
        {loading ? 'Loading wall geometry…' : 'No layer data available for this build.'}
      </div>
    )
  }

  const { meta } = data

  return (
    <div className="flex flex-col gap-2">
      <div className="viz-secondary overflow-hidden rounded-sm bg-steel-950/50">
        <Canvas
          camera={{ position: [3.2, 2.4, 3.2], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#0d1117']} />
          <ambientLight intensity={0.45} />
          <directionalLight position={[4, 6, 3]} intensity={1.1} />
          <directionalLight position={[-3, 2, -2]} intensity={0.35} />
          <ReconMesh data={data} />
          <gridHelper args={[6, 12, '#354556', '#243040']} position={[0, -0.9, 0]} />
          <OrbitControls enablePan={false} minDistance={2} maxDistance={8} />
        </Canvas>
      </div>
      {meta && (
        <p
          className="text-xs text-steel-400"
          title="Slab thickness is the equivalent bead width of each layer's measured melt-pool area — a single-track estimate, not a measured wall thickness"
        >
          Estimated from layer means ·{' '}
          <span className="font-mono text-steel-200">{meta.layers}</span> layers ·{' '}
          <span className="font-mono text-steel-200">
            {meta.lengthMm} × {meta.heightMm} mm
          </span>{' '}
          · est. bead width{' '}
          <span className="font-mono text-steel-200">
            {meta.minThicknessMm.toFixed(1)}–{meta.maxThicknessMm.toFixed(1)} mm
          </span>{' '}
          (from melt-pool area)
          {meta.thicknessExaggeration !== 1 && ` · thickness ×${meta.thicknessExaggeration}`}
        </p>
      )}
    </div>
  )
}
