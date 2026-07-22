"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoadMap, astar, nodePositions, pathToPoints } from "@/lib/map";
import { DrivePrefs, VEHICLES } from "@/lib/session-prefs";
import { DriveHUD, DriveControls } from "./DriveHUD";

type Props = {
  prefs: DrivePrefs;
  map: RoadMap;
};

function Roads({ map }: { map: RoadMap }) {
  const pos = useMemo(() => nodePositions(map), [map]);
  const meshes = useMemo(() => {
    return map.edges.map((e, i) => {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const mid: [number, number, number] = [(a[0] + b[0]) / 2, 0.02, (a[1] + b[1]) / 2];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const width = 3.2 * e.lanes;
      return { key: i, mid, len, angle, width };
    });
  }, [map, pos]);

  return (
    <group>
      {meshes.map((m) => (
        <mesh
          key={m.key}
          position={m.mid}
          rotation={[0, m.angle, 0]}
          receiveShadow
        >
          <boxGeometry args={[m.width, 0.08, m.len + 1.2]} />
          <meshStandardMaterial color="#2a2f33" roughness={0.95} />
        </mesh>
      ))}
      {map.nodes.map((n) => {
        const p = pos.get(n.id)!;
        return (
          <mesh key={n.id} position={[p[0], 0.05, p[1]]}>
            <cylinderGeometry args={[1.1, 1.1, 0.06, 16]} />
            <meshStandardMaterial color="#3a4046" />
          </mesh>
        );
      })}
    </group>
  );
}

function RouteLine({ points }: { points: { x: number; z: number }[] }) {
  const pts = useMemo(
    () => points.map((p) => [p.x, 0.12, p.z] as [number, number, number]),
    [points],
  );
  if (pts.length < 2) return null;
  return <Line points={pts} color="#d4a017" lineWidth={2} />;
}

function CarBody({ color, scale }: { color: string; scale: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.7, 0.55, 3.4]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.95, -0.15]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1.8]} />
        <meshStandardMaterial color="#9ec3d8" metalness={0.1} roughness={0.15} transparent opacity={0.55} />
      </mesh>
      {[
        [-0.75, 0.28, 1.05],
        [0.75, 0.28, 1.05],
        [-0.75, 0.28, -1.05],
        [0.75, 0.28, -1.05],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.28, 0.28, 0.22, 12]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </group>
  );
}

function Vehicle({
  prefs,
  map,
  controls,
  onHud,
}: {
  prefs: DrivePrefs;
  map: RoadMap;
  controls: React.MutableRefObject<DriveControls>;
  onHud: (s: { speedKmh: number; gear: string; eta: string }) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const state = useRef({
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
  });

  const pathPoints = useMemo(() => {
    const path = astar(map, prefs.startNodeId, prefs.goalNodeId) ?? [prefs.startNodeId];
    return pathToPoints(map, path);
  }, [map, prefs]);

  const vehicleMeta = VEHICLES.find((v) => v.id === prefs.vehicleId)!;
  const scale = prefs.vehicleId === "compact" ? 0.85 : prefs.vehicleId === "suv" ? 1.15 : 1;

  useEffect(() => {
    const start = pathPoints[0];
    const next = pathPoints[1] ?? start;
    state.current.x = start.x;
    state.current.z = start.z;
    state.current.yaw = Math.atan2(next.x - start.x, next.z - start.z);
  }, [pathPoints]);

  useFrame((_, dt) => {
    const c = controls.current;
    const s = state.current;
    const clampedDt = Math.min(dt, 0.05);

    if (prefs.transmission === "manual") {
      if (c.gear) s.gear = c.gear;
    } else {
      s.gear = "D";
    }

    const steer = THREE.MathUtils.clamp(c.steer, -1, 1);
    const throttle = c.throttle;
    const brake = c.brake;

    let accel = 0;
    const maxSpeed =
      prefs.transmission === "manual"
        ? s.gear === "1"
          ? 12
          : s.gear === "2"
            ? 22
            : s.gear === "R"
              ? 8
              : 0
        : 24;

    const forwardSign = s.gear === "R" ? -1 : 1;
    if (s.gear === "N") {
      accel = -Math.sign(s.speed) * 4;
    } else {
      accel = throttle * 14 * forwardSign - brake * 28 * Math.sign(s.speed || forwardSign);
    }

    s.speed += accel * clampedDt;
    s.speed *= 1 - 0.35 * clampedDt;
    if (Math.abs(s.speed) > maxSpeed) s.speed = Math.sign(s.speed) * maxSpeed;
    if (brake > 0.5 && Math.abs(s.speed) < 0.4) s.speed = 0;

    const turn = steer * Math.min(Math.abs(s.speed) / 8, 1) * 1.8 * Math.sign(s.speed || 1);
    s.yaw += turn * clampedDt;
    s.x += Math.sin(s.yaw) * s.speed * clampedDt;
    s.z += Math.cos(s.yaw) * s.speed * clampedDt;

    if (group.current) {
      group.current.position.set(s.x, 0, s.z);
      group.current.rotation.y = s.yaw;
    }

    const eyeHeight = prefs.vehicleId === "suv" ? 1.55 : 1.25;
    const back = 0.35;
    camera.position.set(
      s.x - Math.sin(s.yaw) * back,
      eyeHeight,
      s.z - Math.cos(s.yaw) * back,
    );
    camera.lookAt(
      s.x + Math.sin(s.yaw) * 8,
      eyeHeight - 0.1,
      s.z + Math.cos(s.yaw) * 8,
    );

    const goal = pathPoints[pathPoints.length - 1];
    const dist = Math.hypot(goal.x - s.x, goal.z - s.z);
    const eta =
      Math.abs(s.speed) < 0.5
        ? dist < 8
          ? "도착"
          : "—"
        : `${Math.max(1, Math.round(dist / Math.abs(s.speed)))}s`;

    onHud({
      speedKmh: Math.round(Math.abs(s.speed) * 3.6),
      gear: prefs.transmission === "auto" ? "D" : s.gear,
      eta,
    });
  });

  return (
    <>
      <group ref={group}>
        <CarBody color={vehicleMeta.color} scale={scale} />
      </group>
      <RouteLine points={pathPoints} />
    </>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[80, -0.02, -100]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#1a2a22" />
      </mesh>
      <ambientLight intensity={0.55} />
      <directionalLight
        castShadow
        position={[40, 60, 20]}
        intensity={1.15}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={["#87a0b0", "#1a2a22", 0.35]} />
    </>
  );
}

export function DriveExperience({ prefs, map }: Props) {
  const controls = useRef<DriveControls>({
    steer: 0,
    throttle: 0,
    brake: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
  });
  const [hud, setHud] = useState({ speedKmh: 0, gear: "D", eta: "—" });

  return (
    <div className="drive-root">
      <Canvas shadows gl={{ antialias: true }}>
        <color attach="background" args={["#6ea0c4"]} />
        <fog attach="fog" args={["#6ea0c4", 40, 180]} />
        <Ground />
        <Roads map={map} />
        <Vehicle prefs={prefs} map={map} controls={controls} onHud={setHud} />
      </Canvas>
      <DriveHUD
        controls={controls}
        hud={hud}
        transmission={prefs.transmission}
      />
    </div>
  );
}
