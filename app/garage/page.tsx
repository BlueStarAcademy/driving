"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SessionMode,
  TimeOfDay,
  Transmission,
  VEHICLES,
  VehicleId,
  Weather,
  saveDrivePrefs,
} from "@/lib/session-prefs";

export default function GaragePage() {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState<VehicleId>("sedan");
  const [transmission, setTransmission] = useState<Transmission>("auto");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("day");
  const [weather, setWeather] = useState<Weather>("clear");

  function saveBase(mode: SessionMode, startNodeId: number, goalNodeId: number) {
    saveDrivePrefs({
      vehicleId,
      transmission,
      startNodeId,
      goalNodeId,
      mode,
      timeOfDay,
      weather,
    });
  }

  function goFree() {
    const start = Math.floor(Math.random() * 16);
    saveBase("free", start, start);
    router.push("/drive");
  }

  function goNav() {
    saveBase("navigate", 0, 15);
    router.push("/nav");
  }

  function goHighway() {
    saveBase("highway", 7, 20);
    router.push("/drive");
  }

  return (
    <main className="page">
      <h1>차고</h1>
      <p className="sub">연습할 차량과 변속기, 주행 환경을 고르세요.</p>

      <div className="choice-grid cols-3">
        {VEHICLES.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`choice ${vehicleId === v.id ? "selected" : ""}`}
            onClick={() => setVehicleId(v.id)}
          >
            <div className="swatch" style={{ background: v.color }} />
            <strong>{v.name}</strong>
            <span>{v.blurb}</span>
          </button>
        ))}
      </div>

      <div className="choice-grid cols-2">
        <button
          type="button"
          className={`choice ${transmission === "auto" ? "selected" : ""}`}
          onClick={() => setTransmission("auto")}
        >
          <strong>오토</strong>
          <span>변속 걱정 없이 페달·핸들만</span>
        </button>
        <button
          type="button"
          className={`choice ${transmission === "manual" ? "selected" : ""}`}
          onClick={() => setTransmission("manual")}
        >
          <strong>수동</strong>
          <span>기어 R / N / 1 / 2</span>
        </button>
      </div>

      <div className="choice-grid cols-3">
        {(
          [
            ["day", "낮"],
            ["dusk", "황혼"],
            ["night", "밤"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`choice ${timeOfDay === id ? "selected" : ""}`}
            onClick={() => setTimeOfDay(id)}
          >
            <strong>{label}</strong>
          </button>
        ))}
      </div>

      <div className="choice-grid cols-3">
        {(
          [
            ["clear", "맑음"],
            ["rain", "비"],
            ["fog", "안개"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`choice ${weather === id ? "selected" : ""}`}
            onClick={() => setWeather(id)}
          >
            <strong>{label}</strong>
          </button>
        ))}
      </div>

      <div className="actions garage-mode-actions">
        <button type="button" className="btn-primary" onClick={goFree}>
          동네 연습
        </button>
        <button type="button" className="btn-primary" onClick={goNav}>
          내비 목적지
        </button>
        <button type="button" className="btn-primary" onClick={goHighway}>
          고속도로·톨
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
            router.refresh();
          }}
        >
          로그아웃
        </button>
      </div>
    </main>
  );
}
