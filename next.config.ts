import fs from "node:fs";
import type { NextConfig } from "next";

/** The app's version as players' error reports name it: "1.0.0 (1)", and the commit when CI builds it. */
function appVersion(): string {
  try {
    const props = Object.fromEntries(
      fs
        .readFileSync("android/version.properties", "utf8")
        .split("\n")
        .filter((l) => /^\w+=/.test(l))
        .map((l) => l.trim().split("=")),
    );
    const commit = (process.env.GITHUB_SHA ?? "").slice(0, 7);
    return `${props.versionName} (${props.versionCode})${commit ? ` ${commit}` : ""}`;
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  // The game runs inside the Android and iOS apps: it is built to static files
  // (`out/`) that the apps carry inside them (capacitor.config.ts), so it starts
  // and plays with no connection. Supabase, when configured, is called from the app.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
  // CI keeps each build's source maps as an artifact (scripts/build-app.mjs takes them out of the
  // app), so an error report's place in the code can be read back (scripts/error-place.mjs)
  productionBrowserSourceMaps: process.env.SOURCE_MAPS === "1",
};

export default nextConfig;
