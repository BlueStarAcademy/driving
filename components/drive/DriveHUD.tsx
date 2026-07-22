"use client";

import Link from "next/link";
import {
  MutableRefObject,
  PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Transmission, SessionMode, TimeOfDay, Weather } from "@/lib/session-prefs";
import type { NavGuidance } from "@/lib/nav-guidance";
import type { RoadClass } from "@/lib/map";
import type { ScenarioState } from "@/lib/scenario";
import { DriveNavPanel } from "./DriveNavPanel";
import { playHazard, playParkDone, playToll, playTurnTick } from "@/lib/audio/drive-audio";

export type TurnSignal = "off" | "left" | "right";
/** off | mist(1회) | slow/medium/fast(자동 3단) */
export type WiperMode = "off" | "mist" | "slow" | "medium" | "fast";

export type DriveControls = {
  steer: number;
  throttle: number;
  brake: number;
  gear: string;
  turnSignal: TurnSignal;
  hazard: boolean;
  wiper: WiperMode;
};

const WIPER_DOWN: Exclude<WiperMode, "mist">[] = ["off", "slow", "medium", "fast"];
const WIPER_POS: Record<Exclude<WiperMode, "mist">, number> = {
  off: 0,
  slow: 22,
  medium: 40,
  fast: 58,
};
const WIPER_ANGLE: Record<WiperMode, number> = {
  off: 0,
  mist: -30,
  slow: 14,
  medium: 28,
  fast: 42,
};

function wiperLabel(mode: WiperMode) {
  if (mode === "mist") return "1회";
  if (mode === "slow") return "자동 저속";
  if (mode === "medium") return "자동 중속";
  if (mode === "fast") return "자동 고속";
  return "꺼짐";
}

function wiperFromDragPos(pos: number): WiperMode {
  if (pos < -16) return "mist";
  if (pos >= 50) return "fast";
  if (pos >= 32) return "medium";
  if (pos >= 14) return "slow";
  return "off";
}

export type HudState = {
  speedKmh: number;
  gear: string;
  eta: string;
  rpm: number;
  turnSignal: TurnSignal;
  hazard: boolean;
  nav: NavGuidance;
  speedLimitKmh: number;
  signalPhase: "red" | "yellow" | "green";
  safetyScore: number;
  parkingInBay: boolean;
  parkingDone: boolean;
  tollPassed: boolean;
  timeOfDay: TimeOfDay;
  weather: Weather;
  roadClass: RoadClass;
};

type SimBag = {
  scenario: ScenarioState;
};

type Props = {
  controls: MutableRefObject<DriveControls>;
  hud: HudState;
  transmission: Transmission;
  sim?: MutableRefObject<SimBag>;
  mode?: SessionMode;
};

const AUTO_GEARS = ["P", "R", "N", "D"] as const;
const MANUAL_SLOTS: { id: string; label: string; x: number; y: number }[] = [
  { id: "R", label: "R", x: 0, y: 0 },
  { id: "N", label: "N", x: 1, y: 1 },
  { id: "1", label: "1", x: 0, y: 2 },
  { id: "2", label: "2", x: 2, y: 2 },
];

const idleNav: NavGuidance = {
  maneuver: "depart",
  thenManeuver: null,
  instruction: "경로 안내 준비 중",
  nextName: "—",
  distToNextM: 0,
  remainingM: 0,
  progress: 0,
  startName: "—",
  goalName: "—",
};

