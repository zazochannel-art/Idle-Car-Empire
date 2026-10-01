import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The game is fully client-side, so it ships as a static site (`out/`) that
  // any host can serve. Supabase, when configured, is called from the browser.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
