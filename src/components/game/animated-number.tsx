"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  format: (n: number) => string;
  className?: string;
}

/**
 * Counts smoothly toward `value`. Writes straight to the DOM node every frame
 * so a ticking cash counter doesn't re-render React 60 times a second.
 */
export function AnimatedNumber({ value, format, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const target = useRef(value);
  const formatRef = useRef(format);
  // Rendered once; afterwards the animation loop owns the text node.
  const [initialText] = useState(() => format(value));

  useEffect(() => {
    formatRef.current = format;
  }, [format]);

  useEffect(() => {
    target.current = value;
  }, [value]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const goal = target.current;
      const cur = shown.current;
      if (cur !== goal) {
        // Spending snaps down quickly; income glides up.
        const rate = goal < cur ? 30 : 9;
        const next = cur + (goal - cur) * Math.min(1, dt * rate);
        shown.current = Math.abs(goal - next) <= Math.max(0.5, Math.abs(goal) * 1e-6) ? goal : next;
        if (ref.current) ref.current.textContent = formatRef.current(shown.current);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {initialText}
    </span>
  );
}
