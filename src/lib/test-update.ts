// The test app (Car Empire DEBUG, the build CI publishes on the test-apk release) looks
// for a newer build of itself: Android updates an app installed from a file only through
// its installer, with the player's tap, so the game offers the download. The Google Play
// app never looks (Play updates it), nor does a build made outside the Android workflow.
import { App } from "@capacitor/app";

const REPO = "zazochannel-art/Idle-Car-Empire";

/** This build's number: the Android workflow's run (0 outside it). */
export const TEST_BUILD = Number(process.env.NEXT_PUBLIC_TEST_BUILD) || 0;

/** The latest test APK (main's latest build). */
export const TEST_APK_URL = `https://github.com/${REPO}/releases/download/test-apk/idle-car-empire-test.apk`;

/** The build number the release's notes carry (`<!-- test-build: N -->`, android.yml), 0 if none. */
export function releaseBuild(notes: unknown): number {
  const m = typeof notes === "string" ? /<!-- test-build: (\d+) -->/.exec(notes) : null;
  return m ? Number(m[1]) : 0;
}

/** The number of a newer build waiting on the release, or null (none, not the test app, offline). */
export async function newerTestBuild(): Promise<number | null> {
  if (!TEST_BUILD) return null;
  const info = await App.getInfo().catch(() => null);
  if (!info?.id.endsWith(".debug")) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/test-apk`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" });
    if (!r.ok) return null;
    const latest = releaseBuild(((await r.json()) as { body?: unknown }).body);
    return latest > TEST_BUILD ? latest : null;
  } catch {
    return null;
  }
}
