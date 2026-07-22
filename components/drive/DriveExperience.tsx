"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, PerspectiveCamera, View } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RoadMap, astar, nodePositions, pathToPoints } from "@/lib/map";
import { DrivePrefs, VEHICLES } from "@/lib/session-prefs";
import { DriveHUD, DriveControls, HudState } from "./DriveHUD";

type Props = {
  prefs: DrivePrefs;
  map: RoadMap;
};

export type VehiclePose = {
  x: number;
  z: number;
  yaw: number;
  eyeHeight: number;
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
        <mesh key={m.key} position={m.mid} rotation={[0, m.angle, 0]} receiveShadow>
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

function CarBody({
  color,
  scale,
  visible = true,
}: {
  color: string;
  scale: number;
  visible?: boolean;
}) {
  return (
    <group scale={scale} visible={visible}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[1.7, 0.55, 3.4]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.95, -0.15]} castShadow>
        <boxGeometry args={[1.5, 0.55, 1.8]} />
        <meshStandardMaterial
          color="#9ec3d8"
          metalness={0.1}
          roughness={0.15}
          transparent
          opacity={0.55}
        />
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

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[80, -0.02, -100]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#1a2a22" />
      </mesh>
      <ambientLight intensity={0.55} />
      <directionalLight position={[40, 60, 20]} intensity={1.15} />
      <hemisphereLight args={["#87a0b0", "#1a2a22", 0.35]} />
    </>
  );
}

function WorldScene({
  map,
  pathPoints,
  carColor,
  carScale,
  pose,
  showCar,
}: {
  map: RoadMap;
  pathPoints: { x: number; z: number }[];
  carColor: string;
  carScale: number;
  pose: React.MutableRefObject<VehiclePose>;
  showCar: boolean;
}) {
  const car = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!car.current) return;
    const p = pose.current;
    car.current.position.set(p.x, 0, p.z);
    car.current.rotation.y = p.yaw;
  });
  return (
    <>
      <color attach="background" args={["#6ea0c4"]} />
      <fog attach="fog" args={["#6ea0c4", 40, 180]} />
      <Ground />
      <Roads map={map} />
      <RouteLine points={pathPoints} />
      <group ref={car}>
        <CarBody color={carColor} scale={carScale} visible={showCar} />
      </group>
    </>
  );
}

function MirrorCamera({
  pose,
  mode,
}: {
  pose: React.MutableRefObject<VehiclePose>;
  mode: "left" | "right" | "room";
}) {
  const { camera } = useThree();
  useFrame(() => {
    const p = pose.current;
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const height = p.eyeHeight + (mode === "room" ? 0.15 : -0.05);

    if (mode === "room") {
      const back = 0.2;
      camera.position.set(p.x + sin * back, height, p.z + cos * back);
      camera.lookAt(p.x - sin * 12, height - 0.2, p.z - cos * 12);
      return;
    }

    const side = mode === "left" ? -1 : 1;
    const lat = 0.95 * side;
    const fwd = 0.55;
    camera.position.set(
      p.x + cos * lat + sin * fwd,
      height,
      p.z - sin * lat + cos * fwd,
    );
    camera.lookAt(
      p.x + cos * lat - sin * 10,
      height - 0.15,
      p.z - sin * lat - cos * 10,
    );
  });
  return null;
}

