export type VehicleId = "compact" | "sedan" | "suv";
export type Transmission = "auto" | "manual";

export type DrivePrefs = {
  vehicleId: VehicleId;
  transmission: Transmission;
  startNodeId: number;
  goalNodeId: number;
};

const KEY = "driving_prefs";

export function saveDrivePrefs(prefs: DrivePrefs) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEY, JSON.stringify(prefs));
}

export function loadDrivePrefs(): DrivePrefs | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DrivePrefs;
  } catch {
    return null;
  }
}

export const VEHICLES: {
  id: VehicleId;
  name: string;
  blurb: string;
  color: string;
}[] = [
  { id: "compact", name: "경차", blurb: "좁은 골목에 강한 연습용", color: "#3d8bfd" },
  { id: "sedan", name: "세단", blurb: "균형 잡힌 기본 차", color: "#e8eef5" },
  { id: "suv", name: "SUV", blurb: "높은 시점, 넓은 차체", color: "#2f6b4f" },
];
