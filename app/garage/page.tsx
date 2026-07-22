"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Transmission,
  VEHICLES,
  VehicleId,
  saveDrivePrefs,
} from "@/lib/session-prefs";

export default function GaragePage() {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState<VehicleId>("sedan");
  const [transmission, setTransmission] = useState<Transmission>("auto");

  function continueNav() {
    saveDrivePrefs({
      vehicleId,
      transmission,
      startNodeId: 0,
      goalNodeId: 15,
    });
    router.push("/nav");
  }

  return (
    <main className="page">
      <h1>차고</h1>
      <p className="sub">연습할 차량과 변속기를 고르세요.</p>

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

      <div className="actions">
        <button type="button" className="btn-primary" onClick={continueNav}>
          내비로
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
