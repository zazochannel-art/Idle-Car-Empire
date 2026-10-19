// Builds the game and copies it into the app projects:
//
//   npm run build:app        # Android and iOS
//   npm run build:android    # only Android
//   npm run build:ios        # only iOS
//
// The game's static export (out/), served from inside each app. Cloud saves need
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the project's
// public key), from the environment or a .env.local file; without them the app
// saves on the phone only.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const platform = process.argv[2] ?? "";
if (platform && !["android", "ios"].includes(platform)) throw new Error(`unknown platform "${platform}" (android or ios)`);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) console.warn("NEXT_PUBLIC_SUPABASE_URL is not set: this build has no cloud saves (unless .env.local sets it).");

execSync("node scripts/app-assets.mjs", { stdio: "inherit" });
execSync("npx next build", { stdio: "inherit" });
// SOURCE_MAPS=1 (CI): the maps go to source-maps/ with the scripts they describe, not into the app
if (process.env.SOURCE_MAPS === "1") {
  const chunks = "out/_next/static/chunks";
  fs.rmSync("source-maps", { recursive: true, force: true });
  fs.cpSync(chunks, "source-maps/chunks", { recursive: true });
  for (const f of fs.readdirSync(chunks)) if (f.endsWith(".map")) fs.rmSync(path.join(chunks, f));
}
execSync(`npx cap sync ${platform}`.trim(), { stdio: "inherit" });
