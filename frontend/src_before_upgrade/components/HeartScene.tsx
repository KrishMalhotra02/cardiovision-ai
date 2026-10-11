
import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/* ----------------------------------------
   TYPES
---------------------------------------- */

export type Vessel = "LAD" | "LCX" | "RCA";

type HeartSceneProps = {
  selected: Vessel;
  probabilities?: Partial<Record<Vessel, number>>;
  onSelect: (vessel: Vessel) => void;
};

type VesselTubeProps = {
  points: [number, number, number][];
  selected: boolean;
  probability?: number;
  onSelect: () => void;
};

/* ----------------------------------------
   VESSEL COMPONENT
---------------------------------------- */

function VesselTube({
  points,
  selected,
  probability,
  onSelect,
}: VesselTubeProps) {
  // Convert coordinates into a smooth 3D curve.
  const geometry = useMemo(() => {
    const vectors = points.map(
      ([x, y, z]) => new THREE.Vector3(x, y, z)
    );

    const curve = new THREE.CatmullRomCurve3(vectors);

    return new THREE.TubeGeometry(
      curve,
      80,
      0.065,
      12,
      false
    );
  }, [points]);

  // Dispose of manually generated geometry when replaced/unmounted.
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  // No prediction: teal for selected vessel, muted red otherwise.
  const color = useMemo(() => {
    if (!selected) {
      return new THREE.Color("#9c5861");
    }

    if (
      probability === undefined ||
      !Number.isFinite(probability)
    ) {
      return new THREE.Color("#79ded1");
    }

    // Clamp predicted score between 0 and 1.
    const score = THREE.MathUtils.clamp(
      probability,
      0,
      1
    );

    // Interpolate between teal and coral based on model score.
    return new THREE.Color("#58cdbb").lerp(
      new THREE.Color("#ed756b"),
      score
    );
  }, [selected, probability]);

  return (
    <mesh
      geometry={geometry}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      <meshStandardMaterial
        color={color}
        metalness={0.12}
        roughness={0.32}
        emissive={selected ? color : "#190a10"}
        emissiveIntensity={selected ? 0.2 : 0.025}
      />
    </mesh>
  );
}

/* ----------------------------------------
   STYLIZED HEART ANATOMY
---------------------------------------- */

