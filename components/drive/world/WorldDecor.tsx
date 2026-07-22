"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { RoadMap, nodePositions, parkingWorldPose } from "@/lib/map";
import { signalPhaseAt } from "@/lib/scenario";
import type { NpcVehicle } from "@/lib/traffic/npc";

export function WorldRoads({ map, wet }: { map: RoadMap; wet: boolean }) {
  const pos = useMemo(() => nodePositions(map), [map]);
  const meshes = useMemo(() => {
    return map.edges.map((e, i) => {
      const a = pos.get(e.from)!;
      const b = pos.get(e.to)!;
      const mid: [number, number, number] = [(a[0] + b[0]) / 2, 0.02, (a[1] + b[1]) / 2];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
      const lanes = e.lanes;
      const width = (e.roadClass === "highway" ? 3.6 : 3.3) * lanes;
      return { key: i, mid, len, angle, width, lanes, roadClass: e.roadClass ?? "urban", from: a, to: b };
    });
  }, [map, pos]);

  const asphalt = wet ? "#1a1e24" : "#2a2e34";
  const line = wet ? "#c8b060" : "#e8c84a";

  return (
    <group>
      {meshes.map((m) => (
        <group key={m.key}>
          {/* sidewalk / curb */}
          <mesh position={[m.mid[0], -0.05, m.mid[2]]} rotation={[0, m.angle, 0]} receiveShadow>
            <boxGeometry args={[m.width + 4.8, 0.08, m.len + 2.4]} />
            <meshStandardMaterial color="#7a828c" roughness={0.95} />
          </mesh>
          <mesh position={m.mid} rotation={[0, m.angle, 0]} receiveShadow>
            <boxGeometry args={[m.width, 0.12, m.len + 1.4]} />
            <meshStandardMaterial
              color={m.roadClass === "highway" ? "#222830" : asphalt}
              roughness={wet ? 0.28 : 0.88}
              metalness={wet ? 0.22 : 0.02}
            />
          </mesh>
          {/* dashed center line */}
          {Array.from({ length: Math.max(2, Math.floor(m.len / 4)) }).map((_, di) => {
            const t = (di + 0.5) / Math.max(2, Math.floor(m.len / 4)) - 0.5;
            const ox = Math.sin(m.angle) * t * m.len;
            const oz = Math.cos(m.angle) * t * m.len;
            return (
              <mesh
                key={`dash-${di}`}
                position={[m.mid[0] + ox, 0.08, m.mid[2] + oz]}
                rotation={[0, m.angle, 0]}
              >
                <boxGeometry args={[0.14, 0.02, 1.6]} />
                <meshStandardMaterial color={line} roughness={0.5} />
              </mesh>
            );
          })}
          {/* edge lines */}
          {[-1, 1].map((side) => (
            <mesh
              key={side}
              position={[
                m.mid[0] + Math.cos(m.angle) * side * (m.width * 0.48),
                0.08,
                m.mid[2] - Math.sin(m.angle) * side * (m.width * 0.48),
              ]}
              rotation={[0, m.angle, 0]}
            >
              <boxGeometry args={[0.12, 0.015, m.len * 0.95]} />
              <meshStandardMaterial color="#f0f4f8" roughness={0.65} />
            </mesh>
          ))}
          {m.roadClass === "urban" ? (
            <mesh
              position={[
                m.mid[0] + Math.sin(m.angle) * (m.len * 0.42),
                0.09,
                m.mid[2] + Math.cos(m.angle) * (m.len * 0.42),
              ]}
              rotation={[0, m.angle, 0]}
            >
              <boxGeometry args={[m.width * 0.85, 0.02, 0.45]} />
              <meshStandardMaterial color="#f2f4f6" />
            </mesh>
          ) : null}
          {m.roadClass === "toll" ? (
            <mesh position={[m.mid[0], 3.2, m.mid[2]]} rotation={[0, m.angle, 0]}>
              <boxGeometry args={[m.width + 2, 0.4, 1.2]} />
              <meshStandardMaterial color="#3a4550" />
            </mesh>
          ) : null}
        </group>
      ))}
      {map.nodes.map((n) => {
        const p = pos.get(n.id)!;
        return (
          <mesh key={`j-${n.id}`} position={[p[0], 0.02, p[1]]} receiveShadow>
            <cylinderGeometry args={[5.6, 5.6, 0.1, 24]} />
            <meshStandardMaterial color={asphalt} roughness={wet ? 0.35 : 0.88} />
          </mesh>
        );
      })}
    </group>
  );
}

