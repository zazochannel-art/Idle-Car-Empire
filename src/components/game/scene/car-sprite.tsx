import type { CarId } from "@/game/types";

/**
 * Side-profile cars drawn from a handful of shape parameters, so every model
 * shares the same level of detail. Local box: 200 × 72, nose pointing right,
 * tyres touching y = 72.
 */
interface Shape {
  /** Body bottom (sill). */
  yb: number;
  /** Rear deck height and where the rear glass starts. */
  yTail: number;
  xRw: number;
  /** Roof line. */
  xRoofA: number;
  xRoofB: number;
  yRoof: number;
  /** Base of the windscreen and hood height (at screen / at nose). */
  xWs: number;
  yHood: number;
  yNose: number;
  wheels: [number, number];
  r: number;
  spoiler?: boolean;
  wing?: boolean;
  intake?: boolean;
  lightBar?: boolean;
  glow?: boolean;
}

const SHAPES: Record<CarId, Shape> = {
  compact: { yb: 58, yTail: 30, xRw: 16, xRoofA: 38, xRoofB: 116, yRoof: 10, xWs: 148, yHood: 32, yNose: 37, wheels: [42, 158], r: 14 },
  sedan: { yb: 58, yTail: 30, xRw: 38, xRoofA: 66, xRoofB: 124, yRoof: 13, xWs: 152, yHood: 31, yNose: 36, wheels: [44, 158], r: 14 },
  suv: { yb: 52, yTail: 18, xRw: 12, xRoofA: 24, xRoofB: 130, yRoof: 2, xWs: 156, yHood: 22, yNose: 27, wheels: [42, 160], r: 17 },
  sports: { yb: 60, yTail: 34, xRw: 34, xRoofA: 70, xRoofB: 116, yRoof: 20, xWs: 146, yHood: 38, yNose: 44, wheels: [42, 160], r: 14, spoiler: true },
  supercar: { yb: 61, yTail: 36, xRw: 26, xRoofA: 78, xRoofB: 112, yRoof: 25, xWs: 150, yHood: 42, yNose: 49, wheels: [42, 162], r: 14, intake: true },
  hypercar: { yb: 62, yTail: 37, xRw: 22, xRoofA: 80, xRoofB: 110, yRoof: 27, xWs: 152, yHood: 44, yNose: 51, wheels: [40, 164], r: 14, intake: true, wing: true },
  electric: { yb: 59, yTail: 32, xRw: 20, xRoofA: 70, xRoofB: 122, yRoof: 15, xWs: 152, yHood: 34, yNose: 40, wheels: [44, 158], r: 15, lightBar: true },
  future: { yb: 60, yTail: 33, xRw: 8, xRoofA: 54, xRoofB: 112, yRoof: 18, xWs: 156, yHood: 38, yNose: 46, wheels: [44, 156], r: 14, lightBar: true, glow: true },
};

function bodyPath(s: Shape): string {
  const { yb, yTail, xRw, xRoofA, xRoofB, yRoof, xWs, yHood, yNose } = s;
  return [
    `M8 ${yb}`,
    `Q3 ${yb} 3 ${yb - 6}`,
    `L3 ${yTail + 7}`,
    `Q3 ${yTail} 12 ${yTail}`,
    `L${xRw} ${yTail - 1}`,
    `Q${xRoofA - 8} ${yRoof} ${xRoofA} ${yRoof}`,
    `L${xRoofB} ${yRoof}`,
    `Q${xRoofB + 12} ${yRoof + 1} ${xWs} ${yHood}`,
    `Q${(xWs + 190) / 2} ${yHood + 1} 190 ${yNose}`,
    `Q198 ${yNose + 2} 198 ${yNose + 10}`,
    `L198 ${yb - 5}`,
    `Q198 ${yb} 191 ${yb}`,
    "Z",
  ].join(" ");
}

function glassPath(s: Shape): string {
  const { yTail, xRw, xRoofA, xRoofB, yRoof, xWs, yHood } = s;
  const yBase = Math.max(yTail, yHood) - 1;
  return [
    `M${xRw + 7} ${yBase}`,
    `Q${xRoofA - 5} ${yRoof + 4} ${xRoofA + 2} ${yRoof + 4}`,
    `L${xRoofB - 1} ${yRoof + 4}`,
    `Q${xRoofB + 9} ${yRoof + 5} ${xWs - 7} ${yBase}`,
    "Z",
  ].join(" ");
}

