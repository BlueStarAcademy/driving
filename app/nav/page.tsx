"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RoadMap, astar } from "@/lib/map";
import { loadDrivePrefs, saveDrivePrefs } from "@/lib/session-prefs";

export default function NavPage() {
  const router = useRouter();
  const [map, setMap] = useState<RoadMap | null>(null);
  const [startNodeId, setStart] = useState(0);
  const [goalNodeId, setGoal] = useState(15);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/maps/yeouido_sample.json")
      .then((r) => r.json())
      .then((data: RoadMap) => setMap(data))
      .catch(() => setError("맵을 불러오지 못했습니다."));
  }, []);

  const pathOk = useMemo(() => {
    if (!map) return false;
    return !!astar(map, startNodeId, goalNodeId);
  }, [map, startNodeId, goalNodeId]);

  function startDrive(quick = false) {
    const prefs = loadDrivePrefs() ?? {
      vehicleId: "sedan" as const,
      transmission: "auto" as const,
      startNodeId: 0,
      goalNodeId: 15,
    };
    const next = {
      ...prefs,
      startNodeId: quick ? 0 : startNodeId,
      goalNodeId: quick ? 15 : goalNodeId,
    };
    if (!map || !astar(map, next.startNodeId, next.goalNodeId)) {
      setError("경로를 찾을 수 없습니다.");
      return;
    }
    saveDrivePrefs(next);
    router.push("/drive");
  }

  return (
    <main className="page">
      <h1>내비</h1>
      <p className="sub">여의도 샘플 맵 — 출발/도착 노드를 고르거나 바로 시작하세요.</p>

      <div className="choice-grid cols-2">
        <label>
          출발 노드
          <select
            value={startNodeId}
            onChange={(e) => setStart(Number(e.target.value))}
            disabled={!map}
          >
            {(map?.nodes ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                #{n.id} ({n.lat.toFixed(4)}, {n.lon.toFixed(4)})
              </option>
            ))}
          </select>
        </label>
        <label>
          도착 노드
          <select
            value={goalNodeId}
            onChange={(e) => setGoal(Number(e.target.value))}
            disabled={!map}
          >
            {(map?.nodes ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                #{n.id} ({n.lat.toFixed(4)}, {n.lon.toFixed(4)})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="sub">
        경로: {pathOk ? "가능" : map ? "불가" : "맵 로딩…"} · 노드 {map?.nodes.length ?? "—"} · 도로{" "}
        {map?.edges.length ?? "—"}
      </p>
      {error ? <p className="form-error">{error}</p> : null}

      <div className="actions">
        <button type="button" className="btn-primary" onClick={() => startDrive(false)} disabled={!map}>
          운전 시작
        </button>
        <button type="button" className="btn-ghost" onClick={() => startDrive(true)} disabled={!map}>
          빠른 시작 (0→15)
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/garage")}>
          차고로
        </button>
      </div>
    </main>
  );
}
