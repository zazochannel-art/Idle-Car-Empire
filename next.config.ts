import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The game runs inside the Android and iOS apps: it is built to static files
  // (`out/`) that the apps carry inside them (capacitor.config.ts), so it starts
  // and plays with no connection. Supabase, when configured, is called from the app.
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
