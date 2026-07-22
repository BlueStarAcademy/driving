"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, PerspectiveCamera, Sky, View } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  RoadMap,
  astar,
  nearestSignal,
  parkingWorldPose,
  pathToPoints,
  speedLimitNear,
} from "@/lib/map";
import { buildNavGuidance } from "@/lib/nav-guidance";
import { DrivePrefs, VEHICLES } from "@/lib/session-prefs";
import {
  ScenarioState,
  createScenario,
  environmentPreset,
  signalPhaseAt,
} from "@/lib/scenario";
import { NpcVehicle, spawnNpcs, updateNpcs } from "@/lib/traffic/npc";
import { DriveHUD, DriveControls, HudState, WiperMode } from "./DriveHUD";
import {
  Crosswalks,
  NpcCars,
  ParkingBays,
  RainFX,
  SpeedSigns,
  TollPlaza,
  TrafficSignals,
  WorldBuildings,
  WorldRoads,
} from "./world/WorldDecor";

function WiperOverlay({
  controls,
}: {
  controls: MutableRefObject<DriveControls>;
}) {
  const [mode, setMode] = useState<WiperMode>(controls.current.wiper);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = controls.current.wiper;
      setMode((prev) => (prev === next ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controls]);

  if (mode === "off") return null;

  return (
    <div className={`wiper-fx ${mode}`} aria-hidden>
      <div className="wiper-unit left">
        <div className="wiper-arm">
          <span className="wiper-blade-edge" />
        </div>
      </div>
      <div className="wiper-unit right">
        <div className="wiper-arm">
          <span className="wiper-blade-edge" />
        </div>
      </div>
      {mode !== "mist" ? <div className="rain-mist" /> : null}
    </div>
  );
}

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

type PathPoint = { id: number; x: number; z: number };

type SimBag = {
  npcs: NpcVehicle[];
  nowSec: number;
  scenario: ScenarioState;
};

function projectOnPath(points: PathPoint[], x: number, z: number) {
  let bestDist = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  let best = { x, z, yaw: 0, dist: 0, remaining: 0 };

  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].x;
    const az = points[i].z;
    const bx = points[i + 1].x;
    const bz = points[i + 1].z;
    const abx = bx - ax;
    const abz = bz - az;
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - ax) * abx + (z - az) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t;
    const pz = az + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < bestDist) {
      bestDist = d;
      bestSeg = i;
      bestT = t;
      best = {
        x: px,
        z: pz,
        yaw: Math.atan2(abx, abz),
        dist: d,
        remaining: 0,
      };
    }
  }

  let remaining = 0;
  for (let i = bestSeg; i < points.length - 1; i++) {
    const len = Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].z - points[i].z,
    );
    remaining += i === bestSeg ? (1 - bestT) * len : len;
  }
  best.remaining = remaining;
  return best;
}

