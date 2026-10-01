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

/** Darkens (amt < 0) or lightens (amt > 0) a #rrggbb colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function Wheel({ x, cy, r, rim }: { x: number; cy: number; r: number; rim: string }) {
  const spokes = [0, 72, 144, 216, 288];
  return (
    <g>
      {/* Tyre with a lighter sidewall ring */}
      <circle cx={x} cy={cy} r={r} fill="#0a0b0e" />
      <circle cx={x} cy={cy} r={r - 2.2} fill="none" stroke="#25282f" strokeWidth="1.6" />
      {/* Brake disc + caliper sit behind the spokes */}
      <circle cx={x} cy={cy} r={r * 0.6} fill="#3a3f48" />
      <circle cx={x} cy={cy} r={r * 0.6} fill="none" stroke="#6b7280" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
      <rect x={x + r * 0.18} y={cy - r * 0.52} width={r * 0.26} height={r * 0.42} rx="1.5" fill="#dc2626" />
      <circle cx={x} cy={cy} r={r * 0.68} fill="none" stroke={`url(#${rim})`} strokeWidth={r * 0.1} />
      <g className="wheel-spin" style={{ transformOrigin: `${x}px ${cy}px` }}>
        {spokes.map((a) => (
          <g key={a} transform={`rotate(${a} ${x} ${cy})`}>
            <path
              d={`M${x - 1.8} ${cy - 2} L${x - 1} ${cy - r * 0.66} L${x + 1} ${cy - r * 0.66} L${x + 1.8} ${cy - 2} Z`}
              fill={`url(#${rim})`}
            />
          </g>
        ))}
      </g>
      <circle cx={x} cy={cy} r={r * 0.17} fill="#cbd5e1" />
      <circle cx={x} cy={cy} r={r * 0.08} fill="#111827" />
    </g>
  );
}