export function CarSprite({ type, color, idPrefix }: { type: CarId; color: string; idPrefix: string }) {
  const s = SHAPES[type];
  const body = bodyPath(s);
  const glass = glassPath(s);
  const pillar = (s.xRoofA + s.xRoofB) / 2 + 4;
  const yBelt = Math.max(s.yTail, s.yHood);
  const g = (n: string) => `${idPrefix}-${n}`;

  return (
    <g>
      <defs>
        <linearGradient id={g("paint")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.55" />
          <stop offset="0.18" stopColor="white" stopOpacity="0.12" />
          <stop offset="0.55" stopColor="black" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={g("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9fc6ff" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="#1e2a44" />
          <stop offset="1" stopColor="#0b1020" />
        </linearGradient>
        <radialGradient id={g("rim")} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#f1f5f9" />
          <stop offset="0.6" stopColor="#94a3b8" />
          <stop offset="1" stopColor="#334155" />
        </radialGradient>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="100" cy="72" rx="96" ry="4" fill="black" opacity="0.55" />

      {/* Stage 1: bare chassis */}
      <g data-part="frame">
        <rect x="14" y={s.yb - 8} width="172" height="6" rx="2" fill="#3f4652" />
        <rect x="24" y={s.yb - 12} width="40" height="5" rx="1" fill="#565e6b" />
        <rect x="128" y={s.yb - 14} width="34" height="9" rx="2" fill="#6b7280" />
        {s.wheels.map((x) => (
          <g key={x}>
            <rect x={x - 3} y={s.yb - 12} width="6" height="14" fill="#1f2937" />
            <circle cx={x} cy={72 - s.r} r="5" fill="#9ca3af" />
          </g>
        ))}
      </g>

      {/* Stage 2: body shell (primer), stage 3 paint fades in on top */}
      <g data-part="body">
        <path d={body} fill="#8b929c" />
        <g data-part="paint">
          <path d={body} fill={color} />
        </g>
        <path d={body} fill={`url(#${g("paint")})`} />
        {/* Wheel arches */}
        {s.wheels.map((x) => (
          <circle key={x} cx={x} cy={72 - s.r} r={s.r + 3.5} fill="#07080c" />
        ))}
        {/* Door shut lines, handle, sill */}
        <path d={`M${pillar} ${yBelt + 1} L${pillar + 2} ${s.yb - 4}`} stroke="black" strokeOpacity="0.45" strokeWidth="1" />
        <path d={`M${s.xWs - 6} ${s.yHood + 2} L${s.xWs - 2} ${s.yb - 6}`} stroke="black" strokeOpacity="0.35" strokeWidth="1" />
        <rect x={pillar + 10} y={yBelt + 7} width="12" height="2.5" rx="1.2" fill="black" opacity="0.4" />
        <path d={`M${s.wheels[0] + s.r + 6} ${s.yb - 2} L${s.wheels[1] - s.r - 6} ${s.yb - 2}`} stroke="black" strokeOpacity="0.35" strokeWidth="2" />
        <path d={`M14 ${yBelt + 2} L186 ${yBelt + 4}`} stroke="white" strokeOpacity="0.18" strokeWidth="1" />
        {s.intake && <path d={`M${s.wheels[0] + 26} ${s.yb - 16} l26 -6 l-2 10 z`} fill="#0b0d12" opacity="0.85" />}
        {s.spoiler && <path d={`M6 ${s.yTail - 1} l16 -6 l4 0 l-6 6 z`} fill="#0b0d12" />}
        {s.wing && (
          <g fill="#0b0d12">
            <rect x="4" y={s.yTail - 14} width="30" height="3.5" rx="1.5" />
            <rect x="16" y={s.yTail - 11} width="3" height="10" />
          </g>
        )}
      </g>

      {/* Stage 4: glass, lights, wheels */}
      <g data-part="glass">
        <path d={glass} fill={`url(#${g("glass")})`} />
        <path d={`M${pillar - 1} ${s.yRoof + 4} L${pillar + 1} ${yBelt}`} stroke="#0b0d12" strokeWidth="3.5" />
        <path d={`M${s.xRoofA + 10} ${s.yRoof + 7} L${s.xRoofA + 24} ${yBelt - 3}`} stroke="white" strokeOpacity="0.25" strokeWidth="5" />
        <rect x="186" y={s.yNose + 2} width="11" height="5" rx="2.5" fill="#fff7d6" />
        <rect x="2" y={s.yTail + 3} width="7" height="6" rx="2" fill="#ef4444" />
        {s.lightBar && <rect x="170" y={s.yNose + 1} width="27" height="2" rx="1" fill="#e0f2fe" />}
      </g>
      <g data-part="wheels">
        {s.wheels.map((x) => (
          <g key={x} data-wheel>
            <circle cx={x} cy={72 - s.r} r={s.r} fill="#0d0f13" />
            <circle cx={x} cy={72 - s.r} r={s.r * 0.66} fill={`url(#${g("rim")})`} />
            <g className="wheel-spin" style={{ transformOrigin: `${x}px ${72 - s.r}px` }}>
              {[0, 72, 144, 216, 288].map((a) => (
                <rect key={a} x={x - 1.2} y={72 - s.r - s.r * 0.62} width="2.4" height={s.r * 0.55} fill="#475569" transform={`rotate(${a} ${x} ${72 - s.r})`} />
              ))}
            </g>
            <circle cx={x} cy={72 - s.r} r="2.6" fill="#1e293b" />
          </g>
        ))}
      </g>

      {/* Stage 5: finished — headlight beam + showroom shine */}
      <g data-part="shine">
        <path d={`M197 ${s.yNose + 4} L260 ${s.yNose - 8} L260 ${s.yNose + 22} Z`} fill="#fff7d6" opacity="0.18" />
        {s.glow && <ellipse cx="100" cy="70" rx="80" ry="3" fill="#c084fc" opacity="0.7" />}
      </g>
    </g>
  );
}

/** Opacity of each part for a build progress 0..1. */
export function partOpacities(p: number) {
  const ramp = (a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));
  return {
    frame: 1 - ramp(0.3, 0.36),
    body: ramp(0.16, 0.24),
    paint: ramp(0.44, 0.6),
    glass: ramp(0.64, 0.7),
    wheels: ramp(0.62, 0.68),
    shine: ramp(0.86, 0.9),
  };
}

export type CarPart = keyof ReturnType<typeof partOpacities>;
