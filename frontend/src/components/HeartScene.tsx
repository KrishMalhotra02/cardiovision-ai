import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import type { CSSProperties, RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { Group, Material, Mesh } from "three";

export type Vessel = "LAD" | "LCX" | "RCA";

export type HeartSceneProps = {
  selected: Vessel;
  probabilities?: Partial<Record<Vessel, number>>;
  onSelect: (vessel: Vessel) => void;
  resetKey?: number;
  focusMode?: boolean;
  cadProbability?: number;
};

type Trace = {
  base: THREE.TubeGeometry;
  emphasis: THREE.TubeGeometry;
  anchor: THREE.Vector3;
};

type ProjectAnchors = (
  anchors: Partial<Record<Vessel, THREE.Vector3>>,
  camera: THREE.Camera,
) => void;

const VESSELS: Vessel[] = ["LAD", "LCX", "RCA"];
const LABELS: Record<Vessel, string> = {
  LAD: "Left anterior descending",
  LCX: "Left circumflex",
  RCA: "Right coronary artery",
};

// All asset paths refer to files already stored in frontend/public/models/.
const ASSETS = [
  "/models/heart-detailed.glb",
  "/models/realistic-heart/scene.gltf",
  "/models/heart.glb",
] as const;

// Illustrative normalized 2D coordinates raycast against the existing heart mesh.
// They indicate vessel *regions*, not clinically registered coronary geometry.
const VESSEL_PATHS: Record<Vessel, [number, number][]> = {
  LAD: [
    [-0.07, 0.34], [-0.12, 0.17], [-0.16, -0.04],
    [-0.20, -0.28], [-0.23, -0.52], [-0.19, -0.77], [-0.11, -0.99],
  ],
  LCX: [
    [-0.08, 0.36], [-0.29, 0.32], [-0.49, 0.24],
    [-0.68, 0.11], [-0.82, -0.06], [-0.84, -0.22],
  ],
  RCA: [
    [0.30, 0.37], [0.45, 0.28], [0.60, 0.17],
    [0.69, 0.02], [0.68, -0.17], [0.56, -0.38],
  ],
};

function vesselColor(probability: number | undefined) {
  if (probability === undefined || !Number.isFinite(probability)) {
    return new THREE.Color("#79dccc");
  }
  return new THREE.Color("#79dccc").lerp(
    new THREE.Color("#ed8c7b"),
    THREE.MathUtils.clamp(probability, 0, 1),
  );
}

function cloneMaterial(material: Material): Material {
  const copy = material.clone();
  if (copy instanceof THREE.MeshStandardMaterial) {
    copy.metalness = 0;
    copy.roughness = Math.max(copy.roughness, 0.7);
    if (!copy.map) {
      const c = copy.color;
      if (c.r > c.b * 1.28 && c.r > c.g * 1.08) {
        c.lerp(new THREE.Color("#864551"), 0.58);
      } else if (c.b > c.r * 1.23) {
        c.lerp(new THREE.Color("#557d88"), 0.48);
      }
    }
    copy.needsUpdate = true;
  }
  return copy;
}

function normalizeAsset(scene: Group): Group {
  const clone = scene.clone(true);
  clone.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mesh = o as Mesh;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneMaterial)
      : cloneMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });

  clone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(clone);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.y, size.z) || 1;
  clone.position.sub(center);
  const normalized = new THREE.Group();
  normalized.add(clone);
  normalized.scale.setScalar(2.65 / maxExtent);
  normalized.updateMatrixWorld(true);
  return normalized;
}