function HeartAnatomy({
  selected,
  probabilities,
  onSelect,
}: HeartSceneProps) {
  // Stable vessel paths — defined once for this scene.
  const vesselPaths = useMemo(
    () => ({
      LAD: [
        [0.05, 0.72, 0.72],
        [-0.08, 0.2, 0.91],
        [-0.15, -0.38, 0.84],
        [-0.12, -0.91, 0.58],
        [-0.03, -1.35, 0.27],
      ] as [number, number, number][],

      LCX: [
        [0.05, 0.72, 0.72],
        [-0.42, 0.61, 0.82],
        [-0.84, 0.35, 0.52],
        [-1.03, 0.02, 0.02],
        [-0.85, -0.35, -0.37],
      ] as [number, number, number][],

      RCA: [
        [0.58, 0.67, 0.65],
        [0.94, 0.33, 0.5],
        [1.05, -0.06, 0.17],
        [0.91, -0.43, -0.15],
        [0.65, -0.74, -0.31],
      ] as [number, number, number][],
    }),
    []
  );

  return (
    <Float
      speed={0.6}
      rotationIntensity={0.04}
      floatIntensity={0.08}
    >
      <group rotation={[0.08, -0.2, -0.15]}>
        {/* LEFT UPPER HEART MASS */}
        <mesh
          position={[-0.35, 0.28, 0]}
          rotation={[0, 0, -0.3]}
        >
          <sphereGeometry args={[0.85, 48, 48]} />

          <meshPhysicalMaterial
            color="#713744"
            roughness={0.52}
            metalness={0.05}
            clearcoat={0.25}
            clearcoatRoughness={0.35}
          />
        </mesh>

        {/* RIGHT UPPER HEART MASS */}
        <mesh
          position={[0.4, 0.25, 0.04]}
          rotation={[0, 0, 0.3]}
        >
          <sphereGeometry args={[0.8, 48, 48]} />

          <meshPhysicalMaterial
            color="#85434d"
            roughness={0.49}
            metalness={0.05}
            clearcoat={0.23}
          />
        </mesh>

        {/* LOWER HEART BODY */}
        <mesh
          position={[0, -0.42, 0.04]}
          rotation={[0, 0, Math.PI / 4]}
        >
          <coneGeometry args={[0.98, 2.1, 64]} />

          <meshPhysicalMaterial
            color="#793c49"
            roughness={0.54}
            metalness={0.04}
            clearcoat={0.18}
          />
        </mesh>

        {/* UPPER BLOOD VESSEL 1 */}
        <mesh
          position={[-0.45, 1.12, -0.1]}
          rotation={[0.12, 0, -0.2]}
        >
          <cylinderGeometry args={[0.26, 0.33, 1.05, 32]} />

          <meshStandardMaterial
            color="#914e5c"
            roughness={0.46}
          />
        </mesh>

        {/* UPPER BLOOD VESSEL 2 */}
        <mesh
          position={[0.3, 1.18, -0.18]}
          rotation={[0, 0, 0.3]}
        >
          <cylinderGeometry args={[0.22, 0.29, 0.9, 32]} />

          <meshStandardMaterial
            color="#854c62"
            roughness={0.48}
          />
        </mesh>

        {/* LAD — LEFT ANTERIOR DESCENDING */}
        <VesselTube
          points={vesselPaths.LAD}
          selected={selected === "LAD"}
          probability={probabilities?.LAD}
          onSelect={() => onSelect("LAD")}
        />

        {/* LCX — LEFT CIRCUMFLEX */}
        <VesselTube
          points={vesselPaths.LCX}
          selected={selected === "LCX"}
          probability={probabilities?.LCX}
          onSelect={() => onSelect("LCX")}
        />

        {/* RCA — RIGHT CORONARY ARTERY */}
        <VesselTube
          points={vesselPaths.RCA}
          selected={selected === "RCA"}
          probability={probabilities?.RCA}
          onSelect={() => onSelect("RCA")}
        />
      </group>
    </Float>
  );
}

/* ----------------------------------------
   MAIN 3D SCENE
---------------------------------------- */

export default function HeartScene({
  selected,
  probabilities,
  onSelect,
}: HeartSceneProps) {
  return (
    <div
      className="heart-canvas"
      style={{
        width: "100%",
        height: "100%",
        minHeight: 420,
        position: "relative",
      }}
    >
      <Canvas
        camera={{
          position: [0, 0.15, 5.8],
          fov: 38,
          near: 0.1,
          far: 100,
        }}
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
        }}
        onPointerMissed={() => {
          document.body.style.cursor = "auto";
        }}
      >
        {/* SOFT AMBIENT LIGHT */}
        <ambientLight intensity={1.2} />

        {/* MAIN STUDIO LIGHT */}
        <directionalLight
          position={[4, 5, 6]}
          intensity={2.8}
          color="#d0edff"
        />

        {/* WARM FILL LIGHT */}
        <pointLight
          position={[-3, -2, 3]}
          intensity={18}
          color="#935f74"
          distance={10}
        />

        {/* BACK LIGHT */}
        <directionalLight
          position={[-4, 2, -3]}
          intensity={1.4}
          color="#7bbfc1"
        />

        {/* INTERACTIVE HEART */}
        <HeartAnatomy
          selected={selected}
          probabilities={probabilities}
          onSelect={onSelect}
        />

        {/* CAMERA CONTROLS */}
        <OrbitControls
          enablePan={false}
          enableZoom
          enableRotate
          enableDamping
          dampingFactor={0.06}
          minDistance={3.5}
          maxDistance={9}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI - 0.3}
        />
      </Canvas>
    </div>
  );
}
