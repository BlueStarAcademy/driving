"use client";

import Link from "next/link";
import {
  MutableRefObject,
  PointerEvent,
  RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Transmission } from "@/lib/session-prefs";

export type TurnSignal = "off" | "left" | "right";

export type DriveControls = {
  steer: number;
  throttle: number;
  brake: number;
  gear: string;
  turnSignal: TurnSignal;
  hazard: boolean;
};

export type HudState = {
  speedKmh: number;
  gear: string;
  eta: string;
  rpm: number;
  turnSignal: TurnSignal;
  hazard: boolean;
};

type Props = {
  controls: MutableRefObject<DriveControls>;
  hud: HudState;
  transmission: Transmission;
  mirrorLeftRef: RefObject<HTMLDivElement | null>;
  mirrorRightRef: RefObject<HTMLDivElement | null>;
  mirrorRoomRef: RefObject<HTMLDivElement | null>;
};

const MANUAL_GEARS = ["R", "N", "1", "2"] as const;
const AUTO_GEARS = ["P", "R", "N", "D"] as const;

export function DriveHUD({
  controls,
  hud,
  transmission,
  mirrorLeftRef,
  mirrorRightRef,
  mirrorRoomRef,
}: Props) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [hazard, setHazard] = useState(false);
  const [turnSignal, setTurnSignal] = useState<TurnSignal>("off");
  const gears = transmission === "auto" ? AUTO_GEARS : MANUAL_GEARS;

  useEffect(() => {
    controls.current.hazard = hazard;
    controls.current.turnSignal = hazard ? "off" : turnSignal;
  }, [controls, hazard, turnSignal]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") controls.current.steer = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") controls.current.steer = 1;
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
    };
    const up = (e: KeyboardEvent) => {
      if (
        e.code === "ArrowLeft" ||
        e.code === "KeyA" ||
        e.code === "ArrowRight" ||
        e.code === "KeyD"
      ) {
        controls.current.steer = 0;
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
    };
  }, [controls]);

  function onWheelPointer(e: PointerEvent<HTMLDivElement>) {
    const el = wheelRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const angle = Math.atan2(dx, -dy);
    controls.current.steer = Math.max(-1, Math.min(1, angle / (Math.PI / 2)));
    el.style.transform = `rotate(${controls.current.steer * 90}deg)`;
  }

  function endWheel(e: PointerEvent<HTMLDivElement>) {
    controls.current.steer = 0;
    if (wheelRef.current) {
      wheelRef.current.style.transform = "rotate(0deg)";
      try {
        wheelRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  const leftBlink = hazard || turnSignal === "left" || hud.hazard || hud.turnSignal === "left";
  const rightBlink =
    hazard || turnSignal === "right" || hud.hazard || hud.turnSignal === "right";
  const needle = Math.min(hud.speedKmh, 160) / 160;
  const rpmNeedle = Math.min(hud.rpm, 8000) / 8000;

  return (
    <div className="drive-hud">
      <div className="cabin-frame" aria-hidden>
        <div className="cabin-pillar left" />
        <div className="cabin-pillar right" />
        <div className="cabin-dash" />
        <div className="cabin-header" />
      </div>

      <div className="top-left-actions">
        <Link
          className="btn-ghost drive-exit"
          href="/nav"
        >
          나가기
        </Link>
      </div>

      <div className="mirror-room-wrap">
        <div className="mirror-housing room">
          <div ref={mirrorRoomRef} className="mirror-glass room" />
        </div>
      </div>

      <div className="mirror-side left">
        <div className="mirror-housing side">
          <div ref={mirrorLeftRef} className="mirror-glass side" />
        </div>
      </div>
      <div className="mirror-side right">
        <div className="mirror-housing side">
          <div ref={mirrorRightRef} className="mirror-glass side" />
        </div>
      </div>

      <div className="hud-glass" aria-live="polite">
        <div className={`hud-signal left ${leftBlink ? "on" : ""}`}>◀</div>
        <div className="hud-center">
          <div className="hud-speed">
            {hud.speedKmh}
            <span>km/h</span>
          </div>
          <div className="hud-meta">
            <span className="hud-gear">{hud.gear}</span>
            <span className="hud-eta">ETA {hud.eta}</span>
          </div>
        </div>
        <div className={`hud-signal right ${rightBlink ? "on" : ""}`}>▶</div>
      </div>

      <div className="cluster-stack">
        <div className="instrument-cluster">
          <div className={`cluster-arrow left ${leftBlink ? "on" : ""}`}>◀</div>
          <div className="cluster-gauge rpm">
            <div
              className="cluster-needle"
              style={{ transform: `rotate(${-120 + rpmNeedle * 240}deg)` }}
            />
            <div className="cluster-label">RPM</div>
          </div>
          <div className="cluster-center">
            <div className="cluster-speed">{hud.speedKmh}</div>
            <div className="cluster-unit">km/h</div>
            <div className="cluster-gear">{hud.gear}</div>
          </div>
          <div className="cluster-gauge speed">
            <div
              className="cluster-needle"
              style={{ transform: `rotate(${-120 + needle * 240}deg)` }}
            />
            <div className="cluster-label">SPD</div>
          </div>
          <div className={`cluster-arrow right ${rightBlink ? "on" : ""}`}>▶</div>
          {hazard ? <div className="cluster-hazard-lamp on">⚠</div> : null}
        </div>

        <div
          ref={wheelRef}
          className="wheel-zone"
          onPointerDown={onWheelPointer}
          onPointerMove={(e) => {
            if (e.buttons) onWheelPointer(e);
          }}
          onPointerUp={endWheel}
          onPointerCancel={endWheel}
        >
          <div className="wheel-spoke s1" />
          <div className="wheel-spoke s2" />
          <div className="wheel-spoke s3" />
          <div className="hub" />
        </div>
      </div>

      <div className="controls-right">
        <div className="gear-hazard">
          <div className="gear-row">
            {gears.map((g) => (
              <button
                key={g}
                type="button"
                className={hud.gear === g ? "active" : ""}
                onClick={() => {
                  controls.current.gear = g;
                }}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`hazard-btn ${hazard ? "active" : ""}`}
            aria-pressed={hazard}
            onClick={() => {
              setHazard((h) => !h);
              setTurnSignal("off");
            }}
          >
            <span className="hazard-icon">△</span>
            비상
          </button>
        </div>

        <div className="pedals">
          <button
            type="button"
            className="pedal brake"
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
            브레이크
          </button>
          <button
            type="button"
            className="pedal gas"
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
            가속
          </button>
        </div>
      </div>
    </div>
  );
}
