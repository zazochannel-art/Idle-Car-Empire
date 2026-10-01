"use client";

import { useRef } from "react";
import type { CarConfig } from "@/game/config/cars";
import type { FactoryId } from "@/game/types";
import { CarSprite } from "./car-sprite";
import { Bloom, Dust, FloorReflection, Mist, Robot, Worker } from "./props";
import { applyStage, stageOf } from "./stages";
import { useBuildAnimation } from "./use-build-animation";

const FLOOR = 378;
/** Cars ride on a skillet track flush with the floor. */
const LINE_Y = FLOOR - 5;
const CAR_SCALE = 0.86;
const CAR_W = 200 * CAR_SCALE;

/** Where the car sits along the line at each progress point (centre x). */
const PATH: [number, number][] = [
  [0, -120],
  [0.06, 110],
  [0.15, 110],
  [0.2, 320],
  [0.39, 320],
  [0.45, 530],
  [0.59, 530],
  [0.65, 725],
  [0.8, 725],
  [0.85, 880],
  [0.91, 880],
  [1, 1160],
];

function along(p: number): { x: number; moving: boolean } {
  for (let i = 1; i < PATH.length; i++) {
    const [p1, x1] = PATH[i];
    const [p0, x0] = PATH[i - 1];
    if (p <= p1) {
      const t = (p - p0) / (p1 - p0 || 1);
      return { x: x0 + (x1 - x0) * t, moving: x1 !== x0 };
    }
  }
  return { x: PATH[PATH.length - 1][1], moving: false };
}

/**
 * A modern production hall: chassis → welding robots → paint booth →
 * assembly → QC light tunnel. A second line runs in the background for
 * depth; bigger plants get white robots and a brighter, cleaner hall.
 */
