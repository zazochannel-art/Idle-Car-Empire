"use client";

// The start of the game, before the map: the logo on the night-blue backdrop it
// was drawn on, with light rays, rising sparks, a skyline of the empire's
// factories and a road along the bottom; under the logo, whatever the start
// needs (loading, the welcome page, a save to choose). Its moving parts are CSS
// (globals.css, "start screen") and stand still when the phone asks for less motion.
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";

/** Sparks rising from the bottom: left %, size px, delay s, duration s (fixed, so the page renders the same everywhere). */
const SPARKS: [number, number, number, number][] = [
  [6, 3, 0, 9],
  [14, 2, 3.5, 11],
  [22, 4, 1.2, 8],
  [31, 2, 5.4, 12],
  [38, 3, 2.1, 10],
  [47, 2, 6.8, 9],
  [55, 4, 0.6, 11],
  [63, 2, 4.2, 8],
  [71, 3, 7.5, 12],
  [79, 2, 1.8, 10],
  [86, 4, 5.9, 9],
  [94, 2, 2.9, 11],
];

/** The skyline's buildings on a 360 × 90 grid: x, width, height (from the ground at 90). */
const BUILDINGS: [number, number, number][] = [
  [0, 22, 38], [20, 16, 52], [34, 26, 30], [58, 14, 64], [70, 30, 44], [98, 12, 26],
  [108, 48, 28], [158, 20, 48], [176, 10, 70], [184, 28, 40], [210, 18, 56], [226, 34, 32],
  [258, 14, 62], [270, 24, 46], [292, 20, 28], [310, 16, 58], [324, 36, 36],
];
/** The factory's chimneys (x, height): smoke rises from them. */
const CHIMNEYS: [number, number][] = [
  [116, 54],
  [130, 62],
];
/** Lit windows: a fixed scatter over the taller buildings; every fifth one twinkles. */
const WINDOWS = BUILDINGS.flatMap(([x, w, h], b) => {
  const out: { x: number; y: number; twinkle: boolean }[] = [];
  if (h < 30) return out;
  for (let wy = 90 - h + 6; wy < 84; wy += 7)
    for (let wx = x + 3; wx < x + w - 3; wx += 6) {
      const hash = (wx * 73 + wy * 151 + b * 29) % 11;
      if (hash < 4) out.push({ x: wx, y: wy, twinkle: hash === 0 });
    }
  return out;
});

function Skyline() {
  return (
    <svg aria-hidden viewBox="0 0 360 90" preserveAspectRatio="xMidYMax slice" className="start-skyline">
      <defs>
        <linearGradient id="start-building" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#16283f" />
          <stop offset="1" stopColor="#0a1220" />
        </linearGradient>
      </defs>
      {CHIMNEYS.map(([x, h]) => (
        <g key={x}>
          <rect x={x} y={90 - h} width={6} height={h} fill="url(#start-building)" />
          <rect x={x} y={90 - h + 4} width={6} height={3} fill="#c2410c" opacity={0.7} />
          <circle className="start-smoke" cx={x + 3} cy={90 - h - 2} r={4} style={{ animationDelay: `${x % 3}s` }} />
          <circle className="start-smoke" cx={x + 3} cy={90 - h - 2} r={4} style={{ animationDelay: `${(x % 3) + 1.6}s` }} />
        </g>
      ))}
      {BUILDINGS.map(([x, w, h]) => (
        <rect key={x} x={x} y={90 - h} width={w} height={h} fill="url(#start-building)" />
      ))}
      {WINDOWS.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={2} height={2.5} fill="#ffc21a" className={p.twinkle ? "start-window" : undefined} opacity={p.twinkle ? undefined : 0.55} />
      ))}
    </svg>
  );
}

/** The start screen around `children`; `compact` makes room for a form under the logo. */
export function StartScreen({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative isolate flex min-h-dvh flex-col items-center justify-center gap-5 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)]",
        // clear of the skyline and the road; a form may stand in front of the skyline
        compact ? "pb-[calc(env(safe-area-inset-bottom)+4rem)]" : "pb-[calc(env(safe-area-inset-bottom)+7rem)]",
      )}
    >
      {/* the scenery, clipped in a layer of its own: were the page itself clipping it, the page
          would scroll sideways when a field or a button is brought into view */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="start-backdrop" />
        <div className="start-rays" />
        {SPARKS.map(([left, size, delay, duration]) => (
          <span key={left} className="start-spark" style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${duration}s` }} />
        ))}
        <Skyline />
        <div className="start-road">
          <div className="start-lane" />
          <span className="start-trail" />
          <span className="start-trail start-trail-2" />
        </div>
      </div>

      <motion.div layout transition={{ type: "spring", stiffness: 170, damping: 24 }} className={cn("relative", compact ? "w-[min(46vw,11.5rem)]" : "w-[min(72vw,18rem)]")}>
        <div className="start-float">
          {/* the game's logo (public/logo.webp, drawn by `npm run app:assets`); its entrance is CSS,
              so it plays with the first paint, before the scripts start */}
          <Image src="/logo.webp" alt="Idle Car Empire" width={720} height={720} loading="eager" fetchPriority="high" draggable={false} className="start-logo h-auto w-full select-none" />
        </div>
      </motion.div>
      {children}
    </div>
  );
}

/** Loading: a bar that keeps running (how long the account and the save take is not known). */
export function StartLoading({ label }: { label: string }) {
  return (
    <div className="flex w-56 flex-col items-center gap-2.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 ring-1 ring-white/10">
        <div className="start-progress h-full w-1/3 rounded-full bg-gradient-to-r from-gold-deep via-gold to-[#ffe68a]" />
      </div>
      <div className="race-type text-[11px] tracking-[0.18em] text-white/60">{label}</div>
    </div>
  );
}