export function WorldBuildings({ map }: { map: RoadMap }) {
  const pos = useMemo(() => nodePositions(map), [map]);
  const buildings = useMemo(() => {
    const list: {
      key: string;
      pos: [number, number, number];
      size: [number, number, number];
      color: string;
      windows: { x: number; y: number; z: number; lit: boolean }[];
    }[] = [];
    const palette = ["#6a7480", "#525c68", "#8a94a0", "#44505c", "#a8b0b8", "#5a6a5a", "#7a6a5a"];
    for (const n of map.nodes) {
      if (n.id > 15) continue;
      const p = pos.get(n.id)!;
      for (let k = 0; k < 4; k++) {
        const side = k % 2 === 0 ? 1 : -1;
        const ox = (15 + (n.id * 3 + k * 5) % 12) * side;
        const oz = ((n.id * 7 + k * 11) % 21) - 10;
        const h = 8 + ((n.id * 5 + k * 3) % 18);
        const w = 5.5 + (k % 3);
        const d = 4.5 + ((k + n.id) % 4);
        const windows: { x: number; y: number; z: number; lit: boolean }[] = [];
        const floors = Math.max(2, Math.floor(h / 2.4));
        for (let f = 0; f < floors; f++) {
          for (let col = 0; col < 3; col++) {
            windows.push({
              x: -w * 0.28 + col * (w * 0.28),
              y: -h / 2 + 1.4 + f * 2.2,
              z: d / 2 + 0.03,
              lit: (n.id + k + f + col) % 4 !== 0,
            });
          }
        }
        list.push({
          key: `${n.id}-${k}`,
          pos: [p[0] + ox, h / 2, p[1] + oz],
          size: [w, h, d],
          color: palette[(n.id + k) % palette.length],
          windows,
        });
      }
    }
    return list;
  }, [map, pos]);

  return (
    <group>
      {buildings.map((b) => (
        <group key={b.key} position={b.pos}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={b.color} roughness={0.82} metalness={0.08} />
          </mesh>
          {/* roof ledge */}
          <mesh position={[0, b.size[1] / 2 + 0.12, 0]}>
            <boxGeometry args={[b.size[0] + 0.35, 0.25, b.size[2] + 0.35]} />
            <meshStandardMaterial color="#2a3038" roughness={0.9} />
          </mesh>
          {b.windows.map((w, i) => (
            <mesh key={i} position={[w.x, w.y, w.z]}>
              <boxGeometry args={[0.7, 0.95, 0.06]} />
              <meshStandardMaterial
                color={w.lit ? "#c8e0f5" : "#1a2430"}
                emissive={w.lit ? "#8ab4d8" : "#000"}
                emissiveIntensity={w.lit ? 0.55 : 0}
                roughness={0.25}
                metalness={0.35}
              />
            </mesh>
          ))}
        </group>
      ))}
      {map.nodes
        .filter((n) => n.id % 2 === 0 && n.id <= 15)
        .map((n) => {
          const p = pos.get(n.id)!;
          return (
            <group key={`lamp-${n.id}`} position={[p[0] + 7.5, 0, p[1] + 7.5]}>
              <mesh position={[0, 3.2, 0]}>
                <cylinderGeometry args={[0.07, 0.1, 6.4, 8]} />
                <meshStandardMaterial color="#2a3038" metalness={0.4} roughness={0.45} />
              </mesh>
              <mesh position={[0, 6.4, 0.15]} rotation={[0.4, 0, 0]}>
                <boxGeometry args={[0.35, 0.12, 0.55]} />
                <meshStandardMaterial color="#1a1e22" />
              </mesh>
              <mesh position={[0, 6.25, 0.35]}>
                <sphereGeometry args={[0.22, 12, 12]} />
                <meshStandardMaterial color="#f5e6b8" emissive="#f0d078" emissiveIntensity={0.85} />
              </mesh>
              <pointLight position={[0, 6.1, 0.4]} intensity={0.55} distance={18} color="#ffe8b0" />
            </group>
          );
        })}
    </group>
  );
}

