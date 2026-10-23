// Draws the apps' icons and launch screens from the game's logo, so the
// installed apps don't show Capacitor's placeholder art. Run after changing the
// logo:
//
//   npm run app:assets
//
// The logo is assets/logo.webp (on its dark backdrop) and assets/logo-cutout.webp
// (the same picture with the backdrop taken out, for anything drawn on another
// background).
//
// Android (android/app/src/main/res): legacy and round icons (Android 7),
// adaptive icon layers (Android 8+), the notification icon, and the launch-screen
// pictures shown before the game loads (Android 7–11; newer systems show the icon
// on the background colour set in styles.xml).
// iOS (ios/App/App/Assets.xcassets): the 1024 px app icon (no transparency, as
// the App Store asks) and the launch screen.
// The game's own loading screen (public/logo.webp), the store icon and the site's.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RES = path.resolve("android/app/src/main/res");
/** The game's background (styles.xml and capacitor.config.ts use the same). */
const BG = "#06070a";
const LOGO = path.resolve("assets/logo.webp");
const CUTOUT = path.resolve("assets/logo-cutout.webp");
/** The logo's own backdrop, lighter at the top right: behind the cut-out logo it matches the full one. */
const BACKDROP = `
  <defs><linearGradient id="bd" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17293f"/><stop offset="1" stop-color="#0b1523"/></linearGradient></defs>
  <rect width="512" height="512" fill="url(#bd)"/>`;

const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`);

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function png(input, size, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let img = sharp(input, { density: 72 * (size / 512) * 4 }).resize(size, size);
  if (opts.mask) img = img.composite([{ input: opts.mask(size), blend: "dest-in" }]);
  await img.png({ compressionLevel: 9 }).toFile(file);
}

/** The cut-out logo at `scale` of a transparent square, in its middle. */
async function centred(size, scale) {
  const side = Math.round(size * scale);
  const logo = await sharp(CUTOUT).resize(side, side).png().toBuffer();
  const at = Math.round((size - side) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: logo, left: at, top: at }])
    .png()
    .toBuffer();
}

const circle = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
const rounded = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.18}"/></svg>`);

// Adaptive icon layers are 108 dp with the visible part in the middle 72 dp, and only a
// 66 dp circle is safe under every mask. The badge reaches 0.47 of the logo's side from
// its middle, so at 0.64 of the layer it stays inside that circle.
for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${d}`);
  await png(await centred(108 * k, 0.64), 108 * k, path.join(dir, "ic_launcher_foreground.png"));
  await png(svg(BACKDROP), 108 * k, path.join(dir, "ic_launcher_background.png"));
  // the legacy square and round icons: the whole logo
  await png(LOGO, 48 * k, path.join(dir, "ic_launcher.png"), { mask: rounded });
  await png(LOGO, 48 * k, path.join(dir, "ic_launcher_round.png"), { mask: circle });
  // no themed (one-colour) icon: the logo is a picture, so launchers show it in colour
  fs.rmSync(path.join(dir, "ic_launcher_monochrome.png"), { force: true });
}

fs.writeFileSync(
  path.join(RES, "mipmap-anydpi-v26/ic_launcher.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`,
);
fs.copyFileSync(path.join(RES, "mipmap-anydpi-v26/ic_launcher.xml"), path.join(RES, "mipmap-anydpi-v26/ic_launcher_round.xml"));
// the template's placeholder background layer is no longer used
fs.rmSync(path.join(RES, "drawable/ic_launcher_background.xml"), { force: true });
fs.rmSync(path.join(RES, "drawable-v24/ic_launcher_foreground.xml"), { force: true });

// Launch screens: the cut-out logo in the middle of the game's background, `scale` of its shorter side.
async function splash(w, h, file, scale = 0.62) {
  const side = Math.round(Math.min(w, h) * scale);
  const logo = await sharp(CUTOUT).resize(side, side).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([{ input: logo, left: Math.round((w - side) / 2), top: Math.round((h - side) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}
// Android 7–11
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  await splash(w, h, path.join(RES, `drawable-port-${d}/splash.png`));
  await splash(h, w, path.join(RES, `drawable-land-${d}/splash.png`));
}
await splash(480, 320, path.join(RES, "drawable/splash.png"));

// Notification icon (Android): white on transparent, so a simple shape rather than the
// logo's picture: the crown over a car, filling the 24 dp square. Drawn white with the
// windows and hubs black, then that brightness becomes the alpha.
const EMBLEM = `
  <path d="M150 170 L180 92 L222 140 L256 66 L290 140 L332 92 L362 170 Z" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="180" cy="92" r="12" fill="#fff"/>
  <circle cx="256" cy="62" r="12" fill="#fff"/>
  <circle cx="332" cy="92" r="12" fill="#fff"/>
  <path d="M128 286 L176 222 Q190 204 214 204 L300 204 Q324 204 338 222 L392 286 Z" fill="#fff"/>
  <rect x="84" y="278" width="348" height="92" rx="34" fill="#fff"/>
  <path d="M194 278 L232 226 L262 226 L262 278 Z" fill="#000"/>
  <path d="M282 226 L316 226 L356 278 L282 278 Z" fill="#000"/>
  <rect x="96" y="318" width="34" height="14" rx="7" fill="#fff"/>
  <rect x="390" y="318" width="34" height="14" rx="7" fill="#fff"/>
  <circle cx="164" cy="372" r="40" fill="#fff"/>
  <circle cx="164" cy="372" r="19" fill="#000"/>
  <circle cx="352" cy="372" r="40" fill="#fff"/>
  <circle cx="352" cy="372" r="19" fill="#000"/>`;
const notifyShape = svg(`<g transform="translate(256 256) scale(0.98) translate(-258 -250)">${EMBLEM}</g>`);
async function silhouette(size, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const alpha = await sharp(notifyShape, { density: 72 * (size / 512) * 4 })
    .resize(size, size)
    .flatten({ background: "#000" })
    .extractChannel(0)
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "#fff" } })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toFile(file);
}
for (const [d, k] of Object.entries(DENSITIES)) await silhouette(24 * k, path.join(RES, `drawable-${d}/ic_stat_notify.png`));

// The store icon, and the site's (shown at 96 px and as the tab icon).
await png(LOGO, 512, path.resolve("fastlane/metadata/android/en-US/images/icon.png"));
await png(LOGO, 192, path.resolve("site/icon.png"));
// The game's loading screen shows the cut-out logo (about 240 px wide on a phone, so 3× that).
await sharp(CUTOUT).resize(720, 720).webp({ quality: 85, alphaQuality: 90 }).toFile(path.resolve("public/logo.webp"));

// iOS: the app icon (opaque: the App Store refuses transparency) and the launch screen.
const IOS = path.resolve("ios/App/App/Assets.xcassets");
if (fs.existsSync(IOS)) {
  await sharp(LOGO).resize(1024, 1024).flatten({ background: BG }).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(IOS, "AppIcon.appiconset/AppIcon-512@2x.png"));
  // the launch picture fills the screen (aspect fill), so a phone shows only its middle
  // third or so: the logo is drawn smaller to fit in it
  for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) await splash(2732, 2732, path.join(IOS, "Splash.imageset", f), 0.34);
}
console.log("App icons and launch screens written: Android (android/app/src/main/res), iOS (ios/App/App/Assets.xcassets), public/logo.webp and the store and site icons");
