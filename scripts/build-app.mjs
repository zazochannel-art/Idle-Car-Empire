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

const platform = process.argv[2] ?? "";
if (platform && !["android", "ios"].includes(platform)) throw new Error(`unknown platform "${platform}" (android or ios)`);
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) console.warn("NEXT_PUBLIC_SUPABASE_URL is not set: this build has no cloud saves (unless .env.local sets it).");

execSync("node scripts/app-assets.mjs", { stdio: "inherit" });
execSync("npx next build", { stdio: "inherit" });
execSync(`npx cap sync ${platform}`.trim(), { stdio: "inherit" });