function SignalHead({
  position,
  cycleSeconds,
  nowSecRef,
}: {
  position: [number, number, number];
  cycleSeconds: number;
  nowSecRef: React.MutableRefObject<number>;
}) {
  const red = useRef<THREE.MeshStandardMaterial>(null);
  const yellow = useRef<THREE.MeshStandardMaterial>(null);
  const green = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    const phase = signalPhaseAt(cycleSeconds, nowSecRef.current);
    if (red.current) red.current.emissiveIntensity = phase === "red" ? 3.2 : 0.15;
    if (yellow.current) yellow.current.emissiveIntensity = phase === "yellow" ? 2.8 : 0.12;
    if (green.current) green.current.emissiveIntensity = phase === "green" ? 3.2 : 0.12;
  });
  return (
    <group position={position}>
      <mesh position={[0, 2.4, 0]}>
        <boxGeometry args={[0.35, 4.8, 0.35]} />
        <meshStandardMaterial color="#1a1e22" />
      </mesh>
      <mesh position={[0, 4.6, 0.28]}>
        <boxGeometry args={[0.55, 1.6, 0.35]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <mesh position={[0, 5.1, 0.48]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial ref={red} color="#ff3b30" emissive="#ff3b30" emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, 4.6, 0.48]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial ref={yellow} color="#ffcc00" emissive="#ffcc00" emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[0, 4.1, 0.48]}>
        <sphereGeometry args={[0.16, 10, 10]} />
        <meshStandardMaterial ref={green} color="#34c759" emissive="#34c759" emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

export function TrafficSignals({
  map,
  nowSecRef,
}: {
  map: RoadMap;
  nowSecRef: React.MutableRefObject<number>;
}) {
  const pos = useMemo(() => nodePositions(map), [map]);
  return (
    <group>
      {map.signals.map((s) => {
        const p = pos.get(s.nodeId);
        if (!p) return null;
        return (
          <SignalHead
            key={s.nodeId}
            position={[p[0] + 3.5, 0, p[1] + 3.5]}
            cycleSeconds={s.cycleSeconds}
            nowSecRef={nowSecRef}
          />
        );
      })}
    </group>
  );
}

export function SpeedSigns({ map }: { map: RoadMap }) {
  const pos = useMemo(() => nodePositions(map), [map]);
  const signs = useMemo(() => {
    const out: { key: string; x: number; z: number; limit: number }[] = [];
    for (const e of map.edges) {
      if (e.from > e.to) continue;
      const a = pos.get(e.from)!;
      const midX = (a[0] + pos.get(e.to)![0]) / 2;
      const midZ = (a[1] + pos.get(e.to)![1]) / 2;
      out.push({ key: `${e.from}-${e.to}`, x: midX + 4.5, z: midZ + 1.2, limit: e.speedKmh });
    }
    return out.filter((_, i) => i % 3 === 0);
  }, [map, pos]);

  return (
    <group>
      {signs.map((s) => (
        <group key={s.key} position={[s.x, 0, s.z]}>
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.06, 0.07, 3.2, 8]} />
            <meshStandardMaterial color="#444" />
          </mesh>
          <mesh position={[0, 3.35, 0]} rotation={[0, 0.4, 0]}>
            <circleGeometry args={[0.55, 24]} />
            <meshStandardMaterial color="#f5f5f5" />
          </mesh>
          <mesh position={[0, 3.35, 0.02]} rotation={[0, 0.4, 0]}>
            <ringGeometry args={[0.42, 0.55, 24]} />
            <meshStandardMaterial color="#e53935" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function ParkingBays({ map }: { map: RoadMap }) {
  const bays = map.parking ?? [];
  return (
    <group>
      {bays.map((bay) => {
        const p = parkingWorldPose(map, bay);
        return (
          <mesh
            key={bay.id}
            position={[p.x, 0.04, p.z]}
            rotation={[0, p.yaw, 0]}
            receiveShadow
          >
            <boxGeometry args={[p.width + 0.4, 0.05, p.depth + 0.4]} />
            <meshStandardMaterial color="#3a6ea5" transparent opacity={0.55} />
          </mesh>
        );
      })}
    </group>
  );
}

export function TollPlaza({ map }: { map: RoadMap }) {
  const pos = useMemo(() => nodePositions(map), [map]);
  const tollNode = pos.get(20);
  if (!tollNode) return null;
  return (
    <group position={[tollNode[0], 0, tollNode[1]]}>
      <mesh position={[0, 2.5, 0]}>
        <boxGeometry args={[14, 0.5, 3]} />
        <meshStandardMaterial color="#2a3340" />
      </mesh>
      {[-4, 0, 4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[0.35, 3, 0.35]} />
            <meshStandardMaterial color="#1a1e22" />
          </mesh>
          <mesh position={[0, 3.2, 0.4]}>
            <boxGeometry args={[1.8, 0.7, 0.2]} />
            <meshStandardMaterial color="#0a7a4a" emissive="#0a7a4a" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function RainFX({ isActive }: { isActive: () => boolean }) {
  const group = useRef<THREE.Group>(null);
  const drops = useMemo(() => {
    const arr: [number, number, number][] = [];
    for (let i = 0; i < 180; i++) {
      arr.push([(Math.random() - 0.5) * 60, Math.random() * 25, (Math.random() - 0.5) * 60]);
    }
    return arr;
  }, []);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    g.visible = isActive();
    if (!g.visible) return;
    for (const child of g.children) {
      child.position.y -= 18 * dt;
      if (child.position.y < 0) child.position.y = 22;
    }
  });
  return (
    <group ref={group}>
      {drops.map((d, i) => (
        <mesh key={i} position={d}>
          <boxGeometry args={[0.02, 0.35, 0.02]} />
          <meshBasicMaterial color="#a8c4d8" transparent opacity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

export function NpcCars({
  getNpcs,
}: {
  getNpcs: () => NpcVehicle[];
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const root = group.current;
    if (!root) return;
    const npcs = getNpcs();
    while (root.children.length < npcs.length) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.65, 3.7),
        new THREE.MeshStandardMaterial({ color: "#ccc", roughness: 0.4, metalness: 0.25 }),
      );
      body.position.y = 0.52;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.55, 0.55, 1.7),
        new THREE.MeshStandardMaterial({
          color: "#9ec8e8",
          transparent: true,
          opacity: 0.5,
          metalness: 0.4,
          roughness: 0.2,
        }),
      );
      cabin.position.set(0, 1.0, -0.2);
      const lightL = new THREE.Mesh(
        new THREE.BoxGeometry(0.35, 0.18, 0.12),
        new THREE.MeshStandardMaterial({ color: "#fff8e0", emissive: "#ffe8a0", emissiveIntensity: 0.8 }),
      );
      lightL.position.set(-0.55, 0.45, 1.85);
      const lightR = lightL.clone();
      lightR.position.x = 0.55;
      g.add(body);
      g.add(cabin);
      g.add(lightL);
      g.add(lightR);
      root.add(g);
    }
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      const g = root.children[i] as THREE.Group;
      const scale = n.kind === "bus" ? 1.45 : n.kind === "taxi" ? 1.05 : 1;
      g.position.set(n.x, 0, n.z);
      g.rotation.y = n.yaw;
      g.scale.setScalar(scale);
      const body = g.children[0] as THREE.Mesh;
      (body.material as THREE.MeshStandardMaterial).color.set(n.color);
    }
  });
  return <group ref={group} />;
}

export function Crosswalks({ map }: { map: RoadMap }) {
  const pos = useMemo(() => nodePositions(map), [map]);
  return (
    <group>
      {map.signals.map((s) => {
        const p = pos.get(s.nodeId);
        if (!p) return null;
        return (
          <group key={`cw-${s.nodeId}`} position={[p[0], 0.05, p[1]]}>
            {Array.from({ length: 6 }).map((_, i) => (
              <mesh key={i} position={[(i - 2.5) * 0.7, 0, 4.2]}>
                <boxGeometry args={[0.45, 0.02, 2.4]} />
                <meshStandardMaterial color="#f0f2f4" />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}
