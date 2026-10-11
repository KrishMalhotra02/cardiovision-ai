import { useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Environment, MeshDistortMaterial, Sphere, Tube, Float, Html } from '@react-three/drei'
import * as THREE from 'three'

interface PredictionResult {
  probability: number
  prediction: number
  label: string
}
interface Heart3DProps {
  predictions: Record<string, PredictionResult> | null
  selectedVessel: string | null
  onSelectVessel: (vessel: string) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function catmullRomCurve(pts: [number,number,number][]) {
  return new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.5)
}

// ─── Vessel component ────────────────────────────────────────────────────────
function CoronaryVessel({
  points,
  color,
  emissive,
  radius,
  label,
  probability,
  isSelected,
  onClick,
}: {
  points: [number,number,number][]
  color: string
  emissive: string
  radius: number
  label: string
  probability?: number
  isSelected: boolean
  onClick: () => void
}) {
  const curve = useMemo(() => catmullRomCurve(points), [points])
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current && isSelected) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = 0.6 + Math.sin(clock.getElapsedTime() * 3) * 0.4
    } else if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = lerp(mat.emissiveIntensity, 0.15, 0.05)
    }
  })

  return (
    <group onClick={(e) => { e.stopPropagation(); onClick() }}>
      <Tube ref={meshRef} args={[curve, 80, radius, 8, false]}>
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={isSelected ? 0.8 : 0.15}
          roughness={0.3}
          metalness={0.1}
          transparent
          opacity={0.92}
        />
      </Tube>
      {isSelected && (
        <Html position={points[Math.floor(points.length / 2)]} center distanceFactor={6}>
          <div className="bg-gray-900/90 backdrop-blur border border-cyan-500/40 text-white text-xs px-3 py-2 rounded-lg shadow-xl pointer-events-none whitespace-nowrap">
            <div className="font-bold text-cyan-300 mb-1">{label}</div>
            {probability !== undefined && (
              <div className="text-gray-300">{(probability * 100).toFixed(1)}% stenosis probability</div>
            )}
          </div>
        </Html>
      )}
    </group>
  )
}

// ─── Aorta ascending ────────────────────────────────────────────────────────
function Aorta() {
  const curve = useMemo(() => catmullRomCurve([
    [0, 0.9, 0], [0.2, 1.3, 0.1], [0.15, 1.8, -0.1], [-0.1, 2.1, -0.2], [-0.35, 1.9, -0.3],
    [-0.4, 1.4, -0.1], [-0.2, 0.8, 0]
  ]), [])
  return (
    <Tube args={[curve, 60, 0.09, 12, false]}>
      <meshStandardMaterial color="#8b1a1a" emissive="#4a0000" emissiveIntensity={0.2} roughness={0.5} metalness={0.1} />
    </Tube>
  )
}

// ─── Heart body ─────────────────────────────────────────────────────────────
function HeartBody() {
  const heartRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!heartRef.current) return
    // subtle pulsing
    const t = clock.getElapsedTime()
    const beat = 1 + Math.pow(Math.max(0, Math.sin(t * 1.4)), 8) * 0.04
    heartRef.current.scale.setScalar(beat)
  })

  return (
    <group>
      {/* Left ventricle (larger, cone-like, pointing apex downward) */}
      <mesh ref={heartRef} position={[0.08, -0.05, 0]} rotation={[0.15, 0, 0]}>
        <Sphere args={[1, 64, 64]}>
          <MeshDistortMaterial
            color="#7a1c1c"
            emissive="#3a0a0a"
            emissiveIntensity={0.2}
            roughness={0.45}
            metalness={0.15}
            distort={0.18}
            speed={1.2}
          />
        </Sphere>
      </mesh>

      {/* Right ventricle (smaller, to the right) */}
      <mesh position={[-0.75, 0.2, 0.1]} scale={[0.65, 0.7, 0.6]}>
        <Sphere args={[1, 48, 48]}>
          <MeshDistortMaterial
            color="#6b1515"
            emissive="#2d0808"
            emissiveIntensity={0.15}
            roughness={0.5}
            metalness={0.1}
            distort={0.12}
            speed={1.2}
          />
        </Sphere>
      </mesh>

      {/* Left atrium (upper left) */}
      <mesh position={[0.55, 0.8, -0.2]} scale={[0.5, 0.45, 0.5]}>
        <Sphere args={[1, 32, 32]}>
          <meshStandardMaterial color="#8b2020" emissive="#3a0000" emissiveIntensity={0.2} roughness={0.4} metalness={0.15} />
        </Sphere>
      </mesh>

      {/* Right atrium (upper right from viewer's perspective) */}
      <mesh position={[-0.4, 0.75, -0.15]} scale={[0.45, 0.42, 0.45]}>
        <Sphere args={[1, 32, 32]}>
          <meshStandardMaterial color="#7a1a1a" emissive="#300000" emissiveIntensity={0.2} roughness={0.45} metalness={0.12} />
        </Sphere>
      </mesh>

      {/* Pulmonary artery trunk */}
      <mesh position={[-0.3, 1.1, 0.3]} rotation={[0.8, 0.3, 0.3]}>
        <cylinderGeometry args={[0.08, 0.09, 0.8, 16]} />
        <meshStandardMaterial color="#1a3a8b" emissive="#000d3a" emissiveIntensity={0.2} roughness={0.4} />
      </mesh>
    </group>
  )
}

