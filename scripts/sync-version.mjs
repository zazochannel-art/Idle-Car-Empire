// One version for every app: android/version.properties (versionName, versionCode) is the source,
// and this copies it into the iOS project (MARKETING_VERSION, CURRENT_PROJECT_VERSION) and
// package.json. scripts/build-app.mjs runs it before every app build; src/version-sync.test.ts
// fails when they differ.
//
//   node scripts/sync-version.mjs
import fs from "node:fs";

export function readVersion(text = fs.readFileSync("android/version.properties", "utf8")) {
  const get = (k) => new RegExp(`^${k}=(.+)$`, "m").exec(text)?.[1]?.trim();
  const name = get("versionName");
  const code = Number(get("versionCode"));
  if (!name || !/^\d+\.\d+\.\d+$/.test(name) || !Number.isInteger(code) || code < 1) throw new Error("android/version.properties: versionName (x.y.z) and versionCode (a whole number) are needed");
  return { name, code };
}

export const PBXPROJ = "ios/App/App.xcodeproj/project.pbxproj";

export function withVersion(pbxproj, { name, code }) {
  return pbxproj.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${name};`).replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${code};`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const v = readVersion();
  const before = fs.readFileSync(PBXPROJ, "utf8");
  const after = withVersion(before, v);
  if (after !== before) fs.writeFileSync(PBXPROJ, after);
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (pkg.version !== v.name) {
    pkg.version = v.name;
    fs.writeFileSync("package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  }
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  if (lock.version !== v.name || lock.packages?.[""]?.version !== v.name) {
    lock.version = v.name;
    if (lock.packages?.[""]) lock.packages[""].version = v.name;
    fs.writeFileSync("package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
  }
  console.log(`version ${v.name} (${v.code}) in Android, iOS and package.json`);
}