function RouteLine({ points, visible }: { points: PathPoint[]; visible: boolean }) {
  const pts = useMemo(
    () => points.map((p) => [p.x, 0.14, p.z] as [number, number, number]),
    [points],
  );
  if (!visible || pts.length < 2) return null;
  return <Line points={pts} color="#2f6bff" lineWidth={3} />;
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
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[1.78, 0.52, 3.55]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.72, 1.35]} castShadow>
        <boxGeometry args={[1.7, 0.22, 0.55]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.98, -0.2]} castShadow>
        <boxGeometry args={[1.52, 0.58, 1.85]} />
        <meshStandardMaterial
          color="#a8d0e8"
          metalness={0.25}
          roughness={0.12}
          transparent
          opacity={0.48}
        />
      </mesh>
      <mesh position={[0, 0.55, 1.78]}>
        <boxGeometry args={[1.2, 0.14, 0.08]} />
        <meshStandardMaterial color="#fff6d8" emissive="#ffe8a0" emissiveIntensity={0.7} />
      </mesh>
      <mesh position={[0, 0.55, -1.78]}>
        <boxGeometry args={[1.15, 0.18, 0.08]} />
        <meshStandardMaterial color="#8a1515" emissive="#ff3030" emissiveIntensity={0.25} />
      </mesh>
      {[
        [-0.78, 0.28, 1.1],
        [0.78, 0.28, 1.1],
        [-0.78, 0.28, -1.1],
        [0.78, 0.28, -1.1],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.24, 14]} />
          <meshStandardMaterial color="#111" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Environment({
  sim,
}: {
  sim: React.MutableRefObject<SimBag>;
}) {
  const { scene } = useThree();
  const amb = useRef<THREE.AmbientLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const skyRef = useRef<THREE.Object3D | null>(null);
  useFrame(() => {
    const preset = environmentPreset(
      sim.current.scenario.timeOfDay,
      sim.current.scenario.weather,
    );
    // 앞유리/미러 배경이 비지 않도록 스카이 색 유지
    if (!scene.background || !(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(preset.sky);
    } else {
      scene.background.set(preset.sky);
    }
    if (scene.fog && scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(preset.fog);
      scene.fog.near = preset.fogNear;
      scene.fog.far = preset.fogFar;
    }
    if (amb.current) amb.current.intensity = preset.ambient;
    if (sun.current) {
      sun.current.intensity = preset.sunIntensity;
      sun.current.position.set(...preset.sunPos);
    }
    const skyObj = skyRef.current as THREE.Mesh | null;
    const mat = skyObj?.material as THREE.ShaderMaterial | undefined;
    if (mat?.uniforms?.sunPosition) {
      const [x, y, z] = preset.sunPos;
      mat.uniforms.sunPosition.value.set(x, y, z);
      if (mat.uniforms.turbidity) {
        mat.uniforms.turbidity.value =
          sim.current.scenario.weather === "fog"
            ? 14
            : sim.current.scenario.timeOfDay === "night"
              ? 8
              : 3.5;
      }
      if (mat.uniforms.rayleigh) {
        mat.uniforms.rayleigh.value =
          sim.current.scenario.timeOfDay === "night"
            ? 0.15
            : sim.current.scenario.timeOfDay === "dusk"
              ? 2.2
              : 1.2;
      }
    }
  });
  return (
    <>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Sky
        ref={skyRef as any}
        sunPosition={[40, 28, 10]}
        turbidity={3.5}
        rayleigh={1.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.85}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[40, -0.12, -60]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#3a5a42" roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[40, -0.1, -60]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#4a5a48" roughness={1} />
      </mesh>
      <ambientLight ref={amb} intensity={0.62} />
      <directionalLight
        ref={sun}
        castShadow
        position={[30, 45, 20]}
        intensity={1.05}
        shadow-mapSize={[2048, 2048]}
      />
      <hemisphereLight args={["#9ec9ef", "#3d5a45", 0.45]} />
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
  sim,
  showRoute,
}: {
  map: RoadMap;
  pathPoints: PathPoint[];
  carColor: string;
  carScale: number;
  pose: React.MutableRefObject<VehiclePose>;
  showCar: boolean;
  sim: React.MutableRefObject<SimBag>;
  showRoute: boolean;
}) {
  const car = useRef<THREE.Group>(null);
  const nowSecRef = useRef(0);
  useFrame(() => {
    if (!car.current) return;
    const p = pose.current;
    car.current.position.set(p.x, 0, p.z);
    car.current.rotation.y = p.yaw;
    nowSecRef.current = sim.current.nowSec;
  });
  const wet = sim.current.scenario.weather === "rain";
  return (
    <>
      <fog attach="fog" args={["#c5d8ea", 35, 160]} />
      <Environment sim={sim} />
      <WorldRoads map={map} wet={wet} />
      <WorldBuildings map={map} />
      <Crosswalks map={map} />
      <TrafficSignals map={map} nowSecRef={nowSecRef} />
      <SpeedSigns map={map} />
      <ParkingBays map={map} />
      <TollPlaza map={map} />
      <RainFX isActive={() => sim.current.scenario.weather === "rain"} />
      <NpcCars getNpcs={() => sim.current.npcs} />
      <RouteLine points={pathPoints} visible={showRoute} />
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

    // 거울처럼 좌우 반전
    camera.scale.x = -1;

    if (mode === "room") {
      const height = p.eyeHeight + 0.25;
      camera.position.set(p.x + sin * 0.45, height, p.z + cos * 0.45);
      camera.lookAt(p.x - sin * 18, height - 0.4, p.z - cos * 18);
      return;
    }

    const side = mode === "left" ? -1 : 1;
    const height = p.eyeHeight - 0.05;
    // 도어 바깥 미러 — 차체에 가리지 않게 조금 더 바깥·앞에서
    const lat = 1.45 * side;
    const fwd = 0.15;
    camera.position.set(
      p.x + cos * lat + sin * fwd,
      height,
      p.z - sin * lat + cos * fwd,
    );
    const lookLat = 3.2 * side;
    const lookBack = 16;
    camera.lookAt(
      p.x + cos * lookLat - sin * lookBack,
      height - 0.35,
      p.z - sin * lookLat - cos * lookBack,
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
  map,
  sim,
}: {
  prefs: DrivePrefs;
  controls: React.MutableRefObject<DriveControls>;
  onHud: (s: HudState) => void;
  pose: React.MutableRefObject<VehiclePose>;
  pathPoints: PathPoint[];
  carColor: string;
  carScale: number;
  map: RoadMap;
  sim: React.MutableRefObject<SimBag>;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const state = useRef({
    x: 0,
    z: 0,
    yaw: 0,
    speed: 0,
    steer: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
  });

  const eyeHeight = prefs.vehicleId === "suv" ? 1.45 : 1.2;

  useEffect(() => {
    const start = pathPoints[0];
    const next = pathPoints[1] ?? start;
    state.current.x = start.x;
    state.current.z = start.z;
    state.current.yaw = Math.atan2(next.x - start.x, next.z - start.z);
    state.current.steer = 0;
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

    // 핸들 입력 스무딩 (너무 물리지 않게)
    const steerTarget = THREE.MathUtils.clamp(c.steer, -1, 1);
    const steerRate = 3.2;
    const steerDiff = steerTarget - s.steer;
    s.steer +=
      Math.sign(steerDiff) * Math.min(Math.abs(steerDiff), steerRate * clampedDt);
    const steer = s.steer;

    const throttle = c.throttle;
    const brake = c.brake;
    sim.current.nowSec += clampedDt;

    // m/s — urban / highway from map limit
    const limit = speedLimitNear(map, s.x, s.z);
    sim.current.scenario.speedLimitKmh = limit.speedKmh;
    let maxSpeed = limit.speedKmh / 3.6;
    const wet = sim.current.scenario.weather === "rain";
    if (wet) maxSpeed *= 0.88;

    let throttleAccel = 8.5;
    if (prefs.transmission === "manual") {
      if (s.gear === "1") {
        maxSpeed = Math.min(maxSpeed, 12);
        throttleAccel = 9.5;
      } else if (s.gear === "2") {
        throttleAccel = 7.2;
      } else if (s.gear === "R") {
        maxSpeed = Math.min(maxSpeed, 5.5);
        throttleAccel = 5.5;
      } else {
        maxSpeed = 0;
        throttleAccel = 0;
      }
    } else if (s.gear === "R") {
      maxSpeed = Math.min(maxSpeed, 5.5);
      throttleAccel = 5.5;
    } else if (s.gear === "N" || s.gear === "P") {
      maxSpeed = 0;
      throttleAccel = 0;
    }

    // 제한속도 바로 아래에서 힘이 죽지 않도록 여유
    const softCap = maxSpeed * 1.06;

    const forwardSign = s.gear === "R" ? -1 : 1;
    let accel = 0;
    if (s.gear === "N" || s.gear === "P") {
      accel = -Math.sign(s.speed) * (s.gear === "P" ? 14 : 1.4);
    } else {
      const speedRatio = Math.min(1, Math.abs(s.speed) / Math.max(softCap, 0.1));
      // 저속에서 힘 세게, 고속에서만 완만히 감소
      const pullCurve = 1 - speedRatio * speedRatio * 0.42;
      const enginePull = throttle * throttleAccel * pullCurve * forwardSign;
      const brakeForce = brake * 11 * Math.sign(s.speed || forwardSign);
      accel = enginePull - brakeForce;
    }

    // rolling + aero — 가속 중에는 체감이 죽지 않게 줄임
    const speedAbsForDrag = Math.abs(s.speed);
    const drag =
      0.28 + 0.012 * speedAbsForDrag * speedAbsForDrag;
    const dragScale = throttle > 0.15 ? 0.18 : brake > 0.1 ? 0.55 : 1;
    accel -= Math.sign(s.speed || 1) * drag * dragScale;

    s.speed += accel * clampedDt;
    if (Math.abs(s.speed) > softCap) s.speed = Math.sign(s.speed) * softCap;
    if ((brake > 0.55 || s.gear === "P") && Math.abs(s.speed) < 0.25) s.speed = 0;
    if (Math.abs(s.speed) < 0.03 && throttle < 0.05) s.speed = 0;

    // 자전거 모델: 곡률 κ = tan(δ)/L  (속도에 무관), yawRate = v·κ
    // 고속에서만 살짝 조향각 제한 (실차 안정성) — 시내에서는 거의 1:1
    const wheelbase = 2.7;
    const maxRoadSteer = 0.5; // ~28.6° 전륜
    const v = s.speed;
    const speedAbs = Math.abs(v);
    const speedEase = THREE.MathUtils.lerp(
      1,
      0.62,
      Math.min(1, Math.max(0, (speedAbs - 8) / 22)),
    );
    const roadSteer = maxRoadSteer * steer * speedEase;
    if (speedAbs > 0.05) {
      // steer(+) = 우회전, steer(-) = 좌회전
      // Three.js yaw+ = 위에서 반시계(좌) → 우회전은 yaw 감소
      s.yaw -= (v / wheelbase) * Math.tan(roadSteer) * clampedDt;
    } else if (Math.abs(steer) > 0.04 && speedAbs > 0.005) {
      s.yaw -= steer * 0.28 * Math.sign(v || 1) * clampedDt;
    }

    s.x += Math.sin(s.yaw) * v * clampedDt;
    s.z += Math.cos(s.yaw) * v * clampedDt;

    // NPC traffic
    const npcResult = updateNpcs(
      sim.current.npcs,
      map,
      clampedDt,
      sim.current.nowSec,
      { x: s.x, z: s.z, speed: s.speed },
    );
    sim.current.npcs = npcResult.npcs;
    if (npcResult.nearMiss) {
      sim.current.scenario.safety.nearMiss += 1;
      sim.current.scenario.safety.score = Math.max(
        0,
        sim.current.scenario.safety.score - 0.4,
      );
      // soft collision pushback
      for (const n of sim.current.npcs) {
        const d = Math.hypot(n.x - s.x, n.z - s.z);
        if (d < 2.8) {
          s.speed *= 0.92;
          break;
        }
      }
    }

    // Signal awareness
    const sig = nearestSignal(map, s.x, s.z, 30);
    let signalPhase: "red" | "yellow" | "green" = "green";
    if (sig) {
      signalPhase = signalPhaseAt(sig.cycleSeconds, sim.current.nowSec);
      sim.current.scenario.nearestSignalNodeId = sig.nodeId;
      sim.current.scenario.signalPhase = signalPhase;
      if (signalPhase === "red" && sig.dist < 8 && Math.abs(s.speed) > 4) {
        sim.current.scenario.safety.redLight += 0.02;
        sim.current.scenario.safety.score = Math.max(
          0,
          sim.current.scenario.safety.score - 0.08,
        );
      }
    } else {
      sim.current.scenario.nearestSignalNodeId = null;
    }

    // Speeding
    const speedKmhLive = Math.abs(s.speed) * 3.6;
    if (speedKmhLive > limit.speedKmh + 8) {
      sim.current.scenario.safety.speeding += clampedDt;
      sim.current.scenario.safety.score = Math.max(
        0,
        sim.current.scenario.safety.score - clampedDt * 1.5,
      );
    }

    // Toll
    if (limit.roadClass === "toll" && !sim.current.scenario.tollPassed) {
      sim.current.scenario.tollPassed = true;
    }

    // Parking complete
    const bays = map.parking ?? [];
    let inBay = false;
    for (const bay of bays) {
      const p = parkingWorldPose(map, bay);
      const localX =
        Math.cos(-p.yaw) * (s.x - p.x) - Math.sin(-p.yaw) * (s.z - p.z);
      const localZ =
        Math.sin(-p.yaw) * (s.x - p.x) + Math.cos(-p.yaw) * (s.z - p.z);
      if (Math.abs(localX) < p.width / 2 && Math.abs(localZ) < p.depth / 2) {
        inBay = true;
        if (Math.abs(s.speed) < 0.35 && s.gear === "P") {
          sim.current.scenario.parking.completed = true;
        }
        break;
      }
    }
    sim.current.scenario.parking.inBay = inBay;
    sim.current.scenario.sessionSeconds += clampedDt;

    // Soft snap to planned route — 핸들 조작 중엔 거의 끄기
    const manualSteer = Math.min(1, Math.abs(steer) * 1.6);
    const guidePath =
      prefs.mode === "free" ? [] : pathPoints;
    if (guidePath.length > 1) {
      const onPath = projectOnPath(guidePath, s.x, s.z);
      if (onPath.dist > 1.1) {
        const pull =
          Math.min(1, (onPath.dist - 1.1) / 7) * 1.4 * clampedDt * (1 - manualSteer);
        s.x = THREE.MathUtils.lerp(s.x, onPath.x, pull);
        s.z = THREE.MathUtils.lerp(s.z, onPath.z, pull);
      }
      if (Math.abs(s.speed) > 0.4 && s.gear !== "R" && manualSteer < 0.22) {
        let dyaw = onPath.yaw - s.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        s.yaw += dyaw * Math.min(1, 0.7 * clampedDt) * (1 - manualSteer);
      }
    }

    pose.current.x = s.x;
    pose.current.z = s.z;
    pose.current.yaw = s.yaw;
    pose.current.eyeHeight = eyeHeight;

    if (group.current) {
      group.current.position.set(s.x, 0, s.z);
      group.current.rotation.y = s.yaw;
    }

    const back = 0.28;
    camera.position.set(
      s.x - Math.sin(s.yaw) * back,
      eyeHeight,
      s.z - Math.cos(s.yaw) * back,
    );
    camera.lookAt(
      s.x + Math.sin(s.yaw) * 14,
      eyeHeight - 0.05,
      s.z + Math.cos(s.yaw) * 14,
    );
    if ("fov" in camera) {
      (camera as THREE.PerspectiveCamera).fov = 68;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }

    const onPath =
      guidePath.length > 1 ? projectOnPath(guidePath, s.x, s.z) : null;
    const rem = onPath?.remaining ?? Math.hypot(
      (guidePath[guidePath.length - 1]?.x ?? s.x) - s.x,
      (guidePath[guidePath.length - 1]?.z ?? s.z) - s.z,
    );
    const eta =
      prefs.mode === "free"
        ? "연습"
        : rem < 6
          ? "도착"
          : Math.abs(s.speed) < 0.4
            ? "—"
            : `${Math.max(1, Math.round(rem / Math.abs(s.speed)))}s`;

    const speedKmh = Math.round(Math.abs(s.speed) * 3.6);
    const rpm = Math.min(
      7000,
      750 + speedKmh * 55 + (throttle > 0.4 ? 700 : 0),
    );

    const nav =
      prefs.mode === "free"
        ? {
            maneuver: "straight" as const,
            thenManeuver: null,
            instruction: "동네 연습 중",
            nextName: "자유 주행",
            distToNextM: 0,
            remainingM: 0,
            progress: 0,
            startName: "연습",
            goalName: "—",
          }
        : buildNavGuidance(pathPoints, s.x, s.z, s.yaw);

    onHud({
      speedKmh,
      gear: s.gear,
      eta,
      rpm: Math.round(rpm),
      turnSignal: c.hazard ? "off" : c.turnSignal,
      hazard: c.hazard,
      nav,
      speedLimitKmh: limit.speedKmh,
      signalPhase,
      safetyScore: Math.round(sim.current.scenario.safety.score),
      parkingInBay: sim.current.scenario.parking.inBay,
      parkingDone: sim.current.scenario.parking.completed,
      tollPassed: sim.current.scenario.tollPassed,
      timeOfDay: sim.current.scenario.timeOfDay,
      weather: sim.current.scenario.weather,
      roadClass: limit.roadClass,
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
  sim,
}: {
  map: RoadMap;
  pathPoints: PathPoint[];
  carColor: string;
  carScale: number;
  pose: React.MutableRefObject<VehiclePose>;
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
  roomRef: React.RefObject<HTMLDivElement | null>;
  sim: React.MutableRefObject<SimBag>;
}) {
  const track = (r: React.RefObject<HTMLDivElement | null>) =>
    r as unknown as React.RefObject<HTMLElement>;

  const scene = (opts?: { showCar?: boolean; showRoute?: boolean }) => (
    <WorldScene
      map={map}
      pathPoints={pathPoints}
      carColor={carColor}
      carScale={carScale}
      pose={pose}
      showCar={opts?.showCar ?? false}
      sim={sim}
      showRoute={opts?.showRoute ?? false}
    />
  );

  return (
    <>
      <View track={track(leftRef)}>
        <PerspectiveCamera makeDefault fov={64} near={0.12} far={240} />
        <color attach="background" args={["#7a9ab0"]} />
        {scene({ showCar: false, showRoute: false })}
        <MirrorCamera pose={pose} mode="left" />
      </View>
      <View track={track(rightRef)}>
        <PerspectiveCamera makeDefault fov={64} near={0.12} far={240} />
        <color attach="background" args={["#7a9ab0"]} />
        {scene({ showCar: false, showRoute: false })}
        <MirrorCamera pose={pose} mode="right" />
      </View>
      <View track={track(roomRef)}>
        <PerspectiveCamera makeDefault fov={56} near={0.12} far={240} />
        <color attach="background" args={["#7a9ab0"]} />
        {scene({ showCar: false, showRoute: false })}
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
  const mode = prefs.mode ?? "navigate";

  const sim = useRef<SimBag>({
    npcs: spawnNpcs(map, mode === "highway" ? 12 : 8),
    nowSec: 0,
    scenario: {
      ...createScenario(mode),
      timeOfDay: prefs.timeOfDay ?? "day",
      weather: prefs.weather ?? "clear",
    },
  });

  const controls = useRef<DriveControls>({
    steer: 0,
    throttle: 0,
    brake: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
    turnSignal: "off",
    hazard: false,
    wiper: "off",
  });
  const pose = useRef<VehiclePose>({ x: 0, z: 0, yaw: 0, eyeHeight: 1.2 });
  const [hud, setHud] = useState<HudState>({
    speedKmh: 0,
    gear: prefs.transmission === "auto" ? "D" : "1",
    eta: "—",
    rpm: 800,
    turnSignal: "off",
    hazard: false,
    nav: {
      maneuver: "depart",
      thenManeuver: null,
      instruction: "경로 안내 준비 중",
      nextName: "—",
      distToNextM: 0,
      remainingM: 0,
      progress: 0,
      startName: "—",
      goalName: "—",
    },
    speedLimitKmh: 50,
    signalPhase: "green",
    safetyScore: 100,
    parkingInBay: false,
    parkingDone: false,
    tollPassed: false,
    timeOfDay: prefs.timeOfDay ?? "day",
    weather: prefs.weather ?? "clear",
    roadClass: "urban",
  });

  const pathPoints = useMemo(() => {
    if (mode === "free") {
      const start = prefs.startNodeId;
      const next = Math.min(15, start + 1);
      return pathToPoints(map, [start, next === start ? (start + 4) % 16 : next]);
    }
    const goal = mode === "highway" ? 20 : prefs.goalNodeId;
    const start = mode === "highway" ? 7 : prefs.startNodeId;
    const path = astar(map, start, goal) ?? [start];
    return pathToPoints(map, path);
  }, [map, prefs, mode]);

  const vehicleMeta = VEHICLES.find((v) => v.id === prefs.vehicleId)!;
  const scale = prefs.vehicleId === "compact" ? 0.85 : prefs.vehicleId === "suv" ? 1.15 : 1;
  const showRoute = mode !== "free";
  const env = environmentPreset(sim.current.scenario.timeOfDay, sim.current.scenario.weather);

  useEffect(() => {
    setMirrorsReady(true);
  }, []);

  // Sync wiper with rain
  useEffect(() => {
    if (sim.current.scenario.weather === "rain" && controls.current.wiper === "off") {
      controls.current.wiper = "slow";
    }
  }, []);

  return (
    <div ref={rootRef} className="drive-root">
      <Canvas
        className="drive-canvas"
        eventSource={rootRef}
        eventPrefix="client"
        shadows
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <View.Port />
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
            sim={sim}
          />
        ) : null}
      </Canvas>

      {/* 메인 앞유리 View는 Canvas 바깥 HTML로 두어야 Port가 영역을 잡음 */}
      <View index={1} className="drive-road-view">
        <PerspectiveCamera makeDefault fov={68} near={0.05} far={280} />
        <color attach="background" args={[env.sky]} />
        <fog attach="fog" args={[env.fog, env.fogNear, env.fogFar]} />
        <WorldScene
          map={map}
          pathPoints={pathPoints}
          carColor={vehicleMeta.color}
          carScale={scale}
          pose={pose}
          showCar={false}
          sim={sim}
          showRoute={showRoute}
        />
        <Vehicle
          prefs={{ ...prefs, mode }}
          controls={controls}
          onHud={setHud}
          pose={pose}
          pathPoints={pathPoints}
          carColor={vehicleMeta.color}
          carScale={scale}
          map={map}
          sim={sim}
        />
      </View>

      <div className="mirror-slot-layer" aria-hidden>
        <div className="mirror-slot-wrap room">
          <div className="mirror-housing room">
            <div className="mirror-stem room" />
            <div className="mirror-glass-frame">
              <div ref={mirrorRoomRef} className="mirror-slot room" />
            </div>
          </div>
        </div>
        <div className="mirror-slot-wrap side left">
          <div className="mirror-arm" aria-hidden>
            <span className="mirror-arm-joint" />
            <span className="mirror-arm-shaft" />
            <span className="mirror-arm-base" />
          </div>
          <div className="mirror-housing side">
            <div className="mirror-glass-frame">
              <div ref={mirrorLeftRef} className="mirror-slot side" />
            </div>
          </div>
        </div>
        <div className="mirror-slot-wrap side right">
          <div className="mirror-arm" aria-hidden>
            <span className="mirror-arm-base" />
            <span className="mirror-arm-shaft" />
            <span className="mirror-arm-joint" />
          </div>
          <div className="mirror-housing side">
            <div className="mirror-glass-frame">
              <div ref={mirrorRightRef} className="mirror-slot side" />
            </div>
          </div>
        </div>
      </div>

      <WiperOverlay controls={controls} />

      <DriveHUD
        controls={controls}
        hud={hud}
        transmission={prefs.transmission}
        sim={sim}
        mode={mode}
      />
    </div>
  );
}
