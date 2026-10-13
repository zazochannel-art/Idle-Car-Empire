// Builds the game for the Android app and copies it into the Android project:
//
//   npm run build:android
//
// The same static export as the web version, but served from the app's own root
// (https://localhost/) instead of GitHub Pages' /Idle-Car-Empire/ folder. Cloud
// saves need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the
// project's public key), from the environment or a .env.local file, exactly as
// for the web build; without them the app saves on the phone only.
import { execSync } from "node:child_process";

const env = { ...process.env, PAGES_BASE_PATH: "" };
if (!env.NEXT_PUBLIC_SUPABASE_URL) console.warn("NEXT_PUBLIC_SUPABASE_URL is not set: this build has no cloud saves (unless .env.local sets it).");

execSync("npx next build", { stdio: "inherit", env });
execSync("npx cap sync android", { stdio: "inherit", env });
