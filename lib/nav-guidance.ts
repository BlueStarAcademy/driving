export const PLACE_NAMES: Record<number, string> = {
  0: "여의도공원 남문",
  1: "국회대로 입구",
  2: "여의도역 방향",
  3: "파크원 북측",
  4: "한강공원 진입",
  5: "여의도환승센터",
  6: "IFC 교차로",
  7: "63빌딩 방향",
  8: "샛강생태공원",
  9: "국제금융로",
  10: "여의도중학로",
  11: "윤중로 북단",
  12: "여의도한강공원",
  13: "여의서로",
  14: "여의동로",
  15: "국회의사당역",
  16: "올림픽대로 IC",
  17: "여의도 JC",
  18: "강변북로 본선",
  19: "성산대교 방향",
  20: "하이패스 톨게이트",
};

export function placeName(id: number) {
  return PLACE_NAMES[id] ?? `지점 #${id}`;
}

export type NavManeuver = "straight" | "left" | "right" | "arrive" | "depart";

export type NavGuidance = {
  maneuver: NavManeuver;
  thenManeuver: NavManeuver | null;
  instruction: string;
  nextName: string;
  distToNextM: number;
  remainingM: number;
  progress: number;
  startName: string;
  goalName: string;
};

function normalizeAngle(a: number) {
  let t = a;
  while (t > Math.PI) t -= Math.PI * 2;
  while (t < -Math.PI) t += Math.PI * 2;
  return t;
}

/** 노드 `at` 에서의 회전. yaw=atan2(dx,dz), +회전 = 우회전 */
function turnAtNode(
  pathPoints: { x: number; z: number }[],
  at: number,
): { maneuver: NavManeuver; turn: number } {
  if (at <= 0 || at >= pathPoints.length - 1) {
    return { maneuver: at >= pathPoints.length - 1 ? "arrive" : "straight", turn: 0 };
  }
  const prev = pathPoints[at - 1];
  const cur = pathPoints[at];
  const next = pathPoints[at + 1];
  const inYaw = Math.atan2(cur.x - prev.x, cur.z - prev.z);
  const outYaw = Math.atan2(next.x - cur.x, next.z - cur.z);
  const turn = normalizeAngle(outYaw - inYaw);
  if (Math.abs(turn) <= 0.45) return { maneuver: "straight", turn };
  // +turn: 진행 방향 기준 오른쪽으로 꺾임
  return { maneuver: turn > 0 ? "right" : "left", turn };
}

function instructionFor(maneuver: NavManeuver) {
  switch (maneuver) {
    case "left":
      return "좌회전하세요";
    case "right":
      return "우회전하세요";
    case "arrive":
      return "목적지에 도착했습니다";
    case "depart":
      return "경로를 따라 출발하세요";
    default:
      return "직진하세요";
  }
}

export function buildNavGuidance(
  pathPoints: { id: number; x: number; z: number }[],
  x: number,
  z: number,
  yaw: number,
): NavGuidance {
  const startName = placeName(pathPoints[0]?.id ?? 0);
  const goalName = placeName(pathPoints[pathPoints.length - 1]?.id ?? 0);

  if (pathPoints.length < 2) {
    return {
      maneuver: "arrive",
      thenManeuver: null,
      instruction: "목적지에 도착했습니다",
      nextName: goalName,
      distToNextM: 0,
      remainingM: 0,
      progress: 1,
      startName,
      goalName,
    };
  }

  let bestDist = Infinity;
  let bestSeg = 0;
  let bestT = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const ax = pathPoints[i].x;
    const az = pathPoints[i].z;
    const bx = pathPoints[i + 1].x;
    const bz = pathPoints[i + 1].z;
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
    }
  }

  let remaining = 0;
  let total = 0;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const len = Math.hypot(
      pathPoints[i + 1].x - pathPoints[i].x,
      pathPoints[i + 1].z - pathPoints[i].z,
    );
    total += len;
    if (i < bestSeg) continue;
    remaining += i === bestSeg ? (1 - bestT) * len : len;
  }

  if (remaining < 8) {
    return {
      maneuver: "arrive",
      thenManeuver: null,
      instruction: "목적지에 도착했습니다",
      nextName: goalName,
      distToNextM: Math.round(remaining),
      remainingM: Math.round(remaining),
      progress: 1,
      startName,
      goalName,
    };
  }

  // 다가오는 유의미한 기동(직진 제외)을 찾아 안내
  let primaryNode = bestSeg + 1;
  let primary = turnAtNode(pathPoints, primaryNode);
  for (let i = bestSeg + 1; i < pathPoints.length - 1; i++) {
    const t = turnAtNode(pathPoints, i);
    if (t.maneuver !== "straight") {
      primaryNode = i;
      primary = t;
      break;
    }
    primaryNode = i;
    primary = t;
  }

  let thenManeuver: NavManeuver | null = null;
  for (let i = primaryNode + 1; i < pathPoints.length - 1; i++) {
    const t = turnAtNode(pathPoints, i);
    if (t.maneuver !== "straight") {
      thenManeuver = t.maneuver;
      break;
    }
  }
  if (!thenManeuver && primaryNode < pathPoints.length - 1) {
    // 다음이 목적지 직전이면 도착 표시
    if (primaryNode + 1 >= pathPoints.length - 1) {
      thenManeuver = "arrive";
    }
  }

  let distToManeuver = 0;
  for (let i = bestSeg; i < primaryNode; i++) {
    const a = pathPoints[i];
    const b = pathPoints[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (i === bestSeg) distToManeuver += (1 - bestT) * len;
    else distToManeuver += len;
  }

  let maneuver: NavManeuver = primary.maneuver;
  let instruction = instructionFor(maneuver);

  if (bestSeg === 0 && bestT < 0.15 && remaining > total * 0.85) {
    maneuver = "depart";
    instruction = "경로를 따라 출발하세요";
    // 출발 직후엔 바로 이어질 방향을 then으로, 메인은 직진/출발
    if (primary.maneuver !== "straight" && primary.maneuver !== "arrive") {
      thenManeuver = primary.maneuver;
    }
  }

  void yaw;

  return {
    maneuver,
    thenManeuver: thenManeuver === maneuver ? null : thenManeuver,
    instruction,
    nextName: placeName(pathPoints[primaryNode]?.id ?? pathPoints[pathPoints.length - 1].id),
    distToNextM: Math.round(distToManeuver),
    remainingM: Math.round(remaining),
    progress: total > 0 ? 1 - remaining / total : 0,
    startName,
    goalName,
  };
}
