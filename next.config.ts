import type { NextConfig } from "next";

// GitHub Pages serves the site from /<repo>/, so the deploy workflow passes
// that prefix in. Locally and on root-domain hosts it stays empty.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // The game is fully client-side, so it ships as a static site (`out/`) that
  // any host can serve. Supabase, when configured, is called from the browser.
  output: "export",
  basePath,
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
