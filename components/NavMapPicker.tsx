"use client";

import { useMemo, useRef, useState, PointerEvent, WheelEvent } from "react";
import { RoadMap, astar, nodePositions, pathToPoints } from "@/lib/map";
import { PLACE_NAMES } from "@/lib/nav-guidance";

type Step = "start" | "goal" | "ready";

type Props = {
  map: RoadMap;
  startNodeId: number | null;
  goalNodeId: number | null;
  onSelectStart: (id: number) => void;
  onSelectGoal: (id: number) => void;
  onReset: () => void;
};

export function NavMapPicker({
  map,
  startNodeId,
  goalNodeId,
  onSelectStart,
  onSelectGoal,
  onReset,
}: Props) {
  const pos = useMemo(() => nodePositions(map), [map]);
  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [, p] of pos) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minZ = Math.min(minZ, p[1]);
      maxZ = Math.max(maxZ, p[1]);
    }
    const pad = 40;
    return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
  }, [pos]);

  const pathIds = useMemo(() => {
    if (startNodeId == null || goalNodeId == null) return null;
    return astar(map, startNodeId, goalNodeId);
  }, [map, startNodeId, goalNodeId]);

  const routePts = useMemo(() => {
    if (!pathIds) return [];
    return pathToPoints(map, pathIds);
  }, [map, pathIds]);

  const step: Step =
    startNodeId == null ? "start" : goalNodeId == null ? "goal" : "ready";

  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxZ - bounds.minZ;
  const vb = `${bounds.minX} ${bounds.minZ} ${w} ${h}`;

  function clientToWorld(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, z: local.y };
  }

  function nearestNode(x: number, z: number) {
    let best = -1;
    let bestD = Infinity;
    for (const [id, p] of pos) {
      const d = Math.hypot(p[0] - x, p[1] - z);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    // ~35m tap radius in world units
    return bestD < 35 ? best : -1;
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) < 4) return;
    setView((v) => ({
      ...v,
      x: drag.current!.vx + dx,
      y: drag.current!.vy + dy,
    }));
  }

  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) return;
    const world = clientToWorld(e.clientX, e.clientY);
    if (!world) return;
    const id = nearestNode(world.x, world.z);
    if (id < 0) return;
    if (step === "start") onSelectStart(id);
    else if (step === "goal") {
      if (id === startNodeId) return;
      onSelectGoal(id);
    }
  }

  function onWheel(e: WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const next = Math.min(2.4, Math.max(0.55, view.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
    setView((v) => ({ ...v, scale: next }));
  }

  return (
    <div className="nav-map-shell">
      <div className="nav-map-steps">
        <span className={step === "start" ? "active" : startNodeId != null ? "done" : ""}>
          1 출발
        </span>
        <span className={step === "goal" ? "active" : goalNodeId != null ? "done" : ""}>
          2 도착
        </span>
        <span className={step === "ready" ? "active" : ""}>3 경로</span>
      </div>
      <p className="nav-map-hint">
        {step === "start" && "지도를 탭해 출발지를 선택하세요. (드래그로 이동, 휠로 확대)"}
        {step === "goal" &&
          `출발: ${PLACE_NAMES[startNodeId!] ?? `#${startNodeId}`} — 도착지를 선택하세요.`}
        {step === "ready" &&
          (pathIds
            ? `${PLACE_NAMES[startNodeId!] ?? startNodeId} → ${PLACE_NAMES[goalNodeId!] ?? goalNodeId} · ${routePts.length - 1}개 구간`
            : "경로를 찾을 수 없습니다. 다시 선택하세요.")}
      </p>

      <div className="nav-map-frame">
        <svg
          ref={svgRef}
          className="nav-map-svg"
          viewBox={vb}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onWheel={onWheel}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        >
          <rect
            x={bounds.minX}
            y={bounds.minZ}
            width={w}
            height={h}
            fill="#e8eef2"
          />
          {map.edges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return (
              <line
                key={i}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="#b8c4ce"
                strokeWidth={10}
                strokeLinecap="round"
              />
            );
          })}
          {map.edges.map((e, i) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            return (
              <line
                key={`c${i}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="#ffffff"
                strokeWidth={2.2}
                strokeDasharray="6 8"
                strokeLinecap="round"
              />
            );
          })}
          {routePts.length > 1 ? (
            <polyline
              points={routePts.map((p) => `${p.x},${p.z}`).join(" ")}
              fill="none"
              stroke="#2f6bff"
              strokeWidth={5}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.95}
            />
          ) : null}
          {map.nodes.map((n) => {
            const p = pos.get(n.id)!;
            const isStart = n.id === startNodeId;
            const isGoal = n.id === goalNodeId;
            return (
              <g key={n.id}>
                <circle
                  cx={p[0]}
                  cy={p[1]}
                  r={isStart || isGoal ? 9 : 6}
                  fill={isStart ? "#1db954" : isGoal ? "#e74c3c" : "#2c3e50"}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text
                  x={p[0] + 11}
                  y={p[1] + 3}
                  fontSize={9}
                  fill="#1a2430"
                  style={{ pointerEvents: "none" }}
                >
                  {PLACE_NAMES[n.id] ?? `#${n.id}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="nav-map-legend">
        <span>
          <i className="dot start" /> 출발
        </span>
        <span>
          <i className="dot goal" /> 도착
        </span>
        <span>
          <i className="line" /> 안내 경로
        </span>
        <button type="button" className="btn-ghost" onClick={onReset}>
          다시 선택
        </button>
      </div>
    </div>
  );
}
