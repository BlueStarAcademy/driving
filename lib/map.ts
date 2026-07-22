export type MapNode = { id: number; lat: number; lon: number };
export type RoadClass = "urban" | "highway" | "ramp" | "toll";
export type MapEdge = {
  from: number;
  to: number;
  speedKmh: number;
  lanes: number;
  oneway: boolean;
  roadClass?: RoadClass;
};
export type ParkingBay = {
  id: string;
  nodeId: number;
  offsetX: number;
  offsetZ: number;
  width: number;
  depth: number;
  yaw: number;
};
export type RoadMap = {
  name: string;
  originLat: number;
  originLon: number;
  metersPerUnit: number;
  nodes: MapNode[];
  edges: MapEdge[];
  signals: { nodeId: number; cycleSeconds: number }[];
  parking?: ParkingBay[];
};

const R = 6371000;

export function latLonToLocal(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): [number, number] {
  const x =
    ((lon - originLon) * Math.PI) /
    180 *
    R *
    Math.cos((originLat * Math.PI) / 180);
  const z = ((lat - originLat) * Math.PI) / 180 * R;
  return [x, -z];
}

export function nodePositions(map: RoadMap) {
  const out = new Map<number, [number, number]>();
  for (const n of map.nodes) {
    out.set(n.id, latLonToLocal(n.lat, n.lon, map.originLat, map.originLon));
  }
  return out;
}

export function buildAdjacency(map: RoadMap) {
  const adj = new Map<number, { to: number; cost: number; speedKmh: number; roadClass: RoadClass }[]>();
  const pos = nodePositions(map);
  const add = (from: number, to: number, speedKmh: number, roadClass: RoadClass) => {
    const a = pos.get(from)!;
    const b = pos.get(to)!;
    const cost = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, cost, speedKmh, roadClass });
  };
  for (const e of map.edges) {
    const rc = e.roadClass ?? "urban";
    add(e.from, e.to, e.speedKmh, rc);
    if (!e.oneway) add(e.to, e.from, e.speedKmh, rc);
  }
  return { adj, pos };
}

export function speedLimitNear(
  map: RoadMap,
  x: number,
  z: number,
): { speedKmh: number; roadClass: RoadClass } {
  const pos = nodePositions(map);
  let best = Infinity;
  let speedKmh = 50;
  let roadClass: RoadClass = "urban";
  for (const e of map.edges) {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const abx = b[0] - a[0];
    const abz = b[1] - a[1];
    const len2 = abx * abx + abz * abz || 1;
    let t = ((x - a[0]) * abx + (z - a[1]) * abz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + abx * t;
    const pz = a[1] + abz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      speedKmh = e.speedKmh;
      roadClass = e.roadClass ?? "urban";
    }
  }
  return { speedKmh, roadClass };
}

export function nearestSignal(
  map: RoadMap,
  x: number,
  z: number,
  maxDist = 28,
): { nodeId: number; cycleSeconds: number; dist: number } | null {
  const pos = nodePositions(map);
  let best: { nodeId: number; cycleSeconds: number; dist: number } | null = null;
  for (const s of map.signals) {
    const p = pos.get(s.nodeId);
    if (!p) continue;
    const d = Math.hypot(x - p[0], z - p[1]);
    if (d > maxDist) continue;
    if (!best || d < best.dist) best = { nodeId: s.nodeId, cycleSeconds: s.cycleSeconds, dist: d };
  }
  return best;
}

export function astar(
  map: RoadMap,
  startId: number,
  goalId: number,
): number[] | null {
  const { adj, pos } = buildAdjacency(map);
  const open = new Set<number>([startId]);
  const came = new Map<number, number>();
  const g = new Map<number, number>([[startId, 0]]);
  const f = new Map<number, number>([
    [
      startId,
      Math.hypot(
        pos.get(startId)![0] - pos.get(goalId)![0],
        pos.get(startId)![1] - pos.get(goalId)![1],
      ),
    ],
  ]);

  while (open.size) {
    let current = -1;
    let best = Infinity;
    for (const id of open) {
      const score = f.get(id) ?? Infinity;
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current === goalId) {
      const path = [current];
      while (came.has(current)) {
        current = came.get(current)!;
        path.unshift(current);
      }
      return path;
    }
    open.delete(current);
    for (const n of adj.get(current) ?? []) {
      const tentative = (g.get(current) ?? Infinity) + n.cost;
      if (tentative < (g.get(n.to) ?? Infinity)) {
        came.set(n.to, current);
        g.set(n.to, tentative);
        const h = Math.hypot(
          pos.get(n.to)![0] - pos.get(goalId)![0],
          pos.get(n.to)![1] - pos.get(goalId)![1],
        );
        f.set(n.to, tentative + h);
        open.add(n.to);
      }
    }
  }
  return null;
}

export function pathToPoints(map: RoadMap, path: number[]) {
  const pos = nodePositions(map);
  return path.map((id) => {
    const p = pos.get(id)!;
    return { id, x: p[0], z: p[1] };
  });
}

export function parkingWorldPose(map: RoadMap, bay: ParkingBay) {
  const pos = nodePositions(map);
  const p = pos.get(bay.nodeId)!;
  return {
    x: p[0] + bay.offsetX,
    z: p[1] + bay.offsetZ,
    yaw: bay.yaw,
    width: bay.width,
    depth: bay.depth,
  };
}
