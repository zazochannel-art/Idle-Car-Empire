"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import { diagEnabled, subscribeDiag } from "@/lib/diagnostics";

// The panel (components/game/diag-overlay.tsx) is its own piece of code: it loads only when the
// diagnostic mode is turned on (Settings → Credits, seven taps), never in the first download.
const DiagOverlay = lazy(() => import("./diag-overlay"));

export function DiagGate() {
  const on = useSyncExternalStore(subscribeDiag, diagEnabled, () => false);
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <DiagOverlay />
    </Suspense>
  );
}
