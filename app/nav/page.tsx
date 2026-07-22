"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RoadMap, astar } from "@/lib/map";
import { loadDrivePrefs, saveDrivePrefs } from "@/lib/session-prefs";
import { NavMapPicker } from "@/components/NavMapPicker";
import { placeName } from "@/lib/nav-guidance";

export default function NavPage() {
  const router = useRouter();
  const [map, setMap] = useState<RoadMap | null>(null);
  const [startNodeId, setStart] = useState<number | null>(null);
  const [goalNodeId, setGoal] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/maps/yeouido_sample.json")
      .then((r) => r.json())
      .then((data: RoadMap) => setMap(data))
      .catch(() => setError("맵을 불러오지 못했습니다."));
  }, []);

  const pathOk =
    map != null &&
    startNodeId != null &&
    goalNodeId != null &&
    !!astar(map, startNodeId, goalNodeId);

  function startDrive() {
    if (startNodeId == null || goalNodeId == null || !map) {
      setError("출발지와 도착지를 순서대로 선택하세요.");
      return;
    }
    if (!astar(map, startNodeId, goalNodeId)) {
      setError("경로를 찾을 수 없습니다.");
      return;
    }
    const prefs = loadDrivePrefs() ?? {
      vehicleId: "sedan" as const,
      transmission: "auto" as const,
      startNodeId: 0,
      goalNodeId: 15,
    };
    saveDrivePrefs({
      ...prefs,
      startNodeId,
      goalNodeId,
      mode: "navigate",
    });
    router.push("/drive");
  }

  return (
    <main className="page nav-page">
      <h1>내비</h1>
      <p className="sub">T맵처럼 출발 → 도착 순으로 지도를 탭한 뒤 안내를 시작하세요.</p>

      {map ? (
        <NavMapPicker
          map={map}
          startNodeId={startNodeId}
          goalNodeId={goalNodeId}
          onSelectStart={(id) => {
            setStart(id);
            setGoal(null);
            setError("");
          }}
          onSelectGoal={(id) => {
            setGoal(id);
            setError("");
          }}
          onReset={() => {
            setStart(null);
            setGoal(null);
            setError("");
          }}
        />
      ) : (
        <p className="sub">맵 로딩…</p>
      )}

      {startNodeId != null && goalNodeId != null ? (
        <p className="sub nav-summary">
          {placeName(startNodeId)} → {placeName(goalNodeId)}
          {pathOk ? " · 경로 준비됨" : " · 경로 없음"}
        </p>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      <div className="actions">
        <button
          type="button"
          className="btn-primary"
          onClick={startDrive}
          disabled={!pathOk}
        >
          안내 시작
        </button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/garage")}>
          차고로
        </button>
      </div>
    </main>
  );
}
