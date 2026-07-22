"use client";

import type { NavGuidance, NavManeuver } from "@/lib/nav-guidance";

function ManeuverIcon({
  maneuver,
  className,
}: {
  maneuver: NavManeuver;
  className?: string;
}) {
  if (maneuver === "left") {
    // 아래 → 위 → 왼쪽
    return (
      <svg className={className} viewBox="0 0 64 64" aria-hidden>
        <path
          fill="currentColor"
          d="M46 58H34V30H22V38L6 24 22 10V18H46V58Z"
        />
      </svg>
    );
  }
  if (maneuver === "right") {
    // 아래 → 위 → 오른쪽
    return (
      <svg className={className} viewBox="0 0 64 64" aria-hidden>
        <path
          fill="currentColor"
          d="M18 58H30V30H42V38L58 24 42 10V18H18V58Z"
        />
      </svg>
    );
  }
  if (maneuver === "arrive") {
    return (
      <svg className={className} viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="26" r="11" fill="currentColor" />
        <path d="M20 54c0-8 5.5-13 12-13s12 5 12 13H20z" fill="currentColor" />
      </svg>
    );
  }
  // straight / depart
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <path fill="currentColor" d="M26 58V28h12v30H26z" />
      <path fill="currentColor" d="M32 6 16 28h32L32 6z" />
    </svg>
  );
}

export function DriveNavPanel({ nav }: { nav: NavGuidance }) {
  const distLabel =
    nav.distToNextM >= 1000
      ? `${(nav.distToNextM / 1000).toFixed(1)}km`
      : `${nav.distToNextM}m`;
  const remainLabel =
    nav.remainingM >= 1000
      ? `${(nav.remainingM / 1000).toFixed(1)}km`
      : `${nav.remainingM}m`;

  return (
    <div className="drive-nav">
      <div className="drive-nav-console">
        <div className="drive-nav-mount" aria-hidden />
        <div className="drive-nav-bezel">
          <div className="drive-nav-screen">
            <div className="drive-nav-card">
              <div className="drive-nav-maneuver">
                <div className="drive-nav-arrows">
                  <ManeuverIcon maneuver={nav.maneuver} className="drive-nav-arrow-main" />
                  {nav.thenManeuver ? (
                    <div className="drive-nav-then" aria-label="이후 방향">
                      <span className="drive-nav-then-label">그다음</span>
                      <ManeuverIcon
                        maneuver={nav.thenManeuver}
                        className="drive-nav-arrow-then"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="drive-nav-dist">{distLabel}</div>
              </div>
              <div className="drive-nav-body">
                <div className="drive-nav-instruction">{nav.instruction}</div>
                <div className="drive-nav-street">{nav.nextName}</div>
                <div className="drive-nav-route">
                  <span>{nav.startName}</span>
                  <span className="drive-nav-arrow">→</span>
                  <span>{nav.goalName}</span>
                </div>
                <div className="drive-nav-progress">
                  <div className="drive-nav-progress-bar">
                    <i style={{ width: `${Math.round(nav.progress * 100)}%` }} />
                  </div>
                  <div className="drive-nav-meta">
                    <span>남은 거리 {remainLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
