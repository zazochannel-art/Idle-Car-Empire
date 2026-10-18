// Draws the apps' icons and launch screens from the game's crown-and-car emblem,
// so the installed apps don't show Capacitor's placeholder art. Run after
// changing the emblem:
//
//   npm run app:assets
//
// Android (android/app/src/main/res): legacy and round icons (Android 7),
// adaptive icon layers with a themed-icon silhouette (Android 8+ / 13+), the
// notification icon, and the launch-screen pictures shown before the game loads
// (Android 7–11; newer systems show the icon on the background colour set in
// styles.xml).
// iOS (ios/App/App/Assets.xcassets): the 1024 px app icon (no transparency, as
// the App Store asks) and the launch screen.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RES = path.resolve("android/app/src/main/res");
/** The game's background (styles.xml and capacitor.config.ts use the same). */
const BG = "#06070a";

// The emblem on a 512 grid.
const EMBLEM = `
  <defs>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset=".45" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#0891b2"/></linearGradient>
    <linearGradient id="amber" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
  </defs>
  <path d="M256 48 L408 108 L391 276 Q373 373 256 445 Q139 373 121 276 L104 108 Z" fill="#0b1220" stroke="url(#metal)" stroke-width="9" stroke-linejoin="round"/>
  <path d="M256 68 L387 120 L371 270 Q355 350 256 412 Q157 350 141 270 L125 120 Z" fill="#111c2e" stroke="#26364d" stroke-width="3"/>
  <path d="M139 260 L176 238 L211 181 Q222 164 244 161 L298 161 Q319 164 332 184 L361 229 L390 248 L390 291 L355 301 L331 285 L182 285 L160 302 L126 291 Z" fill="url(#metal)" stroke="#e2e8f0" stroke-width="5" stroke-linejoin="round"/>
  <path d="M220 187 Q228 177 244 177 L296 177 Q309 179 318 194 L339 228 L198 228 Z" fill="#07111f" stroke="#22d3ee" stroke-width="4" stroke-linejoin="round"/>
  <path d="M266 180 L266 226" stroke="#22d3ee" stroke-width="4"/>
  <path d="M147 258 L185 243 L203 243 L191 260 Z" fill="url(#amber)"/><path d="M337 243 L357 246 L379 260 L341 260 Z" fill="url(#amber)"/>
  <path d="M151 278 L185 278 L185 290 L160 294 Z M330 278 L366 278 L359 294 L330 290 Z" fill="#020617"/>
  <circle cx="190" cy="290" r="22" fill="#020617" stroke="#94a3b8" stroke-width="7"/><circle cx="190" cy="290" r="8" fill="url(#cyan)"/>
  <circle cx="330" cy="290" r="22" fill="#020617" stroke="#94a3b8" stroke-width="7"/><circle cx="330" cy="290" r="8" fill="url(#cyan)"/>
  <path d="M256 319 L276 356 L256 369 L236 356 Z" fill="url(#cyan)"/><path d="M256 329 L256 352" stroke="#e0f2fe" stroke-width="4" stroke-linecap="round"/>
`;

const BACKDROP = `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c2638"/><stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.45">
      <stop offset="0" stop-color="#f59e0b" stop-opacity="0.28"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <rect width="512" height="512" fill="url(#glow)"/>`;

/** The emblem scaled about its middle (258, 250) and centred on a 512 canvas. */
const placed = (scale) => `<g transform="translate(256 256) scale(${scale}) translate(-258 -250)">${EMBLEM}</g>`;
const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`);

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function png(input, size, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let img = sharp(input, { density: 72 * (size / 512) * 4 }).resize(size, size);
  if (opts.mask) img = img.composite([{ input: opts.mask(size), blend: "dest-in" }]);
  await img.png({ compressionLevel: 9 }).toFile(file);
}

const circle = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
const rounded = (size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * 0.18}"/></svg>`);

