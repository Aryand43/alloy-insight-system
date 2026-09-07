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
  if (loading) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        Reconstructing…
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        No reconstruction data
      </div>
    )
  }

  const { meta } = data

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="flex-1 overflow-hidden rounded-sm bg-steel-950/50">
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
          className="font-mono text-[11px] text-steel-500"
          title="Slab thickness is the equivalent bead width of each layer's measured melt-pool area — a single-track estimate, not a measured wall thickness"
        >
          {meta.layers} layers · {meta.lengthMm} × {meta.heightMm} mm · wall{' '}
          {meta.minThicknessMm}–{meta.maxThicknessMm} mm
          {meta.thicknessExaggeration !== 1 && ` · thickness ×${meta.thicknessExaggeration}`}
        </p>
      )}
    </div>
  )
}
