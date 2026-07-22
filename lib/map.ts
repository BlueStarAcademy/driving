export type MapNode = { id: number; lat: number; lon: number };
export type MapEdge = {
  from: number;
  to: number;
  speedKmh: number;
  lanes: number;
  oneway: boolean;
};
export type RoadMap = {
  name: string;
  originLat: number;
  originLon: number;
  metersPerUnit: number;
  nodes: MapNode[];
  edges: MapEdge[];
  signals: { nodeId: number; cycleSeconds: number }[];
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
  const adj = new Map<number, { to: number; cost: number; speedKmh: number }[]>();
  const pos = nodePositions(map);
  const add = (from: number, to: number, speedKmh: number) => {
    const a = pos.get(from)!;
    const b = pos.get(to)!;
    const cost = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from)!.push({ to, cost, speedKmh });
  };
  for (const e of map.edges) {
    add(e.from, e.to, e.speedKmh);
    if (!e.oneway) add(e.to, e.from, e.speedKmh);
  }
  return { adj, pos };
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
