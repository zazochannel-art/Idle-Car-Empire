"use client";

import { useEffect } from "react";
import { isNativeApp } from "@/lib/platform";

/** Inside the Android app: hooks up the Back button and the app's background/foreground (lib/native.ts). The web game never loads that code. */
export function NativeApp() {
  useEffect(() => {
    if (!isNativeApp()) return;
    void import("@/lib/native").then((m) => m.startNative()).catch(() => {});
  }, []);
  return null;
}
