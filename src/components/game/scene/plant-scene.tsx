"use client";

import { useRef } from "react";
import type { CarConfig } from "@/game/config/cars";
import type { FactoryId } from "@/game/types";
import { CarSprite } from "./car-sprite";
import { Lamp, LampDefs, Mist, Robot, Worker } from "./props";
import { applyStage, stageOf } from "./stages";
import { useBuildAnimation } from "./use-build-animation";

const FLOOR = 396;
const LINE_Y = 372;
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
 * A production hall: chassis → welding robots → paint booth → assembly →
 * QC light tunnel → car carrier. Bigger plants get more robots and a
 * brighter, cleaner hall.
 */
export function PlantScene({ factory, tier, car, accent, name, city }: { factory: FactoryId; tier: number; car: CarConfig; accent: string; name: string; city: string }) {
  const carRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const robots = tier >= 6 ? 3 : 2;
  const premium = tier >= 6;

  useBuildAnimation(
    factory,
    carRef,
    (p) => {
      const a = along(p);
      return { x: a.x - CAR_W / 2, y: LINE_Y - 72 * CAR_SCALE, rolling: a.moving };
    },
    (p, active) => applyStage(svgRef.current, stageOf(p), active),
  );

  const wall = premium ? "#1b2230" : "#171b22";
  return (
    <svg ref={svgRef} viewBox="0 0 1000 440" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="pl-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b0e14" />
          <stop offset="1" stopColor={wall} />
        </linearGradient>
        <linearGradient id="pl-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={premium ? "#3b4252" : "#2d333d"} />
          <stop offset="1" stopColor="#12151b" />
        </linearGradient>
        <linearGradient id="pl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f172a" />
          <stop offset="1" stopColor="#1e3a5f" />
        </linearGradient>
        <linearGradient id="pl-booth" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2e8f0" stopOpacity="0.16" />
          <stop offset="1" stopColor="#e2e8f0" stopOpacity="0.05" />
        </linearGradient>
        <pattern id="pl-panel" width="50" height="200" patternUnits="userSpaceOnUse">
          <rect width="50" height="200" fill="url(#pl-wall)" />
          <rect x="48" width="2" height="200" fill="#000" opacity="0.35" />
        </pattern>
        <pattern id="pl-hazard" width="24" height="10" patternUnits="userSpaceOnUse" patternTransform="skewX(-40)">
          <rect width="24" height="10" fill="#111" />
          <rect width="12" height="10" fill="#facc15" />
        </pattern>
        <LampDefs idPrefix="pl" />
        <filter id="pl-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hall */}
      <rect width="1000" height="440" fill="url(#pl-panel)" />
      {/* Clerestory windows with the city outside */}
      <g>
        <rect x="20" y="62" width="960" height="70" fill="url(#pl-sky)" />
        <path d="M20 132 l0 -26 l40 0 l0 -18 l30 0 l0 30 l50 0 l0 -40 l26 0 l0 40 l60 0 l0 -22 l44 0 l0 26 l70 0 l0 -34 l20 -10 l20 10 l0 34 l90 0 l0 -20 l40 0 l0 20 l60 0 l0 -44 l30 0 l0 44 l80 0 l0 -24 l50 0 l0 24 l80 0 l0 -30 l40 0 l0 30 l100 0 l0 26 z" fill="#0a0f1a" />
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={20 + i * 80} y="62" width="4" height="70" fill="#1f2937" />
        ))}
      </g>
      {/* Roof trusses */}
      <rect width="1000" height="56" fill="#0d1016" />
      <path d={Array.from({ length: 21 }, (_, i) => `M${i * 50} 56 L${i * 50 + 25} 14 L${i * 50 + 50} 56`).join(" ")} stroke="#2a313d" strokeWidth="4" fill="none" />
      <rect y="12" width="1000" height="5" fill="#2a313d" />
      <rect y="54" width="1000" height="6" fill="#262c37" />
      {/* Overhead pipes */}
      <rect y="140" width="1000" height="7" fill="#334155" />
      <rect y="150" width="1000" height="4" fill={accent} opacity="0.5" />

      {[110, 320, 530, 725, 880].map((x) => (
        <Lamp key={x} x={x} y={160} cone={220} idPrefix="pl" />
      ))}

      {/* Neon plant name */}
      <g filter="url(#pl-glow)">
        <text x="500" y="196" textAnchor="middle" fontSize="20" fontWeight="800" letterSpacing="6" fill={accent} className="neon-flicker">
          {name.toUpperCase()}
        </text>
        <text x="500" y="212" textAnchor="middle" fontSize="9" letterSpacing="5" fill="#94a3b8">
          {city.toUpperCase()} ASSEMBLY PLANT
        </text>
      </g>

      {/* Station signs */}
      {[
        [110, "CHASSIS"],
        [320, "BODY WELD"],
        [530, "PAINT"],
        [725, "ASSEMBLY"],
        [880, "QC"],
      ].map(([x, label]) => (
        <g key={label as string} transform={`translate(${x} 232)`}>
          <rect x="-46" y="-12" width="92" height="22" rx="4" fill="#0b0d12" stroke="#334155" />
          <text y="4" textAnchor="middle" fontSize="10" fontWeight="700" letterSpacing="2" fill="#cbd5e1">
            {label}
          </text>
        </g>
      ))}

      {/* Floor */}
      <rect y={FLOOR - 4} width="1000" height={444 - FLOOR} fill="url(#pl-floor)" />
      <rect y={FLOOR + 10} width="1000" height="8" fill="url(#pl-hazard)" opacity="0.8" />

      {/* Forklift in the back */}
      <g className="forklift">
        <g transform={`translate(40 ${FLOOR - 50})`}>
          <rect x="0" y="10" width="44" height="26" rx="4" fill="#f59e0b" />
          <rect x="8" y="-14" width="26" height="26" rx="3" fill="none" stroke="#1f2937" strokeWidth="3" />
          <rect x="44" y="-18" width="4" height="54" fill="#374151" />
          <rect x="48" y="26" width="26" height="4" fill="#374151" />
          <rect x="50" y="6" width="22" height="20" fill="#a16207" />
          <circle cx="10" cy="38" r="8" fill="#0d0f13" />
          <circle cx="36" cy="38" r="8" fill="#0d0f13" />
        </g>
      </g>

      {/* Paint booth (behind the car) */}
      <g>
        <rect x="440" y="250" width="180" height={LINE_Y - 250 + 6} rx="4" fill="url(#pl-booth)" stroke="#94a3b8" strokeOpacity="0.35" />
        <rect x="440" y="244" width="180" height="10" rx="3" fill="#475569" />
        {[470, 510, 550, 590].map((x) => (
          <rect key={x} x={x - 3} y="254" width="6" height="10" fill="#64748b" />
        ))}
      </g>

      {/* Welding robots */}
      <g data-fx="robots" className="robot-cell">
      {Array.from({ length: robots }).map((_, i) => (
        <Robot key={i} x={250 + i * (robots === 3 ? 70 : 120)} y={LINE_Y - 4} scale={0.95} delay={i * 0.45} color={premium ? "#e5e7eb" : "#f97316"} />
      ))}
      </g>

      {/* Overhead hoist with a wheel at assembly */}
      <g>
        <rect x="640" y="160" width="170" height="8" fill="#475569" />
        <g className="hoist">
          <rect x="700" y="168" width="20" height="14" fill="#facc15" />
          <line x1="710" y1="182" x2="710" y2="250" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="710" cy="262" r="14" fill="#0d0f13" />
          <circle cx="710" cy="262" r="6" fill="#9ca3af" />
        </g>
      </g>

      {/* QC light tunnel */}
      <g>
        <path d={`M820 ${LINE_Y} L820 292 Q880 256 940 292 L940 ${LINE_Y}`} fill="none" stroke="#1f2937" strokeWidth="16" />
        <path d={`M820 ${LINE_Y} L820 292 Q880 256 940 292 L940 ${LINE_Y}`} fill="none" stroke="#e0f2fe" strokeWidth="4" strokeDasharray="16 8" opacity="0.35" />
      </g>

      {/* Conveyor */}
      <g data-fx="line">
        <rect x="0" y={LINE_Y} width="1000" height="10" fill="#1f2937" />
        <rect x="0" y={LINE_Y + 10} width="1000" height="4" fill="#0b0d12" />
        <line x1="0" y1={LINE_Y + 5} x2="1000" y2={LINE_Y + 5} stroke="#64748b" strokeWidth="6" strokeDasharray="6 14" className="conveyor-rollers" />
        {Array.from({ length: 20 }).map((_, i) => (
          <rect key={i} x={i * 50 + 20} y={LINE_Y + 14} width="6" height={FLOOR - LINE_Y - 14} fill="#2a313d" />
        ))}
      </g>

      {/* The car moving down the line */}
      <g ref={carRef}>
        <g key={car.id} transform={`scale(${CAR_SCALE})`}>
          <CarSprite type={car.id} color={car.color} idPrefix={`pl-${car.id}`} />
        </g>
      </g>

      {/* Station effects in front of the car */}
      <g data-fx="paint" style={{ display: "none" }}>
        <Mist x={530} y={LINE_Y - 70} color={car.color} />
      </g>
      <g data-fx="qc" style={{ display: "none" }}>
        <path d={`M820 ${LINE_Y} L820 292 Q880 256 940 292 L940 ${LINE_Y}`} fill="none" stroke="#e0f2fe" strokeWidth="4" strokeDasharray="16 8" className="qc-scan" filter="url(#pl-glow)" />
      </g>

      {/* Workers */}
      <Worker x={150} y={FLOOR + 4} suit="#1e40af" tool="wrench" className="worker-busy" />
      <Worker x={628} y={FLOOR + 6} suit="#0f766e" helmet="#f97316" tool="wrench" className="worker-busy" />
      <g data-fx="assembly" style={{ display: "none" }}>
        {[676, 746].map((x) => (
          <g key={x} transform={`translate(${x} ${LINE_Y - 12})`} className="weld-spark">
            <circle r="3" fill="#fde68a" />
            <circle r="8" fill="#f59e0b" opacity="0.35" />
          </g>
        ))}
      </g>
      <Worker x={950} y={FLOOR + 6} suit="#334155" helmet="#e5e7eb" tool="tablet" flip />

    </svg>
  );
}
