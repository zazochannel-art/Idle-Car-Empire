"use client";

import { useRef } from "react";
import type { CarConfig } from "@/game/config/cars";
import { CarSprite } from "./car-sprite";
import { Lamp, LampDefs, Mist, Worker } from "./props";
import { applyStage, stageOf } from "./stages";
import { useBuildAnimation } from "./use-build-animation";

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const ramp = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));

const FLOOR = 392;
const CAR_SCALE = 1.3;
const CAR_X = 330;
const LIFT = 46;

/**
 * The Small Garage: brick walls, a two-post lift, a pegboard, tyres and a
 * roll-up door to the street. The car is built on the lift in front of you
 * and drives out of the door when it is finished.
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
      return {
        x: CAR_X + out * 760,
        y: FLOOR - 72 * CAR_SCALE - lift * LIFT,
        rolling: out > 0,
      };
    },
    (p, active) => {
      const lift = ramp(p, 0.12, 0.2) - ramp(p, 0.82, 0.88);
      liftRef.current?.setAttribute("transform", `translate(0 ${(-lift * LIFT).toFixed(1)})`);
      applyStage(svgRef.current, stageOf(p), active);
    },
  );

  return (
    <svg ref={svgRef} viewBox="0 0 1000 440" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="gar-brick" width="60" height="28" patternUnits="userSpaceOnUse">
          <rect width="60" height="28" fill="#3a2a25" />
          <rect x="1" y="1" width="57" height="12" rx="1" fill="#5a3b31" />
          <rect x="-29" y="15" width="57" height="12" rx="1" fill="#523529" />
          <rect x="31" y="15" width="57" height="12" rx="1" fill="#5e3e33" />
        </pattern>
        <pattern id="gar-peg" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#6b5844" />
          <circle cx="6" cy="6" r="1.4" fill="#3d3226" />
        </pattern>
        <linearGradient id="gar-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4b5563" />
          <stop offset="1" stopColor="#1f2430" />
        </linearGradient>
        <linearGradient id="gar-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0.15" />
          <stop offset="1" stopColor="#000" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="gar-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e1b4b" />
          <stop offset="0.6" stopColor="#7c2d12" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <LampDefs idPrefix="gar" color="#e0f2fe" />
        <filter id="gar-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Walls */}
      <rect width="1000" height="440" fill="url(#gar-brick)" />
      <rect width="1000" height="440" fill="url(#gar-shade)" />

      {/* Roll-up door to the street */}
      <g>
        <rect x="770" y="118" width="210" height={FLOOR - 118} fill="url(#gar-sky)" />
        <circle cx="900" cy="300" r="26" fill="#fbbf24" opacity="0.8" />
        <path d={`M770 ${FLOOR - 70} l20 -30 l0 -40 l30 0 l0 25 l26 -40 l0 85 l30 -20 l0 -50 l40 0 l0 60 l20 -10 l14 0 l0 ${70} l-210 0 z`} fill="#111827" />
        {[790, 840, 900, 950].map((x, i) => (
          <rect key={x} x={x} y={FLOOR - 60 - (i % 2) * 20} width="5" height="6" fill="#fde68a" opacity="0.8" />
        ))}
        <rect x="770" y={FLOOR - 12} width="210" height="12" fill="#374151" />
        <rect x="764" y="108" width="222" height="12" fill="#1f2937" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="770" y={120 + i * 9} width="210" height="8" fill="#9ca3af" opacity={0.85 - i * 0.05} />
        ))}
        <rect x="760" y="108" width="10" height={FLOOR - 108} fill="#2b2f36" />
        <rect x="980" y="108" width="10" height={FLOOR - 108} fill="#2b2f36" />
      </g>

      {/* Ceiling beam + fluorescent tubes */}
      <rect width="1000" height="34" fill="#15171c" />
      {[60, 250, 440, 630].map((x) => (
        <rect key={x} x={x} y="34" width="12" height="6" fill="#0b0d12" />
      ))}
      <Lamp x={262} y={64} idPrefix="gar" cone={260} />
      <Lamp x={470} y={64} idPrefix="gar" cone={380} />

      {/* Neon sign */}
      <g filter="url(#gar-glow)">
        <rect x="340" y="80" width="300" height="56" rx="10" fill="#0b0d12" stroke={accent} strokeWidth="2.5" />
        <text x="490" y="113" textAnchor="middle" fontSize="24" fontWeight="800" letterSpacing="5" fill={accent} className="neon-flicker">
          {name.toUpperCase()}
        </text>
        <text x="490" y="129" textAnchor="middle" fontSize="10" letterSpacing="6" fill="#fde68a">
          {city.toUpperCase()} · EST. 2026
        </text>
      </g>

      {/* Pegboard with tools */}
      <g>
        <rect x="26" y="96" width="196" height="120" rx="4" fill="url(#gar-peg)" stroke="#2b2118" strokeWidth="4" />
        <path d="M50 110 l8 0 l0 50 l-8 0 z M46 106 a8 8 0 1 1 16 0 a8 8 0 1 1 -16 0" fill="#cbd5e1" />
        <path d="M80 112 l26 0 l0 10 l-9 0 l0 46 l-8 0 l0 -46 l-9 0 z" fill="#64748b" />
        <path d="M122 110 l6 0 l0 34 l3 0 l0 28 l-12 0 l0 -28 l3 0 z" fill="#ef4444" />
        <path d="M146 110 l14 0 l-4 22 l0 40 l-6 0 l0 -40 z" fill="#f59e0b" />
        <path d="M176 112 q16 4 18 24 l-6 2 q-2 -14 -12 -18 z M178 140 l6 0 l0 34 l-6 0 z" fill="#94a3b8" />
        <rect x="38" y="186" width="170" height="18" rx="3" fill="#2b2118" />
        {[48, 72, 96, 120, 144, 168, 192].map((x, i) => (
          <rect key={x} x={x} y="176" width="10" height="12" rx="2" fill={["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#a855f7", "#f97316", "#14b8a6"][i]} />
        ))}
      </g>

      {/* Tool cabinet + workbench */}
      <g>
        <rect x="30" y={FLOOR - 132} width="110" height="132" rx="4" fill="#b91c1c" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x="36" y={FLOOR - 126 + i * 25} width="98" height="20" rx="2" fill="#dc2626" />
            <rect x="70" y={FLOOR - 118 + i * 25} width="30" height="4" rx="2" fill="#e5e7eb" />
          </g>
        ))}
        <rect x="150" y={FLOOR - 92} width="120" height="10" fill="#7c5a3a" />
        <rect x="158" y={FLOOR - 82} width="8" height="82" fill="#3f3f46" />
        <rect x="254" y={FLOOR - 82} width="8" height="82" fill="#3f3f46" />
        <rect x="178" y={FLOOR - 110} width="26" height="18" rx="3" fill="#475569" />
        <rect x="216" y={FLOOR - 106} width="40" height="14" rx="2" fill="#0ea5e9" opacity="0.8" />
      </g>

      {/* Floor */}
      <rect y={FLOOR} width="1000" height={440 - FLOOR} fill="url(#gar-floor)" />
      <ellipse cx="460" cy={FLOOR + 24} rx="90" ry="8" fill="#0b0d12" opacity="0.5" />
      <rect x="300" y={FLOOR + 2} width="340" height="3" fill="#facc15" opacity="0.7" />

      {/* Tyre stack + oil drum */}
      <g>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x="682" y={FLOOR - 26 - i * 22} width="64" height="22" rx="10" fill="#111318" />
            <rect x="696" y={FLOOR - 21 - i * 22} width="36" height="12" rx="6" fill="#2b2f36" />
          </g>
        ))}
      </g>

      {/* Two-post lift (arms rise with the car) */}
      <g>
        <rect x={CAR_X + 10} y={FLOOR - 210} width="16" height="210" rx="3" fill="#2563eb" />
        <rect x={CAR_X + 240} y={FLOOR - 210} width="16" height="210" rx="3" fill="#2563eb" />
        <rect x={CAR_X + 6} y={FLOOR - 216} width="254" height="8" rx="3" fill="#1e40af" />
        <g ref={liftRef}>
          <rect x={CAR_X + 20} y={FLOOR - 12} width="226" height="6" rx="2" fill="#94a3b8" />
          <rect x={CAR_X + 40} y={FLOOR - 18} width="20" height="8" rx="2" fill="#f59e0b" />
          <rect x={CAR_X + 206} y={FLOOR - 18} width="20" height="8" rx="2" fill="#f59e0b" />
        </g>
      </g>

      {/* The car being built */}
      <g ref={carRef}>
        <g key={car.id} transform={`scale(${CAR_SCALE})`}>
          <CarSprite type={car.id} color={car.color} idPrefix={`gar-${car.id}`} />
        </g>
      </g>

      {/* Stage effects */}
      <g data-fx="weld" style={{ display: "none" }}>
        <g transform={`translate(${CAR_X + 120} ${FLOOR - 120})`} className="weld-spark">
          <circle r="6" fill="#e0f2fe" />
          <circle r="16" fill="#38bdf8" opacity="0.35" />
          {[0, 40, 100, 150, 210, 300].map((a) => (
            <line key={a} x1="0" y1="0" x2="0" y2="22" stroke="#fde68a" strokeWidth="2" transform={`rotate(${a})`} />
          ))}
        </g>
      </g>
      <g data-fx="paint" style={{ display: "none" }}>
        <Mist x={CAR_X + 140} y={FLOOR - 130} color={car.color} />
      </g>

      {/* Mechanics */}
      <Worker x={CAR_X + 290} y={FLOOR + 6} suit="#1d4ed8" tool="wrench" flip className="worker-busy" />
      <g data-fx="helper">
        <Worker x={CAR_X - 30} y={FLOOR + 10} suit="#0f766e" helmet="#f97316" tool="torch" className="worker-busy" />
      </g>

      {/* Floor sheen */}
      <rect y={FLOOR} width="1000" height="6" fill="white" opacity="0.05" />
    </svg>
  );
}