export function DriveHUD({
  controls,
  hud,
  transmission,
  sim,
  mode = "navigate",
}: Props) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelDrag = useRef(false);
  const wheelLastPointer = useRef(0);
  const wheelAngleRef = useRef(0);
  const stalkRef = useRef<HTMLDivElement>(null);
  const wiperStalkRef = useRef<HTMLDivElement>(null);
  const stalkDrag = useRef(false);
  const stalkStartY = useRef(0);
  const stalkOrigin = useRef(0);
  const stalkAngleRef = useRef(0);
  const wiperDrag = useRef(false);
  const wiperStartY = useRef(0);
  const wiperOrigin = useRef(0);
  const wiperAngleRef = useRef(0);
  const wiperPosRef = useRef(0);
  const wiperHeld = useRef<Exclude<WiperMode, "mist">>("off");
  const mistTimer = useRef(0);
  const wheelCenterRaf = useRef(0);
  const wheelKeyRaf = useRef(0);
  const wheelKeys = useRef({ left: false, right: false });
  const [hazard, setHazard] = useState(false);
  const [turnSignal, setTurnSignal] = useState<TurnSignal>("off");
  const [wiper, setWiper] = useState<WiperMode>("off");
  const [stalkAngle, setStalkAngle] = useState(0);
  const [wiperAngle, setWiperAngle] = useState(0);
  const [wheelAngle, setWheelAngle] = useState(0);
  const nav = hud.nav ?? idleNav;

  function clearMistTimer() {
    if (mistTimer.current) {
      window.clearTimeout(mistTimer.current);
      mistTimer.current = 0;
    }
  }

  function applyWiperMode(mode: WiperMode, opts?: { springMist?: boolean }) {
    clearMistTimer();
    if (mode === "mist") {
      wiperHeld.current = "off";
      setWiper("mist");
      controls.current.wiper = "mist";
      if (opts?.springMist) {
        wiperAngleRef.current = 0;
        setWiperAngle(0);
      } else {
        wiperAngleRef.current = WIPER_ANGLE.mist;
        setWiperAngle(WIPER_ANGLE.mist);
      }
      mistTimer.current = window.setTimeout(() => {
        mistTimer.current = 0;
        wiperHeld.current = "off";
        setWiper("off");
        controls.current.wiper = "off";
        wiperAngleRef.current = 0;
        setWiperAngle(0);
      }, 1050);
      return;
    }
    wiperHeld.current = mode;
    setWiper(mode);
    controls.current.wiper = mode;
    wiperAngleRef.current = WIPER_ANGLE[mode];
    setWiperAngle(WIPER_ANGLE[mode]);
  }

  function stepWiperUp() {
    const cur = wiper === "mist" ? wiperHeld.current : wiper;
    if (cur === "off") {
      applyWiperMode("mist", { springMist: true });
      return;
    }
    const i = WIPER_DOWN.indexOf(cur);
    applyWiperMode(WIPER_DOWN[Math.max(0, i - 1)]);
  }

  function stepWiperDown() {
    const cur = wiper === "mist" ? wiperHeld.current : wiper;
    const i = WIPER_DOWN.indexOf(cur);
    applyWiperMode(WIPER_DOWN[Math.min(WIPER_DOWN.length - 1, i + 1)]);
  }

  // 풀록 ±2바퀴. 키보드는 누르는 동안 점진적으로 조향
  const WHEEL_MAX = 720;
  const WHEEL_GAIN = 0.9;
  const KEYBOARD_STEER_MAX = 520;
  const KEYBOARD_STEER_RATE = 340; // deg/s

  useEffect(() => {
    controls.current.hazard = hazard;
    controls.current.turnSignal = hazard ? "off" : turnSignal;
    controls.current.wiper = wiper;
    if (hazard) playHazard();
  }, [controls, hazard, turnSignal, wiper]);

  useEffect(() => {
    return () => {
      clearMistTimer();
      cancelAnimationFrame(wheelKeyRaf.current);
      cancelAnimationFrame(wheelCenterRaf.current);
    };
  }, []);

  useEffect(() => {
    if (turnSignal !== "off") playTurnTick();
  }, [turnSignal]);

  useEffect(() => {
    if (hud.parkingDone) playParkDone();
  }, [hud.parkingDone]);

  useEffect(() => {
    if (hud.tollPassed) playToll();
  }, [hud.tollPassed]);

  useEffect(() => {
    if (stalkDrag.current) return;
    // 머리 위(우회전)=+, 머리 아래(좌회전)=-
    const next = turnSignal === "right" ? 36 : turnSignal === "left" ? -36 : 0;
    stalkAngleRef.current = next;
    setStalkAngle(next);
  }, [turnSignal]);

  useEffect(() => {
    if (wiperDrag.current) return;
    if (wiper === "mist") return; // mist 복귀 타이머가 각도 관리
    const next = WIPER_ANGLE[wiper];
    wiperAngleRef.current = next;
    setWiperAngle(next);
  }, [wiper]);

  function applyWheelRotation(deg: number) {
    const clamped = Math.max(-WHEEL_MAX, Math.min(WHEEL_MAX, deg));
    wheelAngleRef.current = clamped;
    setWheelAngle(clamped);
    // 시계방향 핸들(+) = 우회전 입력
    controls.current.steer = clamped / WHEEL_MAX;
  }

  function startWheelCenter() {
    cancelAnimationFrame(wheelCenterRaf.current);
    if (wheelKeys.current.left || wheelKeys.current.right) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (wheelDrag.current || wheelKeys.current.left || wheelKeys.current.right) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const a = wheelAngleRef.current;
      if (Math.abs(a) < 0.5) {
        applyWheelRotation(0);
        return;
      }
      // 실차처럼 속도감 있는 복귀 (너무 급하게 스냅하지 않음)
      const spring = Math.min(Math.abs(a) * 2.2 + 40, 280);
      const next = a - Math.sign(a) * spring * dt;
      if (Math.sign(next) !== Math.sign(a)) {
        applyWheelRotation(0);
        return;
      }
      applyWheelRotation(next);
      wheelCenterRaf.current = requestAnimationFrame(tick);
    };
    wheelCenterRaf.current = requestAnimationFrame(tick);
  }

  function startKeyboardSteer() {
    cancelAnimationFrame(wheelCenterRaf.current);
    cancelAnimationFrame(wheelKeyRaf.current);
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { left, right } = wheelKeys.current;
      if (!left && !right) {
        startWheelCenter();
        return;
      }
      if (wheelDrag.current) {
        wheelKeyRaf.current = requestAnimationFrame(tick);
        return;
      }
      let dir = 0;
      if (left && !right) dir = -1;
      else if (right && !left) dir = 1;
      if (dir !== 0) {
        const next = wheelAngleRef.current + dir * KEYBOARD_STEER_RATE * dt;
        applyWheelRotation(
          Math.max(-KEYBOARD_STEER_MAX, Math.min(KEYBOARD_STEER_MAX, next)),
        );
      }
      wheelKeyRaf.current = requestAnimationFrame(tick);
    };
    wheelKeyRaf.current = requestAnimationFrame(tick);
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // ← 좌회전, → 우회전 — 누르는 동안 점진 조향
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        if (!wheelKeys.current.left) {
          wheelKeys.current.left = true;
          startKeyboardSteer();
        }
        e.preventDefault();
      }
      if (e.code === "ArrowRight" || e.code === "KeyD") {
        if (!wheelKeys.current.right) {
          wheelKeys.current.right = true;
          startKeyboardSteer();
        }
        e.preventDefault();
      }
      if (e.code === "ArrowUp" || e.code === "KeyW") controls.current.throttle = 1;
      if (e.code === "ArrowDown" || e.code === "KeyS" || e.code === "Space") {
        controls.current.brake = 1;
      }
      if (e.code === "KeyQ") {
        setHazard(false);
        setTurnSignal((t) => (t === "left" ? "off" : "left"));
      }
      if (e.code === "KeyE") {
        setHazard(false);
        setTurnSignal((t) => (t === "right" ? "off" : "right"));
      }
      if (e.code === "KeyH") {
        setHazard((h) => !h);
        setTurnSignal("off");
      }
      if (e.code === "KeyR") {
        const cur = wiperHeld.current;
        const i = WIPER_DOWN.indexOf(cur);
        const next = WIPER_DOWN[(i + 1) % WIPER_DOWN.length];
        applyWiperMode(next);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") {
        wheelKeys.current.left = false;
        if (!wheelKeys.current.right) startWheelCenter();
      }
      if (e.code === "ArrowRight" || e.code === "KeyD") {
        wheelKeys.current.right = false;
        if (!wheelKeys.current.left) startWheelCenter();
      }
      if (e.code === "ArrowUp" || e.code === "KeyW") controls.current.throttle = 0;
      if (e.code === "ArrowDown" || e.code === "KeyS" || e.code === "Space") {
        controls.current.brake = 0;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      cancelAnimationFrame(wheelCenterRaf.current);
      cancelAnimationFrame(wheelKeyRaf.current);
    };
  }, [controls]);

  function wheelPointerPolar(clientX: number, clientY: number) {
    const el = wheelRef.current;
    if (!el) return { angle: 0, radius: 0 };
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // atan2(dx, -dy): 위=0, 시계방향(+)
    return {
      angle: Math.atan2(dx, -dy),
      radius: Math.hypot(dx, dy),
    };
  }

  function unwrapDelta(from: number, to: number) {
    let step = to - from;
    while (step > Math.PI) step -= Math.PI * 2;
    while (step < -Math.PI) step += Math.PI * 2;
    return step;
  }

  function onWheelPointerDown(e: PointerEvent<HTMLDivElement>) {
    cancelAnimationFrame(wheelCenterRaf.current);
    const polar = wheelPointerPolar(e.clientX, e.clientY);
    // 중심 근처는 각도 불안정 → 무시
    if (polar.radius < 12) return;
    wheelDrag.current = true;
    wheelLastPointer.current = polar.angle;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("dragging");
  }

  function onWheelPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!wheelDrag.current) return;
    const polar = wheelPointerPolar(e.clientX, e.clientY);
    // 중심 통과 시 점프 방지: 각도 갱신만 하고 회전은 스킵
    if (polar.radius < 14) {
      wheelLastPointer.current = polar.angle;
      return;
    }
    const step = unwrapDelta(wheelLastPointer.current, polar.angle);
    wheelLastPointer.current = polar.angle;
    // 한 프레임에 비정상적으로 큰 점프는 버림 (터치 글리치)
    if (Math.abs(step) > 1.2) return;
    // 손가락 회전 = 핸들 회전 (시계방향 +)
    applyWheelRotation(
      wheelAngleRef.current + ((step * 180) / Math.PI) * WHEEL_GAIN,
    );
  }

  function endWheel(e: PointerEvent<HTMLDivElement>) {
    if (!wheelDrag.current) return;
    wheelDrag.current = false;
    e.currentTarget.classList.remove("dragging");
    startWheelCenter();
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function applyStalkFromDrag(clientY: number) {
    const threshold = 18;
    // 손가락 아래(Y 증가) → 머리 아래, 위 → 머리 위
    const pos = clientY - stalkStartY.current + stalkOrigin.current;
    const angle = Math.max(-40, Math.min(40, -(pos / 28) * 36));
    stalkAngleRef.current = angle;
    setStalkAngle(angle);
    setHazard(false);
    // 실차: 위로 = 우회전, 아래로 = 좌회전
    if (pos < -threshold) setTurnSignal("right");
    else if (pos > threshold) setTurnSignal("left");
    else setTurnSignal("off");
  }

  function onStalkPointerDown(e: PointerEvent<HTMLDivElement>) {
    stalkDrag.current = true;
    stalkStartY.current = e.clientY;
    stalkOrigin.current =
      turnSignal === "right" ? -28 : turnSignal === "left" ? 28 : 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onStalkPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!stalkDrag.current) return;
    applyStalkFromDrag(e.clientY);
  }

  function endStalk(e: PointerEvent<HTMLDivElement>) {
    stalkDrag.current = false;
    const a = stalkAngleRef.current;
    const snapped = a > 18 ? 36 : a < -18 ? -36 : 0;
    const signal: TurnSignal = snapped > 0 ? "right" : snapped < 0 ? "left" : "off";
    stalkAngleRef.current = snapped;
    setStalkAngle(snapped);
    setTurnSignal(signal);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function applyWiperFromDrag(clientY: number) {
    // 손가락 위 = mist(1회), 아래 = 자동 3단
    const pos = clientY - wiperStartY.current + wiperOrigin.current;
    wiperPosRef.current = pos;
    const mode = wiperFromDragPos(pos);
    const angle =
      mode === "mist"
        ? Math.max(-36, Math.min(0, (pos / 22) * 30))
        : Math.max(0, Math.min(46, (Math.max(0, pos) / 58) * 42));
    wiperAngleRef.current = angle;
    setWiperAngle(angle);
    clearMistTimer();
    if (mode === "mist") {
      setWiper("mist");
      controls.current.wiper = "mist";
    } else {
      wiperHeld.current = mode;
      setWiper(mode);
      controls.current.wiper = mode;
    }
  }

  function onWiperPointerDown(e: PointerEvent<HTMLDivElement>) {
    wiperDrag.current = true;
    clearMistTimer();
    if (wiper === "mist") {
      wiperHeld.current = "off";
      setWiper("off");
      controls.current.wiper = "off";
    }
    wiperStartY.current = e.clientY;
    wiperOrigin.current = WIPER_POS[wiperHeld.current];
    wiperPosRef.current = wiperOrigin.current;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onWiperPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!wiperDrag.current) return;
    applyWiperFromDrag(e.clientY);
  }

  function endWiper(e: PointerEvent<HTMLDivElement>) {
    wiperDrag.current = false;
    const finalMode = wiperFromDragPos(wiperPosRef.current);
    if (finalMode === "mist") {
      applyWiperMode("mist", { springMist: true });
    } else {
      applyWiperMode(finalMode);
    }
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function setGear(g: string) {
    controls.current.gear = g;
  }

  const leftBlink = hazard || turnSignal === "left" || hud.hazard || hud.turnSignal === "left";
  const rightBlink =
    hazard || turnSignal === "right" || hud.hazard || hud.turnSignal === "right";
  const needle = Math.min(hud.speedKmh, 160) / 160;
  const rpmNeedle = Math.min(hud.rpm, 8000) / 8000;

  return (
    <div className="drive-hud">
      <div className="drive-cabin-layer" aria-hidden>
        <div className="cabin-frame">
          <div className="cabin-windshield-vignette" />
          <div className="cabin-pillar left">
            <span className="cabin-weatherstrip" />
          </div>
          <div className="cabin-pillar right">
            <span className="cabin-weatherstrip" />
          </div>
          <div className="cabin-header">
            <span className="cabin-sunvisor left" />
            <span className="cabin-sunvisor right" />
          </div>
          <div className="cabin-hood" />
          <div className="cabin-dash">
            <div className="cabin-dash-top" />
            <div className="cabin-vent left" />
            <div className="cabin-vent center" />
            <div className="cabin-vent right" />
          </div>
          <div className="cabin-door left" />
          <div className="cabin-door right" />
        </div>
      </div>

      <div className="drive-controls-layer">
      <div className="top-left-actions">
        <Link className="btn-ghost drive-exit" href={mode === "free" ? "/garage" : "/nav"}>
          나가기
        </Link>
      </div>

      <div className="drive-status-strip" aria-live="polite">
        <span className="status-chip">
          {mode === "free" ? "동네 연습" : mode === "highway" ? "고속도로" : "내비 운행"}
        </span>
        <span className={`status-chip limit ${hud.speedKmh > hud.speedLimitKmh + 5 ? "warn" : ""}`}>
          제한 {hud.speedLimitKmh}
        </span>
        <span className={`status-chip signal ${hud.signalPhase}`}>
          신호 {hud.signalPhase === "green" ? "녹" : hud.signalPhase === "yellow" ? "황" : "적"}
        </span>
        <span className="status-chip score">안전 {hud.safetyScore}</span>
        {hud.tollPassed ? <span className="status-chip toll">톨게이트 통과</span> : null}
        {hud.parkingInBay ? <span className="status-chip park">주차면</span> : null}
      </div>

      <div className="drive-env-controls">
        <button
          type="button"
          className="env-btn"
          onClick={() => {
            if (!sim) return;
            const order: TimeOfDay[] = ["day", "dusk", "night"];
            const i = order.indexOf(sim.current.scenario.timeOfDay);
            sim.current.scenario.timeOfDay = order[(i + 1) % order.length];
          }}
        >
          {hud.timeOfDay === "day" ? "낮" : hud.timeOfDay === "dusk" ? "황혼" : "밤"}
        </button>
        <button
          type="button"
          className="env-btn"
          onClick={() => {
            if (!sim) return;
            const order: Weather[] = ["clear", "rain", "fog"];
            const i = order.indexOf(sim.current.scenario.weather);
            const next = order[(i + 1) % order.length];
            sim.current.scenario.weather = next;
            if (next === "rain") {
              applyWiperMode("slow");
            }
          }}
        >
          {hud.weather === "clear" ? "맑음" : hud.weather === "rain" ? "비" : "안개"}
        </button>
      </div>

      {hud.parkingDone ? (
        <div className="drive-clear-modal" role="dialog" aria-label="주차 완료">
          <div className="drive-clear-card">
            <h2>주차 완료</h2>
            <p>목적지 주차면에 안전하게 정차했습니다.</p>
            <p className="drive-clear-score">안전 점수 {hud.safetyScore}</p>
            <Link className="btn-primary" href="/garage">
              차고로
            </Link>
          </div>
        </div>
      ) : null}

      <div className="cluster-stack">
        <div className="instrument-cluster">
          <div className="cluster-bezel">
            <div className="cluster-tft">
              <div className={`cluster-arrow left ${leftBlink ? "on" : ""}`} aria-hidden>
                ◀
              </div>
              <div className="cluster-dial rpm" aria-hidden>
                <div
                  className="cluster-dial-fill"
                  style={{
                    background: `conic-gradient(from 210deg, #5ad0ff 0 ${rpmNeedle * 70}%, transparent ${rpmNeedle * 70}% 100%)`,
                  }}
                />
                <div className="cluster-dial-core">
                  <span>{Math.round(hud.rpm / 100)}</span>
                  <small>RPM</small>
                </div>
              </div>
              <div className="cluster-center">
                <div className="cluster-speed">{hud.speedKmh}</div>
                <div className="cluster-unit">km/h</div>
                <div className="cluster-gear-row">
                  <span className="cluster-gear">{hud.gear}</span>
                  <span
                    className={`cluster-limit-badge ${hud.speedKmh > hud.speedLimitKmh + 5 ? "warn" : ""}`}
                  >
                    {hud.speedLimitKmh}
                  </span>
                </div>
              </div>
              <div className="cluster-dial speed" aria-hidden>
                <div
                  className="cluster-dial-fill"
                  style={{
                    background: `conic-gradient(from 210deg, #ffd27a 0 ${needle * 70}%, transparent ${needle * 70}% 100%)`,
                  }}
                />
                <div className="cluster-dial-core">
                  <span>{Math.min(hud.speedKmh, 999)}</span>
                  <small>SPD</small>
                </div>
              </div>
              <div className={`cluster-arrow right ${rightBlink ? "on" : ""}`} aria-hidden>
                ▶
              </div>
              {hazard || hud.hazard ? (
                <div className="cluster-hazard-lamp on" aria-hidden>
                  ▲
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="wheel-row">
          <div
            ref={stalkRef}
            className={`signal-stalk ${hazard ? "" : turnSignal}`}
            role="slider"
            aria-label="방향지시등 레버"
            aria-valuetext={
              hazard ? "비상등" : turnSignal === "left" ? "좌측" : turnSignal === "right" ? "우측" : "중립"
            }
            tabIndex={0}
            onPointerDown={onStalkPointerDown}
            onPointerMove={onStalkPointerMove}
            onPointerUp={endStalk}
            onPointerCancel={endStalk}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                setHazard(false);
                setTurnSignal((t) => (t === "right" ? "off" : "right"));
              }
              if (e.key === "ArrowDown") {
                setHazard(false);
                setTurnSignal((t) => (t === "left" ? "off" : "left"));
              }
              if (e.key === "Escape" || e.key === "Home") {
                setTurnSignal("off");
              }
            }}
          >
            <div className="stalk-mount left-hand" aria-hidden>
              <div className="stalk-hub" />
              <div
                className="stalk-lever"
                style={{ transform: `rotate(${stalkAngle}deg)` }}
              >
                <span className="stalk-grip" />
                <span className="stalk-shaft" />
              </div>
            </div>
            <div className="stalk-hint">
              <span>▲ 우</span>
              <span>▼ 좌</span>
            </div>
          </div>

          <div
            ref={wheelRef}
            className="wheel-zone"
            style={{ transform: `rotate(${wheelAngle}deg)` }}
            onPointerDown={onWheelPointerDown}
            onPointerMove={onWheelPointerMove}
            onPointerUp={endWheel}
            onPointerCancel={endWheel}
          >
            <div className="wheel-rim" aria-hidden />
            <div className="wheel-inner-ring" aria-hidden />
            <div className="wheel-spoke s1" />
            <div className="wheel-spoke s2" />
            <div className="wheel-spoke s3" />
            <div className="wheel-mark" aria-hidden />
            <div className="hub">
              <span className="hub-logo" aria-hidden />
            </div>
          </div>

          <div
            ref={wiperStalkRef}
            className={`signal-stalk wiper-stalk ${wiper}`}
            role="slider"
            aria-label="와이퍼 레버"
            aria-valuetext={wiperLabel(wiper)}
            tabIndex={0}
            onPointerDown={onWiperPointerDown}
            onPointerMove={onWiperPointerMove}
            onPointerUp={endWiper}
            onPointerCancel={endWiper}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") {
                e.preventDefault();
                stepWiperUp();
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                stepWiperDown();
              }
              if (e.key === "Escape" || e.key === "Home") applyWiperMode("off");
            }}
          >
            <div className="stalk-mount right-hand" aria-hidden>
              <div className="stalk-hub" />
              <div
                className="stalk-lever"
                style={{ transform: `rotate(${wiperAngle}deg)` }}
              >
                <span className="stalk-shaft" />
                <span className="stalk-grip" />
              </div>
            </div>
            <div className="stalk-hint">
              <span>▲ 1회</span>
              <span>▼ 자동</span>
            </div>
          </div>
        </div>
      </div>

      <DriveNavPanel nav={nav} />

      <div className="controls-gear">
        <div className="console-panel">
          <button
            type="button"
            className={`hazard-console ${hazard ? "active" : ""}`}
            aria-pressed={hazard}
            aria-label="비상등"
            onClick={() => {
              setHazard((h) => !h);
              setTurnSignal("off");
            }}
          >
            <span className="hazard-console-tri" />
            <span className="hazard-console-label">HAZARD</span>
          </button>
          {transmission === "auto" ? (
            <div className="shifter auto">
              <div className="auto-gear-pad" role="group" aria-label="자동 변속">
                {AUTO_GEARS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    className={`auto-gear-btn ${hud.gear === g ? "active" : ""}`}
                    onClick={() => setGear(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="shifter-caption">AUTO</div>
            </div>
          ) : (
            <div className="shifter manual">
              <div className="shifter-gate manual">
                <div className="manual-h" aria-hidden />
                {MANUAL_SLOTS.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    className={`manual-slot ${hud.gear === slot.id ? "active" : ""}`}
                    style={{
                      left: `${18 + slot.x * 32}%`,
                      top: `${14 + slot.y * 34}%`,
                    }}
                    onClick={() => setGear(slot.id)}
                  >
                    {slot.label}
                  </button>
                ))}
                <div
                  className="shifter-knob manual-knob"
                  style={{
                    left: `${18 + (MANUAL_SLOTS.find((s) => s.id === hud.gear)?.x ?? 1) * 32}%`,
                    top: `${14 + (MANUAL_SLOTS.find((s) => s.id === hud.gear)?.y ?? 1) * 34}%`,
                  }}
                />
              </div>
              <div className="shifter-caption">MANUAL</div>
            </div>
          )}
        </div>
      </div>

      <div className="controls-right">
        <div className="pedal-well">
          <div className="pedals">
            <button
              type="button"
              className="pedal-img brake"
              aria-label="브레이크"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                controls.current.brake = 1;
                e.currentTarget.classList.add("pressed");
              }}
              onPointerUp={(e) => {
                controls.current.brake = 0;
                e.currentTarget.classList.remove("pressed");
              }}
              onPointerCancel={(e) => {
                controls.current.brake = 0;
                e.currentTarget.classList.remove("pressed");
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pedals/brake.svg" alt="" draggable={false} />
            </button>
            <button
              type="button"
              className="pedal-img gas"
              aria-label="가속"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                controls.current.throttle = 1;
                e.currentTarget.classList.add("pressed");
              }}
              onPointerUp={(e) => {
                controls.current.throttle = 0;
                e.currentTarget.classList.remove("pressed");
              }}
              onPointerCancel={(e) => {
                controls.current.throttle = 0;
                e.currentTarget.classList.remove("pressed");
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pedals/accel.svg" alt="" draggable={false} />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
