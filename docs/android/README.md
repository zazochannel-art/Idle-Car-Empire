# The Android app

Idle Car Empire for Android is the same game as the web version, packaged with
[Capacitor 8](https://capacitorjs.com/). The game's static export
(`out/`) ships inside the app and runs in the system WebView, so it starts
and plays with no connection. Cloud saves, the leaderboards and the other
online features talk to the same Supabase project as the web game.

| | |
| --- | --- |
| Application id | `com.zazochannel.idlecarempire` (permanent once on Google Play) |
| Debug build id | `com.zazochannel.idlecarempire.debug` ("Car Empire DEBUG", installs next to the store app) |
| SDK levels | minSdk 24 (Android 7.0), target/compile SDK 36 (Android 16) |
| Version | `android/version.properties` (`versionCode`, `versionName`) |
| Permissions | `INTERNET` (cloud save), `VIBRATE` (haptics) |
| Orientation | portrait on phones; tablets and foldables rotate (Android 16 ignores the lock on large screens) |

Other documents: [signing.md](signing.md) (the upload key),
[play-store.md](play-store.md) (listing, forms, publication),
[ads.md](ads.md) (rewarded ads: not in this version).

## Why Capacitor (and not a Trusted Web Activity)

- **Offline from the first start.** The game's files are inside the app; a
  TWA would load the GitHub Pages site and depend on its service worker.
- **No domain needed.** A TWA must prove ownership of its site with
  `/.well-known/assetlinks.json` at the *domain root*
  (`zazochannel-art.github.io/.well-known/…`), which a project site under
  `/Idle-Car-Empire/` can't serve without a separate user-site repository.
- **Native features when needed**: the Back button, app background and
  foreground, and later rewarded ads or notifications, through Capacitor
  plugins. The same project can add iOS (`npx cap add ios`) later.

## How the game behaves in the app

- **Origin `https://localhost`** (`capacitor.config.ts`). The saves live in
  that origin's storage: never change `server.androidScheme` or
  `server.hostname`, or players lose their progress on update.
- **No service worker** in the app (its files ship with it; a cache could serve
  the previous version after an update). The web version keeps its own.
- **Back button**: closes what is on top, the same way Escape does (a
  dialog, a sheet, the factory floor, the garage, the race viewer). With
  nothing open it puts the app in the background like Home.
- **Leaving the app** (Home, another app, screen off) saves at once and stops
  the game loop: no battery use in the background, and nothing is lost if
  Android closes the app. On return, the time away is settled like any absence
  (the offline earnings report for long ones).
- **Edge to edge** (Android 15+): the game's HUD and sheets use the safe-area
  insets; a light shade under the status bar keeps its icons readable.
- **Links**: email confirmation and the save-transfer link point at the web
  game (`https://zazochannel-art.github.io/Idle-Car-Empire/`). The app signs in
  with email and password only; sign-in links by email would open the browser,
  so the app doesn't offer them.
- **Saves**: as on the web (`src/game/save/`, `docs/cloud-save.md`): on the
  phone at every change, in the cloud when signed in (guests included). Android's
  own backup also covers the app's data.

## Building

The Android project is in `android/`. Its copy of the game
(`android/app/src/main/assets/public`) is generated, not committed.

### In GitHub Actions (no setup needed)

`.github/workflows/android.yml` runs on every pull request, on `main` and on
demand (Actions → Android → Run workflow). Its artifacts:

- `idle-car-empire-debug-apk`: `app-debug.apk`, to install on a phone.
- `idle-car-empire-release-aab`: `app-release.aab` for Google Play. It is
  signed when the repository has the upload key in its secrets (not on pull
  requests), unsigned otherwise. See [signing.md](signing.md).
- `android-lint-report`, `android-emulator-check` (screenshots and results).

The workflow also validates the bundle with bundletool (package, versions,
SDK levels, permissions), and runs the app on an Android 15 emulator
(`scripts/android-device-check.mjs`).

### On your computer

Needs Node 22+, JDK 21 and the Android SDK (platform 36). The easiest way to
get the SDK is [Android Studio](https://developer.android.com/studio).

```bash
npm ci
# .env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# (the public values from .github/workflows/pages.yml) for cloud saves
npm run build:android          # the game for the app + cap sync
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease        # app/build/outputs/bundle/release/app-release.aab
```

`npm run android:open` opens the project in Android Studio (Run ▶ installs it
on a connected phone or an emulator). After changing the game, run
`npm run build:android` again before building the app.

Icons and launch screens are drawn by `npm run android:assets`
(`scripts/android-assets.mjs`) from the crown-and-car emblem.

## Installing the debug APK on your phone

1. Get `app-debug.apk`: from a workflow run (Actions → Android → the run →
   Artifacts → `idle-car-empire-debug-apk`, a zip with the APK inside), or from
   your own build.
2. Copy it to the phone (USB, Google Drive, email…) and open it there.
3. Android asks to allow installing apps from that source (the file manager or
   browser): allow it, go back, and tap **Install**. Google Play Protect may
   warn about an unknown developer: **More details → Install anyway** (this is
   your own build).
4. Open **Car Empire DEBUG**. It is a separate app from the Google Play one,
   with its own saves (sign in to the same account to share progress).

With a USB cable instead: enable *Developer options → USB debugging* on the
phone, then `adb install -r app-debug.apk`.

From 2026 Google requires developer verification for apps installed outside
Google Play on certified devices, starting in Brazil, Indonesia, Singapore and
Thailand (30 September 2026) and worldwide in 2027. Installing over USB with
`adb` stays possible.

### Checking the app on your phone automatically

With the phone connected over USB (USB debugging on):

```bash
node scripts/android-device-check.mjs path/to/app-debug.apk --reboot
```

It installs the APK and checks:
- that the game starts;
- that Back closes a dialog and then backgrounds the app;
- that leaving the app saves at once and stops the loop;
- that the same company and settings survive the app being killed, an update, and a restart (`--reboot`).

It **uninstalls the debug app first**, so its saves on that phone are reset.
Screenshots go to `android-check/`.

## Releasing an update

1. Raise `versionCode` (by 1) and `versionName` in `android/version.properties`.
2. Merge to `main`. The workflow builds `app-release.aab`, signed if the key is in the secrets.
3. Upload it in Play Console (see [play-store.md](play-store.md)).
