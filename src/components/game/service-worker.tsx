"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/platform";

/**
 * Registers the offline cache in production web builds. The Android app carries
 * its files inside it (offline by nature), so there a cache would only risk
 * serving the last version's files after an app update: it never registers one,
 * and drops any it finds.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    if (isNativeApp()) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => void r.unregister()))
        .catch(() => {});
      return;
    }
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/` }).catch(() => {});
  }, []);
  return null;
}
