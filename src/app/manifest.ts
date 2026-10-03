import type { MetadataRoute } from "next";

// Lets phones install the game on the home screen and open it full screen.
const base = process.env.PAGES_BASE_PATH ?? "";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Idle Car Empire",
    short_name: "Car Empire",
    description: "Build a global car empire — from a tiny garage to hypercars.",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    orientation: "any",
    background_color: "#06070a",
    theme_color: "#06070a",
    icons: [
      { src: `${base}/icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${base}/icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${base}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
