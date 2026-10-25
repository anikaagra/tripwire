"use client";

import { useEffect } from "react";
import "./night-gallery.css";

/**
 * The room the dashboard sits in: a gallery after hours. A polished floor
 * crossed by laser tripwires, and a point of light that follows the pointer and
 * brightens whatever beams it passes over. Purely decorative: every layer is
 * behind the content and ignores the pointer, so text keeps full contrast.
 */

// Laser beams across the floor, in a 100 x 40 box (y grows toward the viewer).
// Nearer beams are drawn brighter and thicker than the far ones.
const BEAMS: { x1: number; y1: number; x2: number; y2: number; near: number }[] = [
  { x1: 0, y1: 9, x2: 100, y2: 12, near: 0.25 },
  { x1: 0, y1: 17, x2: 100, y2: 27, near: 0.5 },
  { x1: 0, y1: 31, x2: 100, y2: 22, near: 0.65 },
  { x1: 6, y1: 40, x2: 64, y2: 7, near: 0.8 },
  { x1: 100, y1: 40, x2: 38, y2: 10, near: 0.8 },
  { x1: 0, y1: 38, x2: 100, y2: 35, near: 1 },
];

// Floor joints converging on a vanishing point above the top edge.
const VANISH = { x: 50, y: -34 };
const JOINTS_X = Array.from({ length: 17 }, (_, i) => -46 + i * 12);
const JOINTS_Y = [40, 33.2, 27.6, 23.1, 19.4, 16.4, 13.9, 11.9];

function Floor({ lit }: { lit?: boolean }) {
  return (
    <svg className="gallery-floor-svg" viewBox="0 0 100 40" preserveAspectRatio="none">
      {!lit && (
        <g className="gallery-joints">
          {JOINTS_X.map((x) => {
            // Clip each joint to the floor box along its line toward the vanishing point.
            const t = (40 - 8) / (40 - VANISH.y);
            return <line key={x} x1={x} y1={40} x2={x + (VANISH.x - x) * t} y2={8} vectorEffect="non-scaling-stroke" />;
          })}
          {JOINTS_Y.map((y) => (
            <line key={y} x1={0} y1={y} x2={100} y2={y} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      )}
      <g className="gallery-beams">
        {BEAMS.map(({ near, ...points }, i) => (
          <line
            key={i}
            {...points}
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 0.6 + near * 1.1, opacity: 0.25 + near * 0.55, animationDelay: `${i * -1.7}s` }}
          />
        ))}
        <line className="gallery-sweep" x1={0} y1={26} x2={100} y2={26} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

export function NightGallery() {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    let x = window.innerWidth * 0.5;
    let y = window.innerHeight * 0.78;
    const apply = () => {
      frame = 0;
      root.style.setProperty("--mx", `${x}px`);
      root.style.setProperty("--my", `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      x = e.clientX;
      y = e.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="night-gallery" aria-hidden>
      <div className="gallery-floor">
        <Floor />
      </div>
      {/* The same beams again, only visible inside the circle of light */}
      <div className="gallery-lit">
        <div className="gallery-floor">
          <Floor lit />
        </div>
      </div>
      <div className="gallery-flashlight" />
      <div className="gallery-vignette" />
    </div>
  );
}
