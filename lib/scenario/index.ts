export type SessionMode = "free" | "navigate" | "highway";
export type TimeOfDay = "day" | "dusk" | "night";
export type Weather = "clear" | "rain" | "fog";

export type ScenarioState = {
  mode: SessionMode;
  timeOfDay: TimeOfDay;
  weather: Weather;
  speedLimitKmh: number;
  signalPhase: "red" | "yellow" | "green";
  nearestSignalNodeId: number | null;
  safety: {
    score: number;
    speeding: number;
    redLight: number;
    nearMiss: number;
  };
  parking: {
    inBay: boolean;
    completed: boolean;
  };
  tollPassed: boolean;
  sessionSeconds: number;
};

export function createScenario(mode: SessionMode): ScenarioState {
  return {
    mode,
    timeOfDay: mode === "highway" ? "day" : "day",
    weather: "clear",
    speedLimitKmh: 50,
    signalPhase: "green",
    nearestSignalNodeId: null,
    safety: { score: 100, speeding: 0, redLight: 0, nearMiss: 0 },
    parking: { inBay: false, completed: false },
    tollPassed: false,
    sessionSeconds: 0,
  };
}

export function environmentPreset(time: TimeOfDay, weather: Weather) {
  if (weather === "fog") {
    return {
      sky: "#9aa8b8",
      fog: "#b8c4d0",
      fogNear: 8,
      fogFar: 55,
      ambient: 0.35,
      sunIntensity: 0.25,
      sunPos: [20, 18, 10] as [number, number, number],
    };
  }
  if (time === "night") {
    return {
      sky: weather === "rain" ? "#0a1018" : "#0b1420",
      fog: "#0a121c",
      fogNear: 12,
      fogFar: 80,
      ambient: 0.18,
      sunIntensity: 0.05,
      sunPos: [5, 30, -10] as [number, number, number],
    };
  }
  if (time === "dusk") {
    return {
      sky: weather === "rain" ? "#4a5568" : "#c47858",
      fog: "#d4a090",
      fogNear: 20,
      fogFar: 110,
      ambient: 0.4,
      sunIntensity: 0.55,
      sunPos: [40, 8, -20] as [number, number, number],
    };
  }
  return {
    sky: weather === "rain" ? "#6a7a8a" : "#87b5d9",
    fog: weather === "rain" ? "#8a9aaa" : "#c5d8ea",
    fogNear: 35,
    fogFar: 160,
    ambient: weather === "rain" ? 0.45 : 0.62,
    sunIntensity: weather === "rain" ? 0.35 : 1.05,
    sunPos: [30, 45, 20] as [number, number, number],
  };
}

export function signalPhaseAt(
  cycleSeconds: number,
  nowSec: number,
): "red" | "yellow" | "green" {
  const t = ((nowSec % cycleSeconds) + cycleSeconds) % cycleSeconds;
  const g = cycleSeconds * 0.45;
  const y = cycleSeconds * 0.12;
  if (t < g) return "green";
  if (t < g + y) return "yellow";
  return "red";
}
