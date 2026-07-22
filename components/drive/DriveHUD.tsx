"use client";

import Link from "next/link";
import { MutableRefObject, PointerEvent, useEffect, useRef } from "react";
import type { Transmission } from "@/lib/session-prefs";

export type DriveControls = {
  steer: number;
  throttle: number;
  brake: number;
  gear: string;
};

type Props = {
  controls: MutableRefObject<DriveControls>;
  hud: { speedKmh: number; gear: string; eta: string };
  transmission: Transmission;
};

const GEARS = ["R", "N", "1", "2"] as const;

export function DriveHUD({ controls, hud, transmission }: Props) {
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "ArrowLeft" || e.code === "KeyA") controls.current.steer = -1;
      if (e.code === "ArrowRight" || e.code === "KeyD") controls.current.steer = 1;
      if (e.code === "ArrowUp" || e.code === "KeyW") controls.current.throttle = 1;
      if (e.code === "ArrowDown" || e.code === "KeyS" || e.code === "Space") {
        controls.current.brake = 1;
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
    el.style.transform = `translateX(-50%) rotate(${controls.current.steer * 90}deg)`;
  }

  function endWheel(e: PointerEvent<HTMLDivElement>) {
    controls.current.steer = 0;
    if (wheelRef.current) {
      wheelRef.current.style.transform = "translateX(-50%) rotate(0deg)";
      try {
        wheelRef.current.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="drive-hud">
      <div className="top-left-actions">
        <Link className="btn-ghost" href="/nav" style={{ padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}>
          나가기
        </Link>
      </div>
      <div className="mirrors" aria-hidden>
        <div className="mirror" />
        <div className="mirror" />
      </div>
      <div className="speedo">
        {hud.speedKmh} km/h · {hud.gear}
      </div>
      <div className="nav-chip">도착까지 {hud.eta}</div>

      {transmission === "manual" ? (
        <div className="gear-row">
          {GEARS.map((g) => (
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
      ) : null}

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
        <div className="hub" />
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
  );
}
