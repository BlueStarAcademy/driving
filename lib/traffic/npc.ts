import type { RoadMap } from "@/lib/map";
import { buildAdjacency, nodePositions } from "@/lib/map";
import { signalPhaseAt } from "@/lib/scenario";

export type NpcKind = "sedan" | "taxi" | "bus";

export type NpcVehicle = {
  id: number;
  kind: NpcKind;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  path: number[];
  pathIndex: number;
  color: string;
};

const COLORS: Record<NpcKind, string[]> = {
  sedan: ["#d8dee6", "#3a4550", "#5a7a9a", "#8b5a4a"],
  taxi: ["#f0c040", "#e8b820"],
  bus: ["#2f6b4f", "#3d6a8a"],
};

function pickPath(map: RoadMap, start: number, length = 6): number[] {
  const { adj } = buildAdjacency(map);
  const path = [start];
  let cur = start;
  const used = new Set<string>();
  for (let i = 0; i < length; i++) {
    const opts = (adj.get(cur) ?? []).filter((n) => !used.has(`${cur}-${n.to}`));
    if (!opts.length) break;
    const next = opts[Math.floor(Math.random() * opts.length)].to;
    used.add(`${cur}-${next}`);
    path.push(next);
    cur = next;
  }
  return path.length >= 2 ? path : [start, (adj.get(start)?.[0]?.to ?? start)];
}

export function spawnNpcs(map: RoadMap, count = 8): NpcVehicle[] {
  const pos = nodePositions(map);
  const nodes = map.nodes.map((n) => n.id);
  const npcs: NpcVehicle[] = [];
  for (let i = 0; i < count; i++) {
    const start = nodes[i % nodes.length];
    const kind: NpcKind = i % 5 === 0 ? "bus" : i % 3 === 0 ? "taxi" : "sedan";
    const path = pickPath(map, start, 5 + (i % 4));
    const p = pos.get(path[0])!;
    const n = pos.get(path[1]) ?? p;
    const palette = COLORS[kind];
    npcs.push({
      id: i,
      kind,
      x: p[0] + ((i % 3) - 1) * 0.6,
      z: p[1] + ((i % 2) * 0.4),
      yaw: Math.atan2(n[0] - p[0], n[1] - p[1]),
      speed: kind === "bus" ? 6 : kind === "taxi" ? 9 : 8,
      path,
      pathIndex: 0,
      color: palette[i % palette.length],
    });
  }
  return npcs;
}

export function updateNpcs(
  npcs: NpcVehicle[],
  map: RoadMap,
  dt: number,
  nowSec: number,
  player: { x: number; z: number; speed: number },
): { npcs: NpcVehicle[]; nearMiss: boolean } {
  const pos = nodePositions(map);
  const signalMap = new Map(map.signals.map((s) => [s.nodeId, s.cycleSeconds]));
  let nearMiss = false;

  const next = npcs.map((npc) => {
    const copy = { ...npc };
    if (copy.pathIndex >= copy.path.length - 1) {
      copy.path = pickPath(map, copy.path[copy.path.length - 1], 6);
      copy.pathIndex = 0;
    }
    const aId = copy.path[copy.pathIndex];
    const bId = copy.path[copy.pathIndex + 1];
    const a = pos.get(aId)!;
    const b = pos.get(bId)!;
    const dx = b[0] - copy.x;
    const dz = b[1] - copy.z;
    const dist = Math.hypot(dx, dz);

    // 신호 정지
    let maxSpeed = copy.kind === "bus" ? 7 : 10;
    const phase = signalMap.has(bId)
      ? signalPhaseAt(signalMap.get(bId)!, nowSec)
      : "green";
    if (phase === "red" && dist < 14) maxSpeed = Math.min(maxSpeed, dist < 4 ? 0 : 2);
    if (phase === "yellow" && dist < 10) maxSpeed = Math.min(maxSpeed, 4);

    // 플레이어 간격
    const pd = Math.hypot(player.x - copy.x, player.z - copy.z);
    if (pd < 6) {
      maxSpeed *= 0.35;
      if (pd < 3.2) nearMiss = true;
    }

    const targetYaw = Math.atan2(dx, dz);
    let dyaw = targetYaw - copy.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    copy.yaw += dyaw * Math.min(1, 3 * dt);
    copy.speed += (maxSpeed - copy.speed) * Math.min(1, 2 * dt);
    copy.x += Math.sin(copy.yaw) * copy.speed * dt;
    copy.z += Math.cos(copy.yaw) * copy.speed * dt;

    if (dist < 2.2) copy.pathIndex += 1;
    return copy;
  });

  return { npcs: next, nearMiss };
}
