// Draws the Android launcher icons and launch screens from the game's crown-and-car
// emblem (the same picture as the web icons in public/), so the installed app
// doesn't show Capacitor's placeholder art. Run after changing the emblem:
//
//   node scripts/android-assets.mjs
//
// Writes into android/app/src/main/res: legacy and round icons (Android 7),
// adaptive icon layers with a themed-icon silhouette (Android 8+ / 13+), and
// the launch-screen pictures shown before the game loads (Android 7–11; newer
// systems show the icon on the background colour set in styles.xml).
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const RES = path.resolve("android/app/src/main/res");
/** The game's background (styles.xml and capacitor.config.ts use the same). */
const BG = "#06070a";

// The emblem on a 512 grid, as on public/icon-512.png.
const EMBLEM = `
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#b91c1c"/>
    </linearGradient>
  </defs>
  <ellipse cx="258" cy="436" rx="148" ry="9" fill="#000" opacity="0.35"/>
  <path d="M150 170 L180 92 L222 140 L256 66 L290 140 L332 92 L362 170 Z" fill="url(#gold)" stroke="#92400e" stroke-width="6" stroke-linejoin="round"/>
  <circle cx="180" cy="92" r="12" fill="#fde68a"/>
  <circle cx="256" cy="62" r="12" fill="#fde68a"/>
  <circle cx="332" cy="92" r="12" fill="#fde68a"/>
  <path d="M128 286 L176 222 Q190 204 214 204 L300 204 Q324 204 338 222 L392 286 Z" fill="url(#paint)"/>
  <rect x="84" y="278" width="348" height="92" rx="34" fill="url(#paint)"/>
  <path d="M194 278 L232 226 L262 226 L262 278 Z" fill="#bae6fd"/>
  <path d="M282 226 L316 226 L356 278 L282 278 Z" fill="#bae6fd"/>
  <rect x="96" y="318" width="34" height="14" rx="7" fill="#fde68a"/>
  <rect x="390" y="318" width="34" height="14" rx="7" fill="#fecaca"/>
  <circle cx="164" cy="372" r="40" fill="#151a2b"/>
  <circle cx="164" cy="372" r="19" fill="#94a3b8"/>
  <circle cx="352" cy="372" r="40" fill="#151a2b"/>
  <circle cx="352" cy="372" r="19" fill="#94a3b8"/>`;

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
async function silhouette(size, file) {
  const alpha = await sharp(monochrome, { density: 72 * (size / 512) * 4 })
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
console.log("Android icons and launch screens written to", RES);