// ─── Particles (floating blood particles) ────────────────────────────────────
function BloodParticles() {
  const count = 120
  const mesh = useRef<THREE.Points>(null)
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3]     = (Math.random() - 0.5) * 3.5
      pos[i * 3 + 1] = (Math.random() - 0.5) * 3
      pos[i * 3 + 2] = (Math.random() - 0.5) * 2.5
    }
    return pos
  }, [])

  useFrame(({ clock }) => {
    if (mesh.current) {
      mesh.current.rotation.y = clock.getElapsedTime() * 0.04
      mesh.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.02) * 0.1
    }
  })

  return (
    <points ref={mesh}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ff4444" size={0.015} transparent opacity={0.35} sizeAttenuation />
    </points>
  )
}

// ─── Scene ───────────────────────────────────────────────────────────────────
function Scene({ predictions, selectedVessel, onSelectVessel }: Heart3DProps) {
  const groupRef = useRef<THREE.Group>(null)

  const getLadColor = () => {
    if (!predictions?.LAD) return '#4a9e7f'
    return predictions.LAD.prediction === 1
      ? `hsl(${lerp(0, 10, predictions.LAD.probability)}, 90%, 55%)`
      : `hsl(${lerp(150, 140, 1 - predictions.LAD.probability)}, 70%, 45%)`
  }
  const getLcxColor = () => {
    if (!predictions?.LCX) return '#4a9e7f'
    return predictions.LCX.prediction === 1
      ? `hsl(${lerp(0, 10, predictions.LCX.probability)}, 90%, 55%)`
      : `hsl(${lerp(150, 140, 1 - predictions.LCX.probability)}, 70%, 45%)`
  }
  const getRcaColor = () => {
    if (!predictions?.RCA) return '#4a9e7f'
    return predictions.RCA.prediction === 1
      ? `hsl(${lerp(0, 10, predictions.RCA.probability)}, 90%, 55%)`
      : `hsl(${lerp(150, 140, 1 - predictions.RCA.probability)}, 70%, 45%)`
  }

  // LAD: runs down the anterior interventricular groove (front, center-left, apex)
  const ladPoints: [number,number,number][] = [
    [0.1, 0.95, 0.6],
    [0.05, 0.5, 0.9],
    [-0.05, 0, 0.95],
    [-0.15, -0.5, 0.8],
    [-0.2, -0.9, 0.5],
    [-0.2, -1.1, 0.2],
  ]
  // LCX: wraps around left (posterior) atrioventricular groove
  const lcxPoints: [number,number,number][] = [
    [0.1, 0.9, 0.5],
    [0.5, 0.7, 0.1],
    [0.85, 0.3, -0.2],
    [0.9, -0.1, -0.55],
    [0.7, -0.5, -0.7],
    [0.3, -0.8, -0.5],
  ]
  // RCA: runs in the right atrioventricular groove
  const rcaPoints: [number,number,number][] = [
    [-0.2, 0.85, 0.45],
    [-0.6, 0.55, 0.3],
    [-0.95, 0.1, 0.0],
    [-1.0, -0.35, -0.3],
    [-0.85, -0.75, -0.55],
    [-0.5, -1.0, -0.35],
    [-0.1, -1.1, -0.1],
  ]

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[3, 4, 3]} intensity={2.5} color="#ffcccc" castShadow />
      <pointLight position={[-3, -2, 2]} intensity={1.2} color="#cc4444" />
      <pointLight position={[0, -3, -2]} intensity={0.8} color="#440000" />
      <spotLight position={[0, 5, 5]} angle={0.3} penumbra={0.8} intensity={2} color="#ffffff" />
      <Environment preset="sunset" />

      <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.08}>
        <group ref={groupRef}>
          <HeartBody />
          <Aorta />
          <BloodParticles />

          <CoronaryVessel
            points={ladPoints}
            color={getLadColor()}
            emissive={getLadColor()}
            radius={0.048}
            label="LAD — Left Anterior Descending"
            probability={predictions?.LAD?.probability}
            isSelected={selectedVessel === 'LAD'}
            onClick={() => onSelectVessel('LAD')}
          />
          <CoronaryVessel
            points={lcxPoints}
            color={getLcxColor()}
            emissive={getLcxColor()}
            radius={0.042}
            label="LCX — Left Circumflex"
            probability={predictions?.LCX?.probability}
            isSelected={selectedVessel === 'LCX'}
            onClick={() => onSelectVessel('LCX')}
          />
          <CoronaryVessel
            points={rcaPoints}
            color={getRcaColor()}
            emissive={getRcaColor()}
            radius={0.046}
            label="RCA — Right Coronary Artery"
            probability={predictions?.RCA?.probability}
            isSelected={selectedVessel === 'RCA'}
            onClick={() => onSelectVessel('RCA')}
          />
        </group>
      </Float>

      <OrbitControls
        enablePan={false}
        minDistance={2.5}
        maxDistance={7}
        autoRotate
        autoRotateSpeed={0.4}
        enableDamping
        dampingFactor={0.07}
      />
    </>
  )
}

// ─── Public component ────────────────────────────────────────────────────────
export default function Heart3D({ predictions, selectedVessel, onSelectVessel }: Heart3DProps) {
  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 45 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.4 }}
        shadows
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <Scene predictions={predictions} selectedVessel={selectedVessel} onSelectVessel={onSelectVessel} />
        </Suspense>
      </Canvas>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 text-[11px] select-none">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]"></span>
          <span className="text-gray-400">Stenotic (≥50%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></span>
          <span className="text-gray-400">Normal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-1.5 rounded-full bg-teal-400 opacity-70"></span>
          <span className="text-gray-500">Not evaluated</span>
        </div>
      </div>

      <div className="absolute top-3 right-3 text-[10px] text-gray-600 select-none">Click vessel to inspect</div>
    </div>
  )
}