// Adaptive icon layers are 108 dp with the visible part in the middle 72 dp (and only a
// 66 dp circle is safe under every mask): the emblem fits that circle at about 0.7.
const foreground = svg(placed(0.7));
const background = svg(BACKDROP);
// Android 13 themed icons: one colour that the launcher tints, so only the shape counts.
// Drawn white with the windows and hubs black, then that brightness becomes the alpha.
const monochrome = svg(
  placed(0.7)
    .replace(/<ellipse[^>]*\/>/, "")
    .replace(/fill="#(bae6fd|94a3b8)"/g, 'fill="#000"')
    .replace(/fill="(?!#000")[^"]*"/g, 'fill="#fff"')
    .replace(/stroke="[^"]*"/g, 'stroke="#fff"'),
);
async function silhouette(size, file, shape = monochrome) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const alpha = await sharp(shape, { density: 72 * (size / 512) * 4 })
    .resize(size, size)
    .flatten({ background: "#000" })
    .extractChannel(0)
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: "#fff" } })
    .joinChannel(alpha)
    .png({ compressionLevel: 9 })
    .toFile(file);
}
// The legacy square and round icons: backdrop and emblem together.
const full = svg(BACKDROP + placed(0.82));

for (const [d, k] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${d}`);
  await png(foreground, 108 * k, path.join(dir, "ic_launcher_foreground.png"));
  await png(background, 108 * k, path.join(dir, "ic_launcher_background.png"));
  await silhouette(108 * k, path.join(dir, "ic_launcher_monochrome.png"));
  await png(full, 48 * k, path.join(dir, "ic_launcher.png"), { mask: rounded });
  await png(full, 48 * k, path.join(dir, "ic_launcher_round.png"), { mask: circle });
}

fs.writeFileSync(
  path.join(RES, "mipmap-anydpi-v26/ic_launcher.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`,
);
fs.copyFileSync(path.join(RES, "mipmap-anydpi-v26/ic_launcher.xml"), path.join(RES, "mipmap-anydpi-v26/ic_launcher_round.xml"));
// the template's placeholder background layer is no longer used
fs.rmSync(path.join(RES, "drawable/ic_launcher_background.xml"), { force: true });
fs.rmSync(path.join(RES, "drawable-v24/ic_launcher_foreground.xml"), { force: true });

// Launch screens (Android 7–11): the emblem small in the middle of the game's background.
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
async function splash(w, h, file) {
  const side = Math.round(Math.min(w, h) * 0.42);
  const emblem = await sharp(svg(placed(0.95)), { density: 72 * (side / 512) * 4 })
    .resize(side, side)
    .png()
    .toBuffer();
  await sharp({ create: { width: w, height: h, channels: 3, background: BG } })
    .composite([{ input: emblem, left: Math.round((w - side) / 2), top: Math.round((h - side) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  await splash(w, h, path.join(RES, `drawable-port-${d}/splash.png`));
  await splash(h, w, path.join(RES, `drawable-land-${d}/splash.png`));
}
await splash(480, 320, path.join(RES, "drawable/splash.png"));

// Notification icon (Android): white on transparent, the emblem filling the 24 dp square.
const notifyShape = svg(
  placed(0.98)
    .replace(/<ellipse[^>]*\/>/, "")
    .replace(/fill="#(bae6fd|94a3b8)"/g, 'fill="#000"')
    .replace(/fill="(?!#000")[^"]*"/g, 'fill="#fff"')
    .replace(/stroke="[^"]*"/g, 'stroke="#fff"'),
);
for (const [d, k] of Object.entries(DENSITIES)) await silhouette(24 * k, path.join(RES, `drawable-${d}/ic_stat_notify.png`), notifyShape);

// Shared web/store icon exports use the same master artwork.
await png(full, 512, path.resolve("site/icon.png"));
await png(full, 512, path.resolve("docs/android/store/icon-512.png"));

// iOS: the app icon (opaque: the App Store refuses transparency) and the launch screen.
const IOS = path.resolve("ios/App/App/Assets.xcassets");
if (fs.existsSync(IOS)) {
  await sharp(full, { density: 72 * 2 * 4 })
    .resize(1024, 1024)
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(IOS, "AppIcon.appiconset/AppIcon-512@2x.png"));
  for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) await splash(2732, 2732, path.join(IOS, "Splash.imageset", f));
}
console.log("App icons and launch screens written: Android (android/app/src/main/res) and iOS (ios/App/App/Assets.xcassets)");
