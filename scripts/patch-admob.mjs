// Run by `npm install` / `npm ci` (package.json "postinstall"): fixes the App Open ads of
// @capacitor-community/admob 8.2.1, on Android and iOS (both builds compile the plugin from
// node_modules, so the change reaches every app).
//
// The plugin kept an App Open ad that was never shown and answered every later load with it, with no
// new request. The game asks for a load when its ad is about to expire (lib/native-ads.ts), so the
// same ad came back, was taken for a fresh one and could be shown hours past Google's 4-hour limit
// (an expired App Open ad may not show or pay). Patched: a load asked for replaces an unshown ad,
// and one loaded over 4 hours ago is never shown.
//
// Safe to run again (an already patched file is left as it is). If the plugin's code changed (a new
// version), the install stops here: check whether the new version still needs this fix, then
// update or remove this script (src/lib/admob-plugin-patch.test.ts checks the patch is in).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = join(ROOT, "node_modules/@capacitor-community/admob");
export const PATCHED_VERSION = "8.2.1";
export const MARKER = "idle-car-empire patch (scripts/patch-admob.mjs)";

export const FILES = [
  {
    path: "android/src/main/java/com/getcapacitor/community/admob/appopen/AppOpenAdManager.kt",
    edits: [
      ["import android.content.Context\n", "import android.content.Context\nimport android.os.SystemClock\n"],
      [
        "    private var isShowingAd = false\n\n    val isAdLoaded: Boolean\n        get() = appOpenAd != null\n",
        `    private var isShowingAd = false
    // ${MARKER}: an App Open ad expires 4 hours after its load
    private var loadedAt = 0L
    private val maxAgeMs = 4 * 60 * 60 * 1000L

    private val isExpired: Boolean
        get() = SystemClock.elapsedRealtime() - loadedAt >= maxAgeMs

    val isAdLoaded: Boolean
        get() = appOpenAd != null && !isExpired
`,
      ],
      [
        "        if (appOpenAd != null) {\n            onLoaded()\n            return\n        }\n",
        "        // a load asked for is a new ad: one kept unshown may be too old to show or to pay\n        if (appOpenAd != null && !isShowingAd) appOpenAd = null\n        if (appOpenAd != null) {\n            onLoaded()\n            return\n        }\n",
      ],
      ["                    appOpenAd = ad\n                    isLoadingAd = false\n", "                    appOpenAd = ad\n                    loadedAt = SystemClock.elapsedRealtime()\n                    isLoadingAd = false\n"],
      [
        "        if (appOpenAd == null || isShowingAd) {\n            onFailedToShow(null)\n",
        "        // never one past its 4 hours\n        if (appOpenAd != null && !isShowingAd && isExpired) appOpenAd = null\n        if (appOpenAd == null || isShowingAd) {\n            onFailedToShow(null)\n",
      ],
    ],
  },
  {
    path: "ios/Sources/AdMobPlugin/AppOpen/AppOpenAdManager.swift",
    edits: [
      [
        "    private var isShowingAd = false\n",
        `    private var isShowingAd = false
    // ${MARKER}: an App Open ad expires 4 hours after its load
    private var loadedAt = Date.distantPast
    private let maxAge: TimeInterval = 4 * 60 * 60
    private var isExpired: Bool { Date().timeIntervalSince(loadedAt) >= maxAge }
`,
      ],
      [
        "        if appOpenAd != nil {\n            onLoaded()\n            return\n        }\n",
        "        // a load asked for is a new ad: one kept unshown may be too old to show or to pay\n        if appOpenAd != nil && !isShowingAd { appOpenAd = nil }\n        if appOpenAd != nil {\n            onLoaded()\n            return\n        }\n",
      ],
      ["                    self.appOpenAd = ad\n", "                    self.appOpenAd = ad\n                    self.loadedAt = Date()\n"],
      [
        "        guard let ad = appOpenAd, !isShowingAd else {\n",
        "        // never one past its 4 hours\n        if appOpenAd != nil && !isShowingAd && isExpired { appOpenAd = nil }\n        guard let ad = appOpenAd, !isShowingAd else {\n",
      ],
      ["        return appOpenAd != nil\n", "        return appOpenAd != nil && !isExpired\n"],
    ],
  },
];

/** The file's text with the edits made (each `from` must be there exactly once); unchanged if already patched. */
export function patchText(text, edits, file) {
  if (text.includes(MARKER)) return text;
  let out = text;
  for (const [from, to] of edits) {
    const n = out.split(from).length - 1;
    if (n !== 1) throw new Error(`${file}: expected the plugin's code once, found it ${n} times:\n${from}`);
    out = out.replace(from, to);
  }
  return out;
}

function main() {
  if (!existsSync(join(PLUGIN, "package.json"))) {
    console.log("patch-admob: @capacitor-community/admob is not installed, nothing to patch");
    return;
  }
  const version = JSON.parse(readFileSync(join(PLUGIN, "package.json"), "utf8")).version;
  for (const f of FILES) {
    const file = join(PLUGIN, f.path);
    const text = readFileSync(file, "utf8");
    if (text.includes(MARKER)) continue;
    if (version !== PATCHED_VERSION) {
      throw new Error(
        `patch-admob: @capacitor-community/admob is ${version}, this patch is for ${PATCHED_VERSION}. ` +
          "Check whether the new version still answers a load with a kept, unshown App Open ad (AppOpenAdManager), then update or remove scripts/patch-admob.mjs.",
      );
    }
    writeFileSync(file, patchText(text, f.edits, f.path));
    console.log(`patch-admob: ${f.path} patched (App Open ads: fresh on every load, never shown after 4 hours)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
