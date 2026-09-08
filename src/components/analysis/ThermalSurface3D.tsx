import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ramp } from '../../domain/thermalColor'
import type { Calibration } from '../../api/thermalField'
import type { ThermalField } from '../../api/thermalField'
import { ThermalColorBar } from './ThermalColorBar'

const PLANE_W = 3
const RELIEF = 0.9
const PIXEL_PITCH_UM = 29.7

/**
 * Colour LUT in three's linear working space.
 *
 * three r173 has colour management on and treats vertex-colour attributes as
 * linear-sRGB. Writing the sRGB bytes straight in renders visibly washed out
 * and would NOT match the server-rendered PNG — precisely the drift the shared
 * colour module exists to prevent. Converting once here keeps them identical.
 */
function buildLinearLut(calibration: Calibration): Float32Array {
  const { celsius, minC, maxC } = calibration
  const span = maxC - minC || 1
  const out = new Float32Array(celsius.length * 3)
  const colour = new THREE.Color()
  for (let i = 0; i < celsius.length; i++) {
    const [r, g, b] = ramp((celsius[i] - minC) / span)
    colour.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace)
    out[i * 3] = colour.r
    out[i * 3 + 1] = colour.g
    out[i * 3 + 2] = colour.b
  }
  return out
}

function Surface({
  field,
  calibration,
}: {
  field: ThermalField
  calibration: Calibration
}) {
  const linearLut = useMemo(() => buildLinearLut(calibration), [calibration])

  // Allocated once per frame size and mutated in place; never reallocated
  // while scrubbing at 10 Hz.
  const geometry = useMemo(() => {
    const planeH = (PLANE_W * field.height) / field.width
    const geo = new THREE.PlaneGeometry(
      PLANE_W,
      planeH,
      field.width - 1,
      field.height - 1,
    )
    const count = field.width * field.height
    geo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(count * 3), 3),
    )
    ;(geo.attributes.position as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage,
    )
    ;(geo.attributes.color as THREE.BufferAttribute).setUsage(
      THREE.DynamicDrawUsage,
    )
    // Normals are unused: the material is unlit on purpose.
    geo.deleteAttribute('normal')
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(0, 0, RELIEF / 2),
      PLANE_W,
    )
    return geo
  }, [field.width, field.height])

  useEffect(() => () => geometry.dispose(), [geometry])

  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    const position = geometry.attributes.position.array as Float32Array
    const colour = geometry.attributes.color.array as Float32Array
    const { celsius, minC, maxC } = calibration
    const span = maxC - minC || 1

    // PlaneGeometry emits vertices row-major, so index i maps straight onto
    // the frame's own row-major order with no remapping.
    const n = Math.min(field.counts.length, position.length / 3)
    for (let i = 0; i < n; i++) {
      const count = field.counts[i]
      position[i * 3 + 2] = ((celsius[count] - minC) / span) * RELIEF
      colour[i * 3] = linearLut[count * 3]
      colour[i * 3 + 1] = linearLut[count * 3 + 1]
      colour[i * 3 + 2] = linearLut[count * 3 + 2]
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }, [field, geometry, calibration, linearLut])

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      frustumCulled={false}
    >
      {/*
        Unlit on purpose. Lighting would shade the same temperature differently
        depending on local slope, so the surface would stop matching the colour
        bar and the PNG. Colour here must stay quantitative.
      */}
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

interface ThermalSurface3DProps {
  field: ThermalField | null
  calibration: Calibration | null
  meltThresholdC: number
  loading?: boolean
  error?: string | null
}

export function ThermalSurface3D({
  field,
  calibration,
  meltThresholdC,
  loading,
  error,
}: ThermalSurface3DProps) {
  if (error) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center px-4 text-center text-xs text-signal-red">
        {error}
      </div>
    )
  }
  if (!field || !calibration) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-steel-500">
        {loading ? 'Loading thermal field…' : 'No thermal field'}
      </div>
    )
  }

  const widthMm = (field.width * PIXEL_PITCH_UM) / 1000
  const heightMm = (field.height * PIXEL_PITCH_UM) / 1000

  return (
    <div className="flex h-full min-h-[180px] flex-col gap-2">
      <div className="flex-1 overflow-hidden rounded-sm bg-steel-950/50">
        <Canvas
          camera={{ position: [2.8, 2.2, 3.0], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#0d1117']} />
          <Surface field={field} calibration={calibration} />
          <gridHelper
            args={[6, 12, '#354556', '#243040']}
            position={[0, -0.02, 0]}
          />
          <OrbitControls
            enablePan={false}
            minDistance={1.8}
            maxDistance={8}
            /* Stop the camera dropping below the plate, where it reads badly. */
            maxPolarAngle={Math.PI / 2 - 0.02}
            target={[0, 0.25, 0]}
          />
        </Canvas>
      </div>
      <ThermalColorBar meltThresholdC={meltThresholdC} />
      <p className="font-mono text-[11px] text-steel-500">
        {field.width} × {field.height} px · {widthMm.toFixed(1)} ×{' '}
        {heightMm.toFixed(1)} mm at {PIXEL_PITCH_UM} µm/px · height ∝ °C
      </p>
    </div>
  )
}