function buildTrace(model: Group, vessel: Vessel): Trace | null {
  const ray = new THREE.Raycaster();
  const profile = new THREE.CatmullRomCurve3(
    VESSEL_PATHS[vessel].map(([x, y]) => new THREE.Vector3(x, y, 0)),
  );
  const hitsOnSurface: THREE.Vector3[] = [];
  model.updateMatrixWorld(true);

  for (let i = 0; i <= 32; i += 1) {
    const xy = profile.getPoint(i / 32);
    ray.set(new THREE.Vector3(xy.x, xy.y, 4), new THREE.Vector3(0, 0, -1));
    const intersections = ray.intersectObjects(model.children, true);
    if (!intersections.length) continue;
    hitsOnSurface.push(
      intersections[0].point.clone().add(new THREE.Vector3(0, 0, 0.018)),
    );
  }
  if (hitsOnSurface.length < 5) return null;

  const curve = new THREE.CatmullRomCurve3(hitsOnSurface);
  const segments = Math.max(56, hitsOnSurface.length * 3);
  return {
    base: new THREE.TubeGeometry(curve, segments, 0.012, 10, false),
    emphasis: new THREE.TubeGeometry(curve, segments, 0.025, 12, false),
    anchor: curve.getPoint(vessel === "LAD" ? 0.52 : vessel === "LCX" ? 0.61 : 0.55),
  };
}

function VesselTrace({
  vessel,
  trace,
  selected,
  hovered,
  probability,
  onSelect,
  onHover,
}: {
  vessel: Vessel;
  trace: Trace | null;
  selected: boolean;
  hovered: boolean;
  probability?: number;
  onSelect: (vessel: Vessel) => void;
  onHover: (vessel: Vessel | null) => void;
}) {
  if (!trace) return null;
  const active = selected || hovered;
  const color = vesselColor(probability);
  return (
    <mesh
      geometry={active ? trace.emphasis : trace.base}
      renderOrder={3}
      onClick={(e) => { e.stopPropagation(); onSelect(vessel); }}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover(vessel);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        onHover(null);
        document.body.style.cursor = "auto";
      }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.37}
        metalness={0}
        emissive={active ? color : "#000000"}
        emissiveIntensity={active ? 0.48 : 0}
        transparent
        opacity={active ? 1 : 0.48}
        depthWrite={false}
      />
    </mesh>
  );
}

