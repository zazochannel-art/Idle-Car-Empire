// Reusable SVG props for the factory scenes. Joints animate around (0,0) of
// their own group, so pivots stay correct wherever a prop is placed.

export function Worker({ x, y, suit = "#1d4ed8", helmet = "#facc15", tool = "wrench", flip = false, className = "" }: {
  x: number;
  y: number;
  suit?: string;
  helmet?: string;
  tool?: "wrench" | "torch" | "spray" | "tablet";
  flip?: boolean;
  className?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} className={className}>
      <ellipse cx="0" cy="0" rx="20" ry="4" fill="black" opacity="0.45" />
      {/* Legs + boots */}
      <rect x="-9" y="-40" width="8" height="38" rx="3" fill="#1e293b" />
      <rect x="1" y="-40" width="8" height="38" rx="3" fill="#243045" />
      <rect x="-11" y="-5" width="11" height="5" rx="2" fill="#0b0d12" />
      <rect x="1" y="-5" width="11" height="5" rx="2" fill="#0b0d12" />
      {/* Torso: overalls with hi-vis stripes */}
      <rect x="-12" y="-74" width="24" height="38" rx="7" fill={suit} />
      <rect x="-12" y="-58" width="24" height="3" fill="#fde047" opacity="0.9" />
      <rect x="-12" y="-46" width="24" height="3" fill="#fde047" opacity="0.9" />
      {/* Back arm */}
      <rect x="-14" y="-72" width="7" height="28" rx="3.5" fill={suit} opacity="0.8" />
      {/* Head */}
      <rect x="-3" y="-80" width="6" height="7" fill="#d6a37c" />
      <circle cx="0" cy="-87" r="9" fill="#e8b48f" />
      <circle cx="4" cy="-88" r="1.2" fill="#1f2937" />
      <path d="M-10 -89 Q0 -102 10 -89 Z" fill={helmet} />
      <rect x="-11" y="-90" width="24" height="3" rx="1.5" fill={helmet} />
      {/* Working arm */}
      <g transform="translate(6 -70)">
        <g className="worker-arm">
          <rect x="-3.5" y="0" width="7" height="26" rx="3.5" fill={suit} transform="rotate(-60)" />
          <g transform="rotate(-60) translate(0 26)">
            <circle r="3.5" fill="#e8b48f" />
            {tool === "wrench" && <rect x="-1.5" y="0" width="3" height="16" rx="1" fill="#cbd5e1" />}
            {tool === "torch" && (
              <g>
                <rect x="-2" y="0" width="4" height="14" fill="#475569" />
                <circle cy="16" r="3" fill="#7dd3fc" className="spark-flicker" />
              </g>
            )}
            {tool === "spray" && <rect x="-4" y="-2" width="8" height="12" rx="2" fill="#94a3b8" />}
            {tool === "tablet" && <rect x="-7" y="-2" width="14" height="10" rx="1.5" fill="#0ea5e9" />}
          </g>
        </g>
      </g>
    </g>
  );
}

/** Six-axis industrial robot (side view) with a welding torch. */
export function Robot({ x, y, scale = 1, delay = 0, color = "#f97316" }: { x: number; y: number; scale?: number; delay?: number; color?: string }) {
  const style = { animationDelay: `${delay}s` };
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="0" rx="36" ry="5" fill="black" opacity="0.5" />
      <rect x="-30" y="-14" width="60" height="14" rx="3" fill="#374151" />
      <rect x="-24" y="-18" width="48" height="5" rx="2" fill="#4b5563" />
      <path d="M-20 -18 L-16 -44 L16 -44 L20 -18 Z" fill={color} />
      <path d="M-20 -18 L-16 -44 L-6 -44 L-8 -18 Z" fill="white" opacity="0.12" />
      <g transform="translate(0 -46)">
        <g className="robot-shoulder" style={style}>
          <circle r="14" fill="#1f2937" />
          <circle r="8" fill={color} />
          <rect x="-9" y="-78" width="18" height="78" rx="9" fill={color} />
          <rect x="-9" y="-78" width="6" height="78" rx="3" fill="white" opacity="0.12" />
          <rect x="-3" y="-60" width="6" height="34" rx="3" fill="#7c2d12" opacity="0.35" />
          <g transform="translate(0 -76)">
            <g className="robot-elbow" style={style}>
              <circle r="11" fill="#1f2937" />
              <circle r="6" fill={color} />
              <rect x="0" y="-7" width="62" height="14" rx="7" fill={color} />
              <rect x="0" y="-7" width="62" height="5" rx="2.5" fill="white" opacity="0.14" />
              <g transform="translate(62 0)">
                <g className="robot-wrist" style={style}>
                  <circle r="7" fill="#1f2937" />
                  <rect x="-3" y="0" width="6" height="18" fill="#475569" />
                  <rect x="-5" y="16" width="10" height="5" rx="1.5" fill="#94a3b8" />
                  <g className="weld-spark" transform="translate(0 26)">
                    <circle r="5" fill="#e0f2fe" />
                    <circle r="11" fill="#38bdf8" opacity="0.35" />
                    {[0, 50, 110, 160, 220, 290].map((a) => (
                      <line key={a} x1="0" y1="0" x2="0" y2="16" stroke="#fde68a" strokeWidth="1.5" transform={`rotate(${a})`} />
                    ))}
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

/** Hanging industrial lamp with a soft light cone. */
export function Lamp({ x, y, cone = 300, idPrefix }: { x: number; y: number; cone?: number; idPrefix: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1="0" y1={-y} x2="0" y2="-10" stroke="#1f2937" strokeWidth="2" />
      <path d={`M-70 4 L70 4 L${cone / 2} ${cone} L${-cone / 2} ${cone} Z`} fill={`url(#${idPrefix}-cone)`} className="lamp-cone" />
      <path d="M-20 4 Q-18 -12 0 -12 Q18 -12 20 4 Z" fill="#334155" />
      <ellipse cx="0" cy="4" rx="16" ry="3.5" fill="#fef9c3" />
    </g>
  );
}

export function LampDefs({ idPrefix, color = "#fef3c7" }: { idPrefix: string; color?: string }) {
  return (
    <linearGradient id={`${idPrefix}-cone`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={color} stopOpacity="0.22" />
      <stop offset="1" stopColor={color} stopOpacity="0" />
    </linearGradient>
  );
}

/** Spray mist particles for the paint stage. */
export function Mist({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <circle
          key={i}
          cx={(i % 5) * 18 - 36}
          cy={Math.floor(i / 5) * 16}
          r={6 + (i % 3) * 3}
          fill={color}
          className="mist"
          style={{ animationDelay: `${(i * 0.17) % 1.2}s` }}
        />
      ))}
    </g>
  );
}
