"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { FactoryId } from "@/game/types";
import { useGame } from "@/store/game-store";
import { partOpacities, type CarPart } from "./car-sprite";

/** Batches shorter than this are shown at this pace so the build stays readable. */
const MIN_VISUAL_CYCLE = 3.2;

export interface Placement {
  x: number;
  y: number;
  /** Wheels spin while the car rolls. */
  rolling: boolean;
}

/**
 * Drives the car being built: follows the factory's real batch progress
 * (smoothed between game ticks) and writes positions/opacities straight to
 * the SVG, so the scene animates at 60fps without re-rendering React.
 */
export function useBuildAnimation(
  factory: FactoryId,
  carRef: RefObject<SVGGElement | null>,
  place: (p: number) => Placement,
  onFrame?: (p: number, active: boolean) => void,
) {
  const placeRef = useRef(place);
  const frameRef = useRef(onFrame);
  useEffect(() => {
    placeRef.current = place;
    frameRef.current = onFrame;
  });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let p = 0;
    let parts: Partial<Record<CarPart, SVGGElement[]>> = {};
    let partsFor: Element | null = null;
    let wheels: Element[] = [];

    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { state, snap } = useGame.getState();
      const f = state.factories[factory];
      const st = snap.factories[factory];
      const active = !!st && (st.automated || f.running);

      if (st && active) {
        if (st.cycleTime >= MIN_VISUAL_CYCLE) {
          p += dt / st.cycleTime;
          const target = f.progress;
          const diff = target - (p % 1);
          if (Math.abs(diff) > 0.12 && Math.abs(diff) < 0.88) p = target;
        } else {
          p += dt / MIN_VISUAL_CYCLE;
        }
        if (p >= 1) p -= Math.floor(p);
        if (!st.automated) p = Math.max(p, f.progress);
      } else {
        p = st ? f.progress : 0;
      }

      const car = carRef.current;
      if (car) {
        if (partsFor !== car.firstElementChild) {
          partsFor = car.firstElementChild;
          parts = {};
          car.querySelectorAll<SVGGElement>("[data-part]").forEach((el) => {
            const k = el.dataset.part as CarPart;
            (parts[k] ??= []).push(el);
          });
          wheels = Array.from(car.querySelectorAll(".wheel-spin"));
        }
        const op = partOpacities(p);
        for (const k of Object.keys(op) as CarPart[]) parts[k]?.forEach((el) => (el.style.opacity = String(op[k])));
        const at = placeRef.current(p);
        car.setAttribute("transform", `translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);
        const spin = active && at.rolling;
        wheels.forEach((w) => w.classList.toggle("is-rolling", spin));
      }
      frameRef.current?.(p, active);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [factory, carRef]);
}