function HeartModel({
  asset,
  selected,
  hovered,
  probabilities,
  onSelect,
  onHover,
  onProjectAnchors,
  cadProbability,
}: HeartSceneProps & {
  asset: string;
  hovered: Vessel | null;
  onHover: (vessel: Vessel | null) => void;
  onProjectAnchors: ProjectAnchors;
}) {
  const { scene } = useGLTF(asset);
  const beat = useRef<Group>(null);
  const model = useMemo(() => normalizeAsset(scene), [scene]);
  const traces = useMemo(() => ({
    LAD: buildTrace(model, "LAD"),
    LCX: buildTrace(model, "LCX"),
    RCA: buildTrace(model, "RCA"),
  }), [model]);

  useEffect(() => () => {
    Object.values(traces).forEach((trace) => {
      trace?.base.dispose();
      trace?.emphasis.dispose();
    });
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    });
  }, [model, traces]);

  useFrame(({ clock, camera }) => {
    if (!beat.current) return;
    const phase = (clock.elapsedTime * 1.12) % 1;
    const contraction = Math.exp(-Math.pow((phase - 0.18) / 0.06, 2));
    beat.current.scale.setScalar(1 + contraction * 0.007);
    beat.current.updateWorldMatrix(true, true);
    const anchors: Partial<Record<Vessel, THREE.Vector3>> = {};
    for (const vessel of VESSELS) {
      if (traces[vessel]) {
        anchors[vessel] = beat.current.localToWorld(traces[vessel]!.anchor.clone());
      }
    }
    onProjectAnchors(anchors, camera);
  });

  return (
    <group ref={beat}>
      <primitive object={model} />
      {cadProbability !== undefined && !Object.values(probabilities ?? {}).some((v) => v !== undefined) && (
        <pointLight
          position={[0, 0, 1.4]}
          color="#eeb4a4"
          distance={5}
          intensity={0.6 + cadProbability * 1.7}
        />
      )}
      {VESSELS.map((vessel) => (
        <VesselTrace
          key={vessel}
          vessel={vessel}
          trace={traces[vessel]}
          selected={selected === vessel}
          hovered={hovered === vessel}
          probability={probabilities?.[vessel]}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </group>
  );
}

function AnatomyCanvas(props: HeartSceneProps & {
  asset: string;
  hovered: Vessel | null;
  onHover: (vessel: Vessel | null) => void;
  onProjectAnchors: ProjectAnchors;
}) {
  return (
    <Canvas
      camera={{
        position: props.focusMode ? [0.2, -0.06, 4.7] : [0.12, 0.08, 6.45],
        fov: props.focusMode ? 34 : 33,
        near: 0.1,
        far: 100,
      }}
      dpr={[1, 1.8]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => { document.body.style.cursor = "auto"; props.onHover(null); }}
    >
      <ambientLight intensity={0.75} />
      <hemisphereLight args={["#e8eff4", "#3e2027", 1.1]} />
      <directionalLight color="#fff0e6" intensity={2.25} position={[3.8, 5, 6]} />
      <directionalLight color="#89aebc" intensity={0.95} position={[-4, 1.3, -3]} />
      <pointLight color="#ad6871" intensity={3.8} distance={9} position={[-4, -2, 4]} />
      <Suspense fallback={<Html center><span className="scene-loading">Loading anatomy…</span></Html>}>
        <HeartModel {...props} />
      </Suspense>
      <OrbitControls
        key={props.resetKey ?? 0}
        enablePan={false}
        enableRotate
        enableZoom
        enableDamping
        dampingFactor={0.06}
        minDistance={props.focusMode ? 2.9 : 3.9}
        maxDistance={props.focusMode ? 7 : 9}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI - 0.25}
      />
    </Canvas>
  );
}

function VesselCallouts({
  selected,
  hovered,
  probabilities,
  onSelect,
  onHover,
  lineRefs,
  pointRefs,
  focusMode,
}: HeartSceneProps & {
  hovered: Vessel | null;
  onHover: (vessel: Vessel | null) => void;
  lineRefs: RefObject<Record<Vessel, SVGPathElement | null>>;
  pointRefs: RefObject<Record<Vessel, SVGCircleElement | null>>;
}) {
  const calloutId = useId().replaceAll(":", "");
  return (
    <div className={`cv-callout-layer${focusMode ? " cv-callout-layer--focus" : ""}`}>
      <svg className="cv-callout-connectors" aria-hidden="true">
        <defs>
          {VESSELS.map((vessel) => (
            <marker
              key={vessel}
              id={`cv-arrow-${calloutId}-${vessel}`}
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 6 3 L 0 6" fill="none" stroke={vesselColor(probabilities?.[vessel]).getStyle()} strokeWidth="1.4" />
            </marker>
          ))}
        </defs>
        {VESSELS.map((vessel) => (
          <g key={vessel} data-callout-group={vessel}>
            <path
              ref={(el) => { lineRefs.current[vessel] = el; }}
              className={`cv-callout-wire${selected === vessel || hovered === vessel ? " is-active" : ""}`}
              markerEnd={`url(#cv-arrow-${calloutId}-${vessel})`}
              stroke={vesselColor(probabilities?.[vessel]).getStyle()}
              strokeWidth={selected === vessel || hovered === vessel ? 2 : 1.4}
              strokeLinejoin="round"
              fill="none"
            />
            <circle
              ref={(el) => { pointRefs.current[vessel] = el; }}
              r={selected === vessel || hovered === vessel ? 5 : 3.5}
              fill={vesselColor(probabilities?.[vessel]).getStyle()}
              stroke="#0d1922"
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
      {VESSELS.map((vessel) => {
        const active = selected === vessel || hovered === vessel;
        return (
          <button
            key={vessel}
            data-vessel-card={vessel}
            type="button"
            aria-label={`Select ${LABELS[vessel]}`}
            aria-pressed={selected === vessel}
            className={`cv-callout-card cv-callout-card--${vessel.toLowerCase()}${active ? " is-active" : ""}${selected !== vessel && hovered !== vessel ? " is-muted" : ""}`}
            style={{ "--vessel-color": vesselColor(probabilities?.[vessel]).getStyle() } as CSSProperties}
            onMouseEnter={() => onHover(vessel)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(vessel)}
            onBlur={() => onHover(null)}
            onClick={() => onSelect(vessel)}
          >
            <span className="cv-callout-tag">{vessel}</span>
            <span className="cv-callout-name">{LABELS[vessel]}</span>
            {probabilities?.[vessel] !== undefined && (
              <span className="cv-callout-score">
                {(probabilities[vessel]! * 100).toFixed(1)}% model estimate
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function HeartScene(props: HeartSceneProps) {
  const [asset, setAsset] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [hovered, setHovered] = useState<Vessel | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const lines = useRef<Record<Vessel, SVGPathElement | null>>({LAD:null, LCX:null, RCA:null});
  const dots = useRef<Record<Vessel, SVGCircleElement | null>>({LAD:null, LCX:null, RCA:null});

  const onProjectAnchors = useCallback<ProjectAnchors>((anchors, camera) => {
    const root = overlay.current;
    if (!root) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width === 0 || height === 0) return;

    for (const vessel of VESSELS) {
      const line = lines.current[vessel];
      const dot = dots.current[vessel];
      const anchor = anchors[vessel];
      const card = root.querySelector<HTMLElement>(`[data-vessel-card="${vessel}"]`);
      if (!line || !dot || !card || !anchor) {
        line?.setAttribute("visibility", "hidden");
        dot?.setAttribute("visibility", "hidden");
        continue;
      }
      const projected = anchor.clone().project(camera);
      // Hide connectors behind the viewing frustum rather than drawing across the scene.
      if (projected.z < -1 || projected.z > 1) {
        line.setAttribute("visibility", "hidden");
        dot.setAttribute("visibility", "hidden");
        continue;
      }
      const endX = (projected.x * 0.5 + 0.5) * width;
      const endY = (-projected.y * 0.5 + 0.5) * height;
      const side = vessel === "LAD" ? "left" : "right";
      const startX = side === "left" ? card.offsetLeft + card.offsetWidth : card.offsetLeft;
      const startY = card.offsetTop + card.offsetHeight * 0.5;
      const elbowX = startX + (endX - startX) * 0.34;
      const path = `M ${startX.toFixed(1)} ${startY.toFixed(1)} L ${elbowX.toFixed(1)} ${startY.toFixed(1)} L ${elbowX.toFixed(1)} ${endY.toFixed(1)} L ${endX.toFixed(1)} ${endY.toFixed(1)}`;
      line.setAttribute("d", path);
      line.removeAttribute("visibility");
      dot.setAttribute("cx", endX.toFixed(1));
      dot.setAttribute("cy", endY.toFixed(1));
      dot.removeAttribute("visibility");
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      let detected: string | null = null;
      for (const url of ASSETS) {
        try {
          const response = await fetch(url, { method: "HEAD" });
          const type = response.headers.get("content-type")?.toLowerCase() ?? "";
          if (response.ok && !type.includes("text/html")) {
            detected = url;
            break;
          }
        } catch { /* try next model */ }
      }
      if (active) { setAsset(detected); setChecked(true); }
    })();
    return () => { active = false; };
  }, []);

  if (!checked) {
    return <div className="heart-asset-message"><span className="scene-loading">Preparing anatomical viewer…</span></div>;
  }
  if (!asset) {
    return (
      <div className="heart-asset-message" role="status">
        <strong>3D anatomy asset not found</strong>
        <span>Add a heart GLB or the complete glTF folder to frontend/public/models/</span>
      </div>
    );
  }
  return (
    <div className={`heart-canvas cv-heart-labeled${props.focusMode ? " cv-heart-labeled--focus" : ""}`}>
      <AnatomyCanvas
        {...props}
        asset={asset}
        hovered={hovered}
        onHover={setHovered}
        onProjectAnchors={onProjectAnchors}
      />
      <div ref={overlay} className="cv-callout-overlay">
        <VesselCallouts
          {...props}
          hovered={hovered}
          onHover={setHovered}
          lineRefs={lines}
          pointRefs={dots}
        />
      </div>
      {asset.includes("realistic-heart") && (
        <a
          className="model-attribution"
          href="https://sketchfab.com/3d-models/realistic-human-heart-3f8072336ce94d18b3d0d055a1ece089"
          target="_blank"
          rel="noreferrer"
        >
          3D anatomy © neshallads · CC BY
        </a>
      )}
    </div>
  );
}
