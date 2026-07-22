"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoadMap } from "@/lib/map";
import { DrivePrefs, loadDrivePrefs } from "@/lib/session-prefs";

const DriveExperience = dynamic(
  () => import("@/components/drive/DriveExperience").then((m) => m.DriveExperience),
  { ssr: false, loading: () => <main className="page"><p className="sub">운전 화면 준비 중…</p></main> },
);

export default function DrivePage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<DrivePrefs | null>(null);
  const [map, setMap] = useState<RoadMap | null>(null);

  useEffect(() => {
    const p = loadDrivePrefs();
    if (!p) {
      router.replace("/garage");
      return;
    }
    setPrefs(p);
    fetch("/maps/yeouido_sample.json")
      .then((r) => r.json())
      .then(setMap)
      .catch(() => router.replace("/nav"));
  }, [router]);

  if (!prefs || !map) {
    return (
      <main className="page">
        <p className="sub">로딩…</p>
      </main>
    );
  }

  return <DriveExperience prefs={prefs} map={map} />;
}