function Vehicle({
  prefs,
  controls,
  onHud,
  pose,
  pathPoints,
  carColor,
  carScale,
}: {
  prefs: DrivePrefs;
  controls: React.MutableRefObject<DriveControls>;
  onHud: (s: HudState) => void;
  pose: React.MutableRefObject<VehiclePose>;
  pathPoints: { x: number; z: number }[];
  carColor: string;
  carScale: number;
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

  const eyeHeight = prefs.vehicleId === "suv" ? 1.55 : 1.25;

  useEffect(() => {
    const start = pathPoints[0];
    const next = pathPoints[1] ?? start;
    state.current.x = start.x;
    state.current.z = start.z;
    state.current.yaw = Math.atan2(next.x - start.x, next.z - start.z);
    pose.current = {
      x: start.x,
      z: start.z,
      yaw: state.current.yaw,
      eyeHeight,
    };
  }, [pathPoints, pose, eyeHeight]);

  useFrame((_, dt) => {
    const c = controls.current;
    const s = state.current;
    const clampedDt = Math.min(dt, 0.05);

    if (c.gear) s.gear = c.gear;

    const steer = THREE.MathUtils.clamp(c.steer, -1, 1);
    const throttle = c.throttle;
    const brake = c.brake;

    let maxSpeed = 24;
    if (prefs.transmission === "manual") {
      maxSpeed =
        s.gear === "1" ? 12 : s.gear === "2" ? 22 : s.gear === "R" ? 8 : 0;
    } else {
      maxSpeed = s.gear === "D" ? 24 : s.gear === "R" ? 8 : 0;
    }

    const forwardSign = s.gear === "R" ? -1 : 1;
    let accel = 0;
    if (s.gear === "N" || s.gear === "P") {
      accel = -Math.sign(s.speed) * (s.gear === "P" ? 40 : 4);
    } else {
      accel =
        throttle * 14 * forwardSign - brake * 28 * Math.sign(s.speed || forwardSign);
    }

    s.speed += accel * clampedDt;
    s.speed *= 1 - 0.35 * clampedDt;
    if (Math.abs(s.speed) > maxSpeed) s.speed = Math.sign(s.speed) * maxSpeed;
    if ((brake > 0.5 || s.gear === "P") && Math.abs(s.speed) < 0.4) s.speed = 0;

    const turn =
      steer * Math.min(Math.abs(s.speed) / 8, 1) * 1.8 * Math.sign(s.speed || 1);
    s.yaw += turn * clampedDt;
    s.x += Math.sin(s.yaw) * s.speed * clampedDt;
    s.z += Math.cos(s.yaw) * s.speed * clampedDt;

    pose.current.x = s.x;
    pose.current.z = s.z;
    pose.current.yaw = s.yaw;
    pose.current.eyeHeight = eyeHeight;

    if (group.current) {
      group.current.position.set(s.x, 0, s.z);
      group.current.rotation.y = s.yaw;
    }

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

    const speedKmh = Math.abs(s.speed) * 3.6;
    const rpm = Math.min(8000, 800 + speedKmh * 42 + (c.throttle > 0.5 ? 900 : 0));

    onHud({
      speedKmh: Math.round(speedKmh),
      gear: s.gear,
      eta,
      rpm: Math.round(rpm),
      turnSignal: c.hazard ? "off" : c.turnSignal,
      hazard: c.hazard,
    });
  });

  return (
    <group ref={group}>
      <CarBody color={carColor} scale={carScale} visible={false} />
    </group>
  );
}

function MirrorViews({
  map,
  pathPoints,
  carColor,
  carScale,
  pose,
  leftRef,
  rightRef,
  roomRef,
}: {
  map: RoadMap;
  pathPoints: { x: number; z: number }[];
  carColor: string;
  carScale: number;
  pose: React.MutableRefObject<VehiclePose>;
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
  roomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const track = (r: React.RefObject<HTMLDivElement | null>) =>
    r as unknown as React.RefObject<HTMLElement>;

  return (
    <>
      <View track={track(leftRef)}>
        <PerspectiveCamera makeDefault fov={55} near={0.1} far={200} />
        <WorldScene
          map={map}
          pathPoints={pathPoints}
          carColor={carColor}
          carScale={carScale}
          pose={pose}
          showCar
        />
        <MirrorCamera pose={pose} mode="left" />
      </View>
      <View track={track(rightRef)}>
        <PerspectiveCamera makeDefault fov={55} near={0.1} far={200} />
        <WorldScene
          map={map}
          pathPoints={pathPoints}
          carColor={carColor}
          carScale={carScale}
          pose={pose}
          showCar
        />
        <MirrorCamera pose={pose} mode="right" />
      </View>
      <View track={track(roomRef)}>
        <PerspectiveCamera makeDefault fov={50} near={0.1} far={200} />
        <WorldScene
          map={map}
          pathPoints={pathPoints}
          carColor={carColor}
          carScale={carScale}
          pose={pose}
          showCar
        />
        <MirrorCamera pose={pose} mode="room" />
      </View>
    </>
  );
}

export function DriveExperience({ prefs, map }: Props) {
  const rootRef = useRef<HTMLDivElement>(null!);
  const mirrorLeftRef = useRef<HTMLDivElement>(null!);
  const mirrorRightRef = useRef<HTMLDivElement>(null!);
  const mirrorRoomRef = useRef<HTMLDivElement>(null!);
  const [mirrorsReady, setMirrorsReady] = useState(false);

  const controls = useRef<DriveControls>({
    steer: 0,
    throttle: 0,
    brake: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
    turnSignal: "off",
    hazard: false,
  });
  const pose = useRef<VehiclePose>({ x: 0, z: 0, yaw: 0, eyeHeight: 1.25 });
  const [hud, setHud] = useState<HudState>({
    speedKmh: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
    eta: "—",
    rpm: 800,
    turnSignal: "off",
    hazard: false,
  });

  const pathPoints = useMemo(() => {
    const path =
      astar(map, prefs.startNodeId, prefs.goalNodeId) ?? [prefs.startNodeId];
    return pathToPoints(map, path);
  }, [map, prefs]);

  const vehicleMeta = VEHICLES.find((v) => v.id === prefs.vehicleId)!;
  const scale = prefs.vehicleId === "compact" ? 0.85 : prefs.vehicleId === "suv" ? 1.15 : 1;

  useEffect(() => {
    setMirrorsReady(true);
  }, []);

  return (
    <div ref={rootRef} className="drive-root">
      <Canvas
        className="drive-canvas"
        eventSource={rootRef}
        eventPrefix="client"
        gl={{ antialias: true }}
      >
        <View.Port />
        <View index={1} style={{ position: "absolute", inset: 0 }}>
          <color attach="background" args={["#6ea0c4"]} />
          <fog attach="fog" args={["#6ea0c4", 40, 180]} />
          <Ground />
          <Roads map={map} />
          <RouteLine points={pathPoints} />
          <Vehicle
            prefs={prefs}
            controls={controls}
            onHud={setHud}
            pose={pose}
            pathPoints={pathPoints}
            carColor={vehicleMeta.color}
            carScale={scale}
          />
        </View>
        {mirrorsReady ? (
          <MirrorViews
            map={map}
            pathPoints={pathPoints}
            carColor={vehicleMeta.color}
            carScale={scale}
            pose={pose}
            leftRef={mirrorLeftRef}
            rightRef={mirrorRightRef}
            roomRef={mirrorRoomRef}
          />
        ) : null}
      </Canvas>

      <DriveHUD
        controls={controls}
        hud={hud}
        transmission={prefs.transmission}
        mirrorLeftRef={mirrorLeftRef}
        mirrorRightRef={mirrorRightRef}
        mirrorRoomRef={mirrorRoomRef}
      />
    </div>
  );
}
