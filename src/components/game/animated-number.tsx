"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  format: (n: number) => string;
  className?: string;
}

/**
 * Counts smoothly toward `value` when it jumps, and shows small steps (steady
 * income) as they come. Writes straight to the DOM node so a ticking cash
 * counter doesn't re-render React 60 times a second, and only while the number
 * moves: once it reaches the value the loop stops (no frame requested, so an
 * idle screen stays idle), and the text is only touched when the shown digits
 * change.
 */
export function AnimatedNumber({ value, format, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const target = useRef(value);
  const formatRef = useRef(format);
  const text = useRef("");
  const raf = useRef(0);
  const start = useRef<() => void>(() => {});
  // Rendered once; afterwards the animation loop owns the text node.
  const [initialText] = useState(() => format(value));

  useEffect(() => {
    const write = () => {
      const t = formatRef.current(shown.current);
      if (t !== text.current && ref.current) {
        text.current = t;
        ref.current.textContent = t;
      }
    };
    let last = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const goal = target.current;
      const cur = shown.current;
      // Spending snaps down quickly; income glides up.
      const rate = goal < cur ? 30 : 9;
      const next = cur + (goal - cur) * Math.min(1, dt * rate);
      shown.current = Math.abs(goal - next) <= Math.max(0.5, Math.abs(goal) * 1e-6) ? goal : next;
      write();
      raf.current = shown.current === target.current ? 0 : requestAnimationFrame(step);
    };
    start.current = () => {
      if (raf.current || shown.current === target.current) return write();
      // steady income (a sliver of the total each tick) just shows the new figure: gliding toward it
      // would keep the screen redrawing every frame for good; jumps (a purchase, a reward) glide
      if (Math.abs(target.current - shown.current) <= Math.abs(target.current) * 0.02) {
        shown.current = target.current;
        return write();
      }
      last = performance.now();
      raf.current = requestAnimationFrame(step);
    };
    text.current = ref.current?.textContent ?? "";
    start.current();
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  useEffect(() => {
    formatRef.current = format;
    target.current = value;
    start.current();
  }, [value, format]);

  return (
    <span ref={ref} className={className} suppressHydrationWarning>
      {initialText}
    </span>
  );
}
