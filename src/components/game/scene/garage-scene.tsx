"use client";

import { useRef } from "react";
import type { CarConfig } from "@/game/config/cars";
import { CarSprite } from "./car-sprite";
import { Bloom, Dust, FloorReflection, Mist, Worker } from "./props";
import { applyStage, stageOf } from "./stages";
import { useBuildAnimation } from "./use-build-animation";

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const ramp = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));

const FLOOR = 382;
const CAR_SCALE = 1.3;
const CAR_X = 330;
const LIFT = 46;
const DOOR_X = 770;

/**
 * The Small Garage: brick walls, a two-post lift, a pegboard, tyres and a
 * roll-up door to a street at sunset. The car is built on the lift in front
 * of you, reflected in the epoxy floor, and drives out when it is finished.
 */
export function GarageScene({ car, accent, name, city }: { car: CarConfig; accent: string; name: string; city: string }) {
  const carRef = useRef<SVGGElement>(null);
  const liftRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useBuildAnimation(
    "garage",
    carRef,
    (p) => {
      const lift = ramp(p, 0.12, 0.2) - ramp(p, 0.82, 0.88);
      const out = ease(ramp(p, 0.9, 1));
      return { x: CAR_X + out * 760, y: FLOOR - 72 * CAR_SCALE - lift * LIFT, rolling: out > 0 };
    },
    (p, active) => {
      const lift = ramp(p, 0.12, 0.2) - ramp(p, 0.82, 0.88);
      liftRef.current?.setAttribute("transform", `translate(0 ${(-lift * LIFT).toFixed(1)})`);
      applyStage(svgRef.current, stageOf(p), active);
    },
  );

  // Floor tiles converge on a vanishing point behind the lift.
  const vpX = 500;
  const vpY = 170;
  const tileLines = Array.from({ length: 15 }, (_, i) => -400 + i * 130);

  return (
    <svg ref={svgRef} viewBox="0 0 1000 440" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="gar-brick" width="60" height="28" patternUnits="userSpaceOnUse">
          <rect width="60" height="28" fill="#2e211d" />
          <rect x="1" y="1" width="57" height="12" rx="1.5" fill="#5f3e33" />
          <rect x="-29" y="15" width="57" height="12" rx="1.5" fill="#563629" />
          <rect x="31" y="15" width="57" height="12" rx="1.5" fill="#66443a" />
          <rect x="1" y="1" width="57" height="2" fill="white" opacity="0.05" />
        </pattern>
        <pattern id="gar-peg" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#7a6650" />
          <circle cx="6" cy="6" r="1.4" fill="#3d3226" />
        </pattern>
        <filter id="gar-grime">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.05" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.3 -0.45" />
        </filter>
        <linearGradient id="gar-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.7" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="gar-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4150" />
          <stop offset="0.35" stopColor="#262b36" />
          <stop offset="1" stopColor="#11141a" />
        </linearGradient>
        <linearGradient id="gar-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset="0.45" stopColor="#9d174d" />
          <stop offset="0.75" stopColor="#ea580c" />
          <stop offset="1" stopColor="#fcd34d" />
        </linearGradient>
        <linearGradient id="gar-ray" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdba74" stopOpacity="0.38" />
          <stop offset="1" stopColor="#fdba74" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="gar-cone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.2" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="gar-pool">
          <stop offset="0" stopColor="#e0f2fe" stopOpacity="0.16" />
          <stop offset="1" stopColor="#e0f2fe" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="gar-sun">
          <stop offset="0" stopColor="#fff7ed" />
          <stop offset="0.4" stopColor="#fdba74" />
          <stop offset="1" stopColor="#fdba74" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gar-blue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="0.45" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1e40af" />
        </linearGradient>
        <linearGradient id="gar-red" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="0.4" stopColor="#dc2626" />
          <stop offset="1" stopColor="#991b1b" />
        </linearGradient>
        <clipPath id="gar-floor-clip">
          <rect y={FLOOR} width="1000" height={440 - FLOOR} />
        </clipPath>
        <Bloom id="gar-bloom" radius={5} />
        <Bloom id="gar-bloom-soft" radius={12} />
        <filter id="gar-blur">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {/* ── Back wall ── */}
      <rect width="1000" height="440" fill="url(#gar-brick)" />
      <rect width="1000" height="440" filter="url(#gar-grime)" opacity="0.6" />
      <rect width="1000" height="440" fill="url(#gar-shade)" />
      <rect y={FLOOR - 22} width={DOOR_X - 10} height="22" fill="#1a1d23" />
      <rect y={FLOOR - 22} width={DOOR_X - 10} height="2" fill="white" opacity="0.06" />

      {/* ── Roll-up door: street at sunset ── */}
      <g>
        <rect x={DOOR_X} y="118" width="210" height={FLOOR - 118} fill="url(#gar-sky)" />
        <circle cx="905" cy={FLOOR - 66} r="60" fill="url(#gar-sun)" />
        {/* far skyline */}
        <path
          d={`M${DOOR_X} ${FLOOR - 52} l0 -38 l22 0 l0 -24 l18 0 l0 30 l30 0 l0 -46 l14 -10 l14 10 l0 46 l26 0 l0 -20 l30 0 l0 34 l24 0 l0 -40 l32 0 l0 58 z`}
          fill="#4c1d95"
          opacity="0.55"
        />
        {/* near skyline */}
        <path d={`M${DOOR_X} ${FLOOR - 30} l0 -50 l34 0 l0 22 l28 0 l0 -60 l40 0 l0 70 l30 -14 l0 -34 l44 0 l0 50 l34 0 l0 46 z`} fill="#140c24" />
        {[784, 800, 836, 846, 880, 920, 936, 960].map((x, i) => (
          <rect key={x} x={x} y={FLOOR - 70 - (i % 3) * 16} width="4" height="5" fill="#fde68a" opacity={0.6 + (i % 2) * 0.3} />
        ))}
        {/* street + lamp post */}
        <rect x={DOOR_X} y={FLOOR - 30} width="210" height="30" fill="#1f2128" />
        <line x1={DOOR_X} y1={FLOOR - 16} x2={DOOR_X + 210} y2={FLOOR - 16} stroke="#facc15" strokeWidth="2" strokeDasharray="12 10" opacity="0.6" />
        <rect x="944" y={FLOOR - 120} width="3" height="92" fill="#111827" />
        <path d={`M946 ${FLOOR - 120} q14 0 16 8`} stroke="#111827" strokeWidth="3" fill="none" />
        <circle cx="962" cy={FLOOR - 110} r="10" fill="#fde68a" opacity="0.45" filter="url(#gar-bloom)" />
        {/* door slats rolled up + frame */}
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={DOOR_X} y={118 + i * 9} width="210" height="8" fill="#a3aab5" />
            <rect x={DOOR_X} y={118 + i * 9 + 6} width="210" height="2" fill="#4b5563" />
          </g>
        ))}
        <rect x={DOOR_X - 10} y="106" width="230" height="14" fill="#262a31" />
        <rect x={DOOR_X - 10} y="106" width="10" height={FLOOR - 106} fill="#2b2f36" />
        <rect x={DOOR_X + 210} y="106" width="10" height={FLOOR - 106} fill="#2b2f36" />
        <rect x={DOOR_X - 2} y="150" width="3" height={FLOOR - 160} fill="#facc15" opacity="0.7" />
      </g>

      {/* ── Ceiling + fluorescent tubes ── */}
      <rect width="1000" height="36" fill="#121418" />
      <rect y="34" width="1000" height="3" fill="#1d2027" />
      {[150, 470].map((x) => (
        <g key={x}>
          <path d={`M${x - 70} 46 L${x + 70} 46 L${x + 190} ${FLOOR} L${x - 190} ${FLOOR} Z`} fill="url(#gar-cone)" className="lamp-cone" />
          <ellipse cx={x} cy={FLOOR + 18} rx="200" ry="22" fill="url(#gar-pool)" />
          <rect x={x - 72} y="38" width="144" height="8" rx="3" fill="#2a2e36" />
          <rect x={x - 66} y="44" width="132" height="4" rx="2" fill="#f0f9ff" filter="url(#gar-bloom)" />
        </g>
      ))}

      {/* ── Wall details ── */}
      {/* Pegboard with tools */}
      <g>
        <rect x="26" y="92" width="196" height="122" rx="4" fill="url(#gar-peg)" stroke="#2b2118" strokeWidth="4" />
        <path d="M50 106 l8 0 l0 50 l-8 0 z M46 102 a8 8 0 1 1 16 0 a8 8 0 1 1 -16 0" fill="#cbd5e1" />
        <path d="M80 108 l26 0 l0 10 l-9 0 l0 46 l-8 0 l0 -46 l-9 0 z" fill="#64748b" />
        <path d="M122 106 l6 0 l0 34 l3 0 l0 28 l-12 0 l0 -28 l3 0 z" fill="#ef4444" />
        <path d="M146 106 l14 0 l-4 22 l0 40 l-6 0 l0 -40 z" fill="#f59e0b" />
        <path d="M176 108 q16 4 18 24 l-6 2 q-2 -14 -12 -18 z M178 136 l6 0 l0 34 l-6 0 z" fill="#94a3b8" />
        <rect x="38" y="184" width="170" height="18" rx="3" fill="#2b2118" />
        {[48, 72, 96, 120, 144, 168, 192].map((x, i) => (
          <rect key={x} x={x} y="174" width="10" height="12" rx="2" fill={["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#14b8a6"][i]} />
        ))}
      </g>
      {/* Vintage poster */}
      <g transform="translate(244 104)">
        <rect width="74" height="100" rx="2" fill="#f5e6c8" />
        <rect x="5" y="5" width="64" height="62" fill="#b91c1c" />
        <circle cx="37" cy="36" r="22" fill="#fbbf24" />
        <path d="M10 52 q6 -10 18 -11 l9 -6 l15 0 l7 6 q8 1 9 11 z" fill="#111827" />
        <text x="37" y="80" textAnchor="middle" fontSize="8" fontWeight="800" fill="#7f1d1d">GRAND PRIX</text>
        <text x="37" y="92" textAnchor="middle" fontSize="7" fill="#7f1d1d">BUCUREȘTI 1987</text>
      </g>
      {/* Wall clock */}
      <g transform="translate(700 92)">
        <circle r="20" fill="#f8fafc" stroke="#1f2937" strokeWidth="3" />
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x="-0.8" y="-17" width="1.6" height="4" fill="#1f2937" transform={`rotate(${i * 30})`} />
        ))}
        <rect x="-1.2" y="-12" width="2.4" height="12" fill="#111827" transform="rotate(40)" />
        <rect x="-0.8" y="-16" width="1.6" height="16" fill="#111827" className="clock-hand" />
        <circle r="2" fill="#dc2626" />
      </g>
      {/* Shelf with oil cans */}
      <g transform="translate(664 200)">
        <rect width="92" height="5" fill="#57534e" />
        {[["#dc2626", 6], ["#facc15", 26], ["#2563eb", 46], ["#16a34a", 66]].map(([c, x]) => (
          <g key={x as number}>
            <rect x={x as number} y="-22" width="14" height="22" rx="2" fill={c as string} />
            <rect x={(x as number) + 2} y="-15" width="10" height="7" fill="white" opacity="0.7" />
          </g>
        ))}
      </g>

      {/* Neon sign */}
      <g filter="url(#gar-bloom)">
        <rect x="340" y="76" width="300" height="58" rx="10" fill="#0b0d12" stroke={accent} strokeWidth="2.5" />
        <text x="490" y="110" textAnchor="middle" fontSize="24" fontWeight="800" letterSpacing="5" fill={accent} className="neon-flicker">
          {name.toUpperCase()}
        </text>
        <text x="490" y="126" textAnchor="middle" fontSize="10" letterSpacing="6" fill="#fde68a">
          {city.toUpperCase()} · EST. 2026
        </text>
      </g>

      {/* Tool cabinet + workbench */}
      <g>
        <rect x="30" y={FLOOR - 136} width="112" height="136" rx="5" fill="url(#gar-red)" />
        <rect x="30" y={FLOOR - 136} width="112" height="6" rx="3" fill="#fca5a5" opacity="0.35" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x="37" y={FLOOR - 126 + i * 24} width="98" height="20" rx="2" fill="#b91c1c" />
            <rect x="37" y={FLOOR - 126 + i * 24} width="98" height="2" fill="white" opacity="0.15" />
            <rect x="68" y={FLOOR - 118 + i * 24} width="36" height="4" rx="2" fill="#e5e7eb" />
          </g>
        ))}
        <rect x="150" y={FLOOR - 92} width="122" height="10" rx="1" fill="#8a6440" />
        <rect x="150" y={FLOOR - 92} width="122" height="2" fill="white" opacity="0.15" />
        <rect x="158" y={FLOOR - 82} width="8" height="82" fill="#3f3f46" />
        <rect x="256" y={FLOOR - 82} width="8" height="82" fill="#3f3f46" />
        <rect x="160" y={FLOOR - 40} width="102" height="5" fill="#3f3f46" />
        <path d={`M178 ${FLOOR - 92} l0 -14 l26 0 l0 14 M184 ${FLOOR - 106} l0 -6 l14 0 l0 6`} fill="#475569" />
        <rect x="214" y={FLOOR - 104} width="44" height="12" rx="2" fill="#0284c7" />
        <rect x="216" y={FLOOR - 102} width="40" height="2" fill="white" opacity="0.3" />
      </g>

      {/* Tyre stack + extinguisher */}
      <g>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x="682" y={FLOOR - 26 - i * 22} width="66" height="22" rx="10" fill="#111318" />
            <rect x="682" y={FLOOR - 26 - i * 22} width="66" height="4" rx="2" fill="white" opacity="0.06" />
            <rect x="697" y={FLOOR - 21 - i * 22} width="36" height="12" rx="6" fill="#2b2f36" />
          </g>
        ))}
        <rect x="748" y={FLOOR - 52} width="14" height="40" rx="6" fill="#dc2626" />
        <rect x="751" y={FLOOR - 60} width="8" height="9" rx="2" fill="#1f2937" />
        <rect x="750" y={FLOOR - 40} width="10" height="10" fill="white" opacity="0.7" />
      </g>

      {/* ── Floor ── */}
      <rect y={FLOOR} width="1000" height={440 - FLOOR} fill="url(#gar-floor)" />
      <g clipPath="url(#gar-floor-clip)" stroke="white" strokeOpacity="0.05" strokeWidth="1">
        {tileLines.map((x) => (
          <line key={x} x1={vpX + (x - vpX) * 0.3} y1={vpY} x2={x} y2="440" />
        ))}
        {[FLOOR + 10, FLOOR + 24, FLOOR + 44].map((y) => (
          <line key={y} x1="0" y1={y} x2="1000" y2={y} />
        ))}
      </g>
      {/* Sunset light through the door, across the floor */}
      <path d={`M${DOOR_X} 130 L${DOOR_X} ${FLOOR} L${DOOR_X - 380} 440 L${DOOR_X - 120} 440 L${DOOR_X + 210} ${FLOOR} L${DOOR_X + 210} 130 Z`} fill="url(#gar-ray)" style={{ mixBlendMode: "screen" }} />
      <ellipse cx="560" cy={FLOOR + 30} rx="130" ry="10" fill="#0b0d12" opacity="0.35" />
      <ellipse cx="420" cy={FLOOR + 40} rx="30" ry="4" fill="#0b0d12" opacity="0.5" />
      {/* Lift bay markings */}
      <path d={`M${CAR_X - 20} ${FLOOR + 3} L${CAR_X + 290} ${FLOOR + 3}`} stroke="#facc15" strokeWidth="3" strokeDasharray="22 10" opacity="0.75" />

      {/* Reflection of the car in the epoxy */}
      <FloorReflection href="#gar-car" floor={FLOOR} idPrefix="gar" opacity={0.3} />

      {/* ── Two-post lift ── */}
      <g>
        {[CAR_X + 10, CAR_X + 240].map((x) => (
          <g key={x}>
            <rect x={x} y={FLOOR - 214} width="18" height="214" rx="3" fill="url(#gar-blue)" />
            <rect x={x + 4} y={FLOOR - 200} width="3" height="190" fill="#93c5fd" opacity="0.5" />
            <rect x={x - 6} y={FLOOR - 6} width="30" height="6" rx="1" fill="#1e3a8a" />
          </g>
        ))}
        <rect x={CAR_X + 6} y={FLOOR - 220} width="256" height="9" rx="3" fill="#1e3a8a" />
        <rect x={CAR_X + 120} y={FLOOR - 230} width="30" height="12" rx="2" fill="#facc15" />
        <text x={CAR_X + 135} y={FLOOR - 221} textAnchor="middle" fontSize="7" fontWeight="800" fill="#111827">
          4T
        </text>
        <g ref={liftRef}>
          <rect x={CAR_X + 22} y={FLOOR - 12} width="224" height="6" rx="2" fill="#9ca3af" />
          <rect x={CAR_X + 22} y={FLOOR - 12} width="224" height="2" rx="1" fill="white" opacity="0.3" />
          <rect x={CAR_X + 40} y={FLOOR - 18} width="22" height="8" rx="2" fill="#f59e0b" />
          <rect x={CAR_X + 204} y={FLOOR - 18} width="22" height="8" rx="2" fill="#f59e0b" />
        </g>
      </g>

      {/* ── The car being built ── */}
      <g ref={carRef} id="gar-car">
        <g key={car.id} transform={`scale(${CAR_SCALE})`}>
          <CarSprite type={car.id} color={car.color} idPrefix={`gar-${car.id}`} />
        </g>
      </g>

      {/* Stage effects */}
      <g data-fx="weld" style={{ display: "none" }}>
        <g transform={`translate(${CAR_X + 120} ${FLOOR - 118})`} className="weld-spark">
          <circle r="6" fill="#e0f2fe" />
          <circle r="18" fill="#38bdf8" opacity="0.3" />
          {[0, 40, 100, 150, 210, 300].map((a) => (
            <line key={a} x1="0" y1="0" x2="0" y2="24" stroke="#fde68a" strokeWidth="2" transform={`rotate(${a})`} />
          ))}
        </g>
        <ellipse cx={CAR_X + 120} cy={FLOOR + 10} rx="80" ry="8" fill="#38bdf8" opacity="0.15" />
      </g>
      <g data-fx="paint" style={{ display: "none" }}>
        <Mist x={CAR_X + 140} y={FLOOR - 130} color={car.color} />
      </g>

      {/* Dust in the light */}
      <Dust x={300} y={70} w={360} h={260} />
      <Dust x={560} y={150} w={200} h={200} count={8} />

      {/* Mechanics */}
      <Worker x={CAR_X + 292} y={FLOOR + 8} suit="#1d4ed8" tool="wrench" flip className="worker-busy" />
      <g data-fx="helper">
        <Worker x={CAR_X - 30} y={FLOOR + 12} suit="#0f766e" helmet="#f97316" tool="torch" className="worker-busy" />
      </g>

      {/* Foreground, out of focus, for depth */}
      <g filter="url(#gar-blur)" opacity="0.9">
        <rect x="-20" y="410" width="130" height="50" rx="8" fill="#0b0c10" />
        <rect x="-10" y="404" width="110" height="8" rx="3" fill="#2a2e36" />
        <circle cx="955" cy="440" r="46" fill="#08090c" />
        <circle cx="955" cy="440" r="22" fill="#1f2228" />
      </g>
    </svg>
  );
}