export function CarSprite({ type, color, idPrefix }: { type: CarId; color: string; idPrefix: string }) {
  const s = SHAPES[type];
  const body = bodyPath(s);
  const glass = glassPath(s);
  const pillar = (s.xRoofA + s.xRoofB) / 2 + 4;
  const yBelt = Math.max(s.yTail, s.yHood);
  const g = (n: string) => `${idPrefix}-${n}`;
  const dark = shade(color, -0.45);
  const light = shade(color, 0.35);

  return (
    <g>
      <defs>
        {/* Car paint: bright shoulder line, mid tone, dark rocker */}
        <linearGradient id={g("paint")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={light} />
          <stop offset="0.32" stopColor={color} />
          <stop offset="0.5" stopColor={shade(color, 0.12)} />
          <stop offset="0.56" stopColor={shade(color, -0.12)} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <linearGradient id={g("primer")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b6bcc6" />
          <stop offset="0.5" stopColor="#8b929c" />
          <stop offset="1" stopColor="#5b616b" />
        </linearGradient>
        <linearGradient id={g("glass")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bcd7ff" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#2a3a5c" />
          <stop offset="1" stopColor="#070b16" />
        </linearGradient>
        <linearGradient id={g("rim")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.5" stopColor="#9aa6b6" />
          <stop offset="1" stopColor="#3c4656" />
        </linearGradient>
        <linearGradient id={g("sheen")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.55" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <clipPath id={g("clip")}>
          <path d={body} />
        </clipPath>
      </defs>

      {/* Contact shadow */}
      <ellipse cx="100" cy="72" rx="98" ry="5" fill="black" opacity="0.6" />
      <ellipse cx="100" cy="71" rx="70" ry="2.5" fill="black" opacity="0.6" />

      {/* Stage 1: bare chassis on its wheels hubs */}
      <g data-part="frame">
        <rect x="14" y={s.yb - 8} width="172" height="6" rx="2" fill="#3f4652" />
        <rect x="14" y={s.yb - 8} width="172" height="2" rx="1" fill="#6b7280" />
        <rect x="24" y={s.yb - 13} width="42" height="6" rx="1.5" fill="#565e6b" />
        <rect x="126" y={s.yb - 18} width="38" height="12" rx="3" fill="#6b7280" />
        <rect x="132" y={s.yb - 22} width="10" height="5" rx="1" fill="#9ca3af" />
        <rect x="70" y={s.yb - 10} width="54" height="3" rx="1.5" fill="#9ca3af" />
        {s.wheels.map((x) => (
          <g key={x}>
            <rect x={x - 3} y={s.yb - 14} width="6" height="16" fill="#1f2937" />
            <path d={`M${x - 10} ${s.yb - 14} q10 -10 20 0`} stroke="#eab308" strokeWidth="2.5" fill="none" />
            <circle cx={x} cy={72 - s.r} r="6" fill="#9ca3af" />
            <circle cx={x} cy={72 - s.r} r="2.5" fill="#374151" />
          </g>
        ))}
      </g>

      {/* Stage 2: body shell in primer; stage 3: paint fades in on top */}
      <g data-part="body">
        <path d={body} fill={`url(#${g("primer")})`} />
        <g data-part="paint">
          <path d={body} fill={`url(#${g("paint")})`} />
        </g>
        {/* Shoulder crease catches the light */}
        <path d={`M10 ${yBelt + 3} Q100 ${yBelt + 1} 192 ${s.yNose + 5}`} stroke="white" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
        <path d={`M12 ${yBelt + 5} Q100 ${yBelt + 3} 190 ${s.yNose + 7}`} stroke="black" strokeOpacity="0.18" strokeWidth="1" fill="none" />
        {/* Moving showroom reflection, clipped to the body */}
        <g clipPath={`url(#${g("clip")})`}>
          <rect x="-60" y="-10" width="40" height="90" fill={`url(#${g("sheen")})`} className="car-sheen" transform="skewX(-20)" />
        </g>
        {/* Wheel arches with a lip */}
        {s.wheels.map((x) => (
          <g key={x}>
            <circle cx={x} cy={72 - s.r} r={s.r + 4} fill="#050608" />
            <path d={`M${x - s.r - 4} ${72 - s.r} A ${s.r + 4} ${s.r + 4} 0 0 1 ${x + s.r + 4} ${72 - s.r}`} stroke="white" strokeOpacity="0.18" strokeWidth="1" fill="none" />
          </g>
        ))}
        {/* Door shut lines, handle, side skirt */}
        <path d={`M${pillar} ${yBelt + 1} L${pillar + 2} ${s.yb - 4}`} stroke="black" strokeOpacity="0.5" strokeWidth="1" />
        <path d={`M${s.xWs - 6} ${s.yHood + 2} L${s.xWs - 2} ${s.yb - 6}`} stroke="black" strokeOpacity="0.4" strokeWidth="1" />
        <rect x={pillar + 10} y={yBelt + 7} width="13" height="2.6" rx="1.3" fill={shade(color, 0.5)} opacity="0.9" />
        <rect x={pillar + 10} y={yBelt + 9} width="13" height="1" rx="0.5" fill="black" opacity="0.4" />
        <path d={`M${s.wheels[0] + s.r + 5} ${s.yb - 1} L${s.wheels[1] - s.r - 5} ${s.yb - 1}`} stroke="#0b0d12" strokeWidth="3" strokeLinecap="round" />
        {/* Front air dam + grille, rear diffuser */}
        <path d={`M184 ${s.yb - 1} L198 ${s.yb - 1} L198 ${s.yb - 7} L188 ${s.yb - 7} Z`} fill="#0b0d12" />
        {!s.lightBar && <rect x="191" y={s.yNose + 9} width="7" height="6" rx="1.5" fill="#111318" />}
        <path d={`M3 ${s.yb - 1} L16 ${s.yb - 1} L14 ${s.yb - 6} L3 ${s.yb - 6} Z`} fill="#0b0d12" />
        {s.intake && <path d={`M${s.wheels[0] + 26} ${s.yb - 16} l26 -6 l-2 10 z`} fill="#0b0d12" opacity="0.9" />}
        {s.spoiler && <path d={`M6 ${s.yTail - 1} l16 -6 l4 0 l-6 6 z`} fill="#0b0d12" />}
        {s.wing && (
          <g fill="#0b0d12">
            <rect x="2" y={s.yTail - 14} width="32" height="3.5" rx="1.5" />
            <rect x="16" y={s.yTail - 11} width="3" height="10" />
          </g>
        )}
      </g>

      {/* Stage 4: glass, chrome, mirrors, lights */}
      <g data-part="glass">
        <path d={glass} fill={`url(#${g("glass")})`} stroke="#cbd5e1" strokeOpacity="0.55" strokeWidth="1.1" />
        <path d={`M${pillar - 1} ${s.yRoof + 4} L${pillar + 1} ${yBelt}`} stroke="#0b0d12" strokeWidth="3.5" />
        <path d={`M${s.xRoofA + 10} ${s.yRoof + 7} L${s.xRoofA + 24} ${yBelt - 3}`} stroke="white" strokeOpacity="0.28" strokeWidth="5" />
        <path d={`M${s.xRoofA + 30} ${s.yRoof + 7} L${s.xRoofA + 36} ${yBelt - 3}`} stroke="white" strokeOpacity="0.14" strokeWidth="2" />
        {/* Side mirror */}
        <path d={`M${s.xWs - 12} ${yBelt - 1} q2 -7 10 -6 l1 5 q-5 2 -11 1 z`} fill={shade(color, -0.2)} />
        {/* Headlight + DRL, tail light */}
        <path d={`M184 ${s.yNose + 1} L197 ${s.yNose + 2} Q198 ${s.yNose + 7} 194 ${s.yNose + 7} L186 ${s.yNose + 6} Z`} fill="#fffbeb" />
        <rect x="185" y={s.yNose + 1.5} width="10" height="1.4" rx="0.7" fill="#bae6fd" />
        <path d={`M2 ${s.yTail + 2} L10 ${s.yTail + 1} L10 ${s.yTail + 8} L3 ${s.yTail + 9} Z`} fill="#ef4444" />
        <rect x="3" y={s.yTail + 3} width="6" height="1.4" fill="#fecaca" />
        {s.lightBar && <rect x="168" y={s.yNose + 0.5} width="29" height="2" rx="1" fill="#e0f2fe" />}
      </g>
      <g data-part="wheels">
        {s.wheels.map((x) => (
          <Wheel key={x} x={x} cy={72 - s.r} r={s.r} rim={g("rim")} />
        ))}
      </g>

      {/* Stage 5: finished — headlights on, underglow on the future car */}
      <g data-part="shine">
        <path d={`M197 ${s.yNose + 4} L280 ${s.yNose - 10} L280 ${s.yNose + 26} Z`} fill="#fff7d6" opacity="0.16" />
        <circle cx="193" cy={s.yNose + 4} r="5" fill="#fffbeb" opacity="0.5" />
        <circle cx="5" cy={s.yTail + 5} r="4" fill="#ef4444" opacity="0.45" />
        {s.glow && <ellipse cx="100" cy="70" rx="84" ry="3.5" fill="#c084fc" opacity="0.8" />}
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