export function PlantScene({ factory, tier, car, accent, name, city }: { factory: FactoryId; tier: number; car: CarConfig; accent: string; name: string; city: string }) {
  const carRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const robots = tier >= 6 ? 3 : 2;
  const premium = tier >= 6;
  const carId = `pl-car-${factory}`;

  useBuildAnimation(
    factory,
    carRef,
    (p) => {
      const a = along(p);
      return { x: a.x - CAR_W / 2, y: LINE_Y - 72 * CAR_SCALE, rolling: a.moving };
    },
    (p, active) => applyStage(svgRef.current, stageOf(p), active),
  );

  const stations: [number, string][] = [
    [110, "CHASSIS"],
    [320, "BODY WELD"],
    [530, "PAINT"],
    [725, "ASSEMBLY"],
    [880, "QC"],
  ];

  return (
    <svg ref={svgRef} viewBox="0 0 1000 440" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pl-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0d13" />
          <stop offset="1" stopColor={premium ? "#232b3a" : "#1a1f28"} />
        </linearGradient>
        <linearGradient id="pl-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={premium ? "#4a5263" : "#363c48"} />
          <stop offset="0.4" stopColor={premium ? "#2b313d" : "#232832"} />
          <stop offset="1" stopColor="#0d1015" />
        </linearGradient>
        <linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1224" />
          <stop offset="0.7" stopColor="#1e3a5f" />
          <stop offset="1" stopColor="#38557a" />
        </linearGradient>
        <linearGradient id="pl-ray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93c5fd" stopOpacity="0.2" />
          <stop offset="1" stopColor="#93c5fd" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pl-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fef3c7" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="pl-pool">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.18" />
          <stop offset="1" stopColor="#fef3c7" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pl-booth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.2" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0.06" />
        </linearGradient>
        <linearGradient id="pl-led" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={accent} stopOpacity="0" />
          <stop offset="0.5" stopColor={accent} />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <pattern id="pl-panel" width="50" height="240" patternUnits="userSpaceOnUse">
          <rect width="50" height="240" fill="url(#pl-wall)" />
          <rect x="48" width="2" height="240" fill="#000" opacity="0.4" />
          <rect x="0" width="1" height="240" fill="white" opacity="0.03" />
        </pattern>
        <pattern id="pl-hazard" width="24" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-40)">
          <rect width="24" height="10" fill="#111" />
          <rect width="12" height="10" fill="#facc15" />
        </pattern>
        <Bloom id="pl-bloom" radius={5} />
        <filter id="pl-blur">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
        <filter id="pl-blur-fg">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* ── Hall shell ── */}
      <rect width="1000" height="440" fill="url(#pl-panel)" />
      <g>
        <rect x="20" y="62" width="960" height="76" fill="url(#pl-sky)" />
        <path
          d="M20 138 l0 -26 l40 0 l0 -18 l30 0 l0 30 l50 0 l0 -40 l26 0 l0 40 l60 0 l0 -22 l44 0 l0 26 l70 0 l0 -34 l20 -10 l20 10 l0 34 l90 0 l0 -20 l40 0 l0 20 l60 0 l0 -44 l30 0 l0 44 l80 0 l0 -24 l50 0 l0 24 l80 0 l0 -30 l40 0 l0 30 l100 0 l0 26 z"
          fill="#0a0f1a"
        />
        {Array.from({ length: 30 }).map((_, i) => (
          <rect key={i} x={40 + ((i * 97) % 920)} y={112 + ((i * 13) % 20)} width="3" height="4" fill="#fde68a" opacity="0.7" />
        ))}
        {Array.from({ length: 13 }).map((_, i) => (
          <rect key={i} x={18 + i * 80} y="62" width="5" height="76" fill="#1f2937" />
        ))}
      </g>
      {/* Daylight beams from the clerestory */}
      {[120, 360, 600, 840].map((x) => (
        <path key={x} d={`M${x} 138 L${x + 70} 138 L${x + 170} ${FLOOR} L${x + 40} ${FLOOR} Z`} fill="url(#pl-ray)" style={{ mixBlendMode: "screen" }} />
      ))}
      {/* Roof trusses */}
      <rect width="1000" height="58" fill="#0b0e13" />
      <path d={Array.from({ length: 21 }, (_, i) => `M${i * 50} 58 L${i * 50 + 25} 14 L${i * 50 + 50} 58`).join(" ")} stroke="#2a313d" strokeWidth="4" fill="none" />
      <rect y="12" width="1000" height="5" fill="#2a313d" />
      <rect y="56" width="1000" height="6" fill="#262c37" />
      {/* Pipes, cable tray, accent LED */}
      <rect y="146" width="1000" height="8" fill="#334155" />
      <rect y="146" width="1000" height="2" fill="white" opacity="0.12" />
      <rect y="158" width="1000" height="3" fill="url(#pl-led)" filter="url(#pl-bloom)" />

      {/* Wall screens with live production charts */}
      {[40, 905].map((x) => (
        <g key={x} transform={`translate(${x} 176)`}>
          <rect width="58" height="38" rx="3" fill="#05070b" stroke="#334155" />
          <polyline points="5,30 14,24 22,27 31,16 40,19 52,8" fill="none" stroke={accent} strokeWidth="1.8" className="screen-blink" />
          <rect x="5" y="32" width="48" height="2" fill="#1e293b" />
        </g>
      ))}

      {/* Plant name */}
      <g filter="url(#pl-bloom)">
        <text x="500" y="196" textAnchor="middle" fontSize="20" fontWeight="800" letterSpacing="6" fill={accent} className="neon-flicker">
          {name.toUpperCase()}
        </text>
      </g>
      <text x="500" y="212" textAnchor="middle" fontSize="9" letterSpacing="5" fill="#94a3b8">
        {city.toUpperCase()} ASSEMBLY PLANT
      </text>

      {/* ── Background line (depth) ── */}
      <g filter="url(#pl-blur)" opacity="0.55">
        <rect y="300" width="1000" height="5" fill="#1f2937" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i} className="bg-car" style={{ animationDelay: `${-i * 3.5}s` }}>
            <g transform="translate(0 276)">
              <path d="M0 24 q2 -10 16 -12 l12 -8 l28 0 l12 8 q14 2 14 12 z" fill={i % 2 ? "#64748b" : "#475569"} />
              <circle cx="18" cy="24" r="5" fill="#0b0d12" />
              <circle cx="64" cy="24" r="5" fill="#0b0d12" />
            </g>
          </g>
        ))}
      </g>

      {/* Station signs + lamps */}
      {stations.map(([x, label]) => (
        <g key={label}>
          <path d={`M${x - 46} 252 L${x + 46} 252 L${x + 120} ${FLOOR} L${x - 120} ${FLOOR} Z`} fill="url(#pl-cone)" className="lamp-cone" />
          <ellipse cx={x} cy={FLOOR + 14} rx="130" ry="14" fill="url(#pl-pool)" />
          <line x1={x} y1="154" x2={x} y2="224" stroke="#1f2937" strokeWidth="2" />
          <g transform={`translate(${x} 236)`}>
            <rect x="-48" y="-13" width="96" height="24" rx="5" fill="#0b0d12" stroke="#3b4556" />
            <rect x="-48" y="9" width="96" height="2" rx="1" fill={accent} opacity="0.7" />
            <text y="4" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="2" fill="#e2e8f0">
              {label}
            </text>
          </g>
          <rect x={x - 46} y="248" width="92" height="4" rx="2" fill="#fef9c3" filter="url(#pl-bloom)" />
        </g>
      ))}

      {/* ── Floor ── */}
      <rect y={FLOOR} width="1000" height={440 - FLOOR} fill="url(#pl-floor)" />
      <g stroke="white" strokeOpacity="0.05">
        {Array.from({ length: 15 }, (_, i) => -300 + i * 120).map((x) => (
          <line key={x} x1={500 + (x - 500) * 0.4} y1={FLOOR} x2={x} y2="440" />
        ))}
      </g>
      <rect y={FLOOR + 40} width="1000" height="7" fill="url(#pl-hazard)" opacity="0.75" />

      {/* Forklift in the back */}
      <g className="forklift" opacity="0.9">
        <g transform={`translate(30 ${FLOOR - 46})`}>
          <rect x="0" y="10" width="44" height="26" rx="4" fill="#f59e0b" />
          <rect x="0" y="10" width="44" height="4" rx="2" fill="#fde68a" opacity="0.5" />
          <rect x="8" y="-14" width="26" height="26" rx="3" fill="none" stroke="#1f2937" strokeWidth="3" />
          <rect x="44" y="-18" width="4" height="54" fill="#374151" />
          <rect x="48" y="26" width="26" height="4" fill="#374151" />
          <rect x="50" y="6" width="22" height="20" fill="#a16207" />
          <circle cx="10" cy="38" r="8" fill="#0d0f13" />
          <circle cx="36" cy="38" r="8" fill="#0d0f13" />
        </g>
      </g>

      {/* Paint booth (glass, lit from inside) */}
      <g>
        <rect x="438" y="258" width="184" height={LINE_Y - 258 + 4} rx="4" fill="url(#pl-booth)" stroke="#bae6fd" strokeOpacity="0.35" />
        <rect x="438" y="252" width="184" height="10" rx="3" fill="#475569" />
        <rect x="446" y="262" width="168" height="3" fill="#e0f2fe" opacity="0.8" filter="url(#pl-bloom)" />
        {[470, 510, 550, 590].map((x) => (
          <rect key={x} x={x - 3} y="265" width="6" height="10" fill="#64748b" />
        ))}
        <path d={`M444 268 L444 ${LINE_Y} M616 268 L616 ${LINE_Y}`} stroke="white" strokeOpacity="0.12" strokeWidth="2" />
      </g>

      {/* Welding robots */}
      <g data-fx="robots" className="robot-cell">
        {Array.from({ length: robots }).map((_, i) => (
          <Robot key={i} x={250 + i * (robots === 3 ? 70 : 120)} y={LINE_Y} scale={0.95} delay={i * 0.45} color={premium ? "#e5e7eb" : "#f97316"} />
        ))}
      </g>

      {/* Overhead hoist with a wheel at assembly */}
      <g>
        <rect x="640" y="164" width="170" height="8" fill="#475569" />
        <g className="hoist">
          <rect x="700" y="172" width="20" height="14" rx="2" fill="#facc15" />
          <line x1="710" y1="186" x2="710" y2="252" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="710" cy="266" r="14" fill="#0d0f13" />
          <circle cx="710" cy="266" r="7" fill="#9ca3af" />
        </g>
      </g>

      {/* QC light tunnel */}
      <g>
        <path d={`M820 ${LINE_Y} L820 292 Q880 256 940 292 L940 ${LINE_Y}`} fill="none" stroke="#1f2937" strokeWidth="16" />
        <path d={`M820 ${LINE_Y} L820 292 Q880 256 940 292 L940 ${LINE_Y}`} fill="none" stroke="#e0f2fe" strokeWidth="4" strokeDasharray="16 8" opacity="0.4" />
      </g>

      {/* Skillet track flush with the floor */}
      <g data-fx="line">
        <rect x="0" y={LINE_Y} width="1000" height="7" fill="#1b2029" />
        <line x1="0" y1={LINE_Y + 3} x2="1000" y2={LINE_Y + 3} stroke="#64748b" strokeWidth="3" strokeDasharray="10 10" className="conveyor-rollers" />
        <rect x="0" y={LINE_Y + 7} width="1000" height="2" fill={accent} opacity="0.55" filter="url(#pl-bloom)" />
      </g>

      {/* Reflection of the car in the polished floor */}
      <FloorReflection href={`#${carId}`} floor={FLOOR + 4} idPrefix={`pl-${factory}`} opacity={0.28} />

      {/* The car moving down the line */}
      <g ref={carRef} id={carId}>
        <g key={car.id} transform={`scale(${CAR_SCALE})`}>
          <CarSprite type={car.id} color={car.color} idPrefix={`pl-${factory}-${car.id}`} />
        </g>
      </g>

      {/* Station effects in front of the car */}
      <g data-fx="paint" style={{ display: "none" }}>
        <Mist x={530} y={LINE_Y - 70} color={car.color} />
      </g>
      <g data-fx="qc" style={{ display: "none" }}>
        <path d={`M820 ${LINE_Y} L820 292 Q880 256 940 292 L940 ${LINE_Y}`} fill="none" stroke="#e0f2fe" strokeWidth="4" strokeDasharray="16 8" className="qc-scan" filter="url(#pl-bloom)" />
        <ellipse cx="880" cy={FLOOR + 10} rx="90" ry="8" fill="#e0f2fe" opacity="0.18" />
      </g>
      <g data-fx="assembly" style={{ display: "none" }}>
        {[676, 746].map((x) => (
          <g key={x} transform={`translate(${x} ${LINE_Y - 12})`} className="weld-spark">
            <circle r="3" fill="#fde68a" />
            <circle r="8" fill="#f59e0b" opacity="0.35" />
          </g>
        ))}
      </g>

      <Dust x={150} y={160} w={700} h={200} count={18} />

      {/* Workers */}
      <Worker x={150} y={FLOOR + 6} suit="#1e40af" tool="wrench" className="worker-busy" />
      <Worker x={628} y={FLOOR + 8} suit="#0f766e" helmet="#f97316" tool="wrench" className="worker-busy" />
      <Worker x={955} y={FLOOR + 8} suit="#334155" helmet="#e5e7eb" tool="tablet" flip />

      {/* Out-of-focus foreground railing for depth */}
      <g filter="url(#pl-blur-fg)" opacity="0.85">
        <rect x="-10" y="424" width="1020" height="8" fill="#facc15" />
        {[60, 300, 540, 780].map((x) => (
          <rect key={x} x={x} y="404" width="10" height="40" fill="#ca8a04" />
        ))}
      </g>
    </svg>
  );
}
