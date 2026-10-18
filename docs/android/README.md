# The Android app

Idle Car Empire for Android is the same game as the iOS app ([../ios.md](../ios.md)),
packaged with [Capacitor 8](https://capacitorjs.com/). The game's static
export (`out/`) ships inside the app and runs in the system WebView, so it
starts and plays with no connection. Cloud saves, the leaderboards and the
other online features talk to the game's Supabase project.

| | |
| --- | --- |
| Application id | `com.zazochannel.idlecarempire` (permanent once on Google Play) |
| Debug build id | `com.zazochannel.idlecarempire.debug` ("Car Empire DEBUG", installs next to the store app) |
| SDK levels | minSdk 24 (Android 7.0), target/compile SDK 36 (Android 16) |
| Version | `android/version.properties` (`versionCode`, `versionName`) |
| Permissions | `INTERNET` (cloud save, ads), `VIBRATE` (haptics), `POST_NOTIFICATIONS` (asked only when the player turns notifications on); the notifications plugin adds `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK` (its `SCHEDULE_EXACT_ALARM` is removed: the game's reminders are never exact); the Google Mobile Ads SDK adds `AD_ID`, `ACCESS_NETWORK_STATE` and its own |
| Orientation | portrait on phones; tablets and foldables rotate (Android 16 ignores the lock on large screens) |

Other documents: [signing.md](signing.md) (the upload key),
[play-store.md](play-store.md) (listing, forms, publication),
[ads.md](ads.md) (rewarded ads: AdMob, consent, what you set up).

## Why Capacitor

- **Offline from the first start.** The game's files are inside the app;
  nothing is loaded from a website.
- **One game, two apps.** The same code ships in the Android and iOS apps.
- **Native features**: the Back button, app background and foreground,
  rewarded ads and notifications, through Capacitor plugins.

## How the game behaves in the app

- **Origin `https://localhost`** (`capacitor.config.ts`). The saves live in
  that origin's storage: never change `server.androidScheme` or
  `server.hostname`, or players lose their progress on update.
- **No service worker**: the game's files ship with the app (a cache could
  serve the previous version after an update).
- **Back button**: closes what is on top, the same way Escape does (a
  dialog, a sheet, the factory floor, the garage, the race viewer). With
  nothing open it puts the app in the background like Home.
- **Leaving the app** (Home, another app, screen off) saves at once and stops
  the game loop: no battery use in the background, and nothing is lost if
  Android closes the app. On return, the time away is settled like any absence
  (the offline earnings report for long ones).
- **Edge to edge** (Android 15+): the game's HUD and sheets use the safe-area
  insets; a light shade under the status bar keeps its icons readable.
- **Notifications** (off until the player turns them on in Settings, which
  asks Android 13+ for permission): when the app goes to the background it
  schedules reminders for buildings that will finish and for the offline
  limit, and takes them back when the player returns (`src/lib/notify.ts`).
- **Links**: an account's confirmation email leads to the game's site
  (`https://zazochannel-art.github.io/Idle-Car-Empire/`), which says the
  address is confirmed. The app signs in with email and password.
- **Moving a save by hand**: Settings → *Export save* copies a code; on the
  other phone, paste it and *Import save* (signing in to the same account on
  both phones is simpler: the cloud save follows the account).
- **Saves** (`src/game/save/`, `docs/cloud-save.md`): on the phone at every
  change, and in the cloud save of the player's account (playing needs an
  account, docs/cloud-save.md). Android's own backup
  also covers the app's data.

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
# (the public values from .github/workflows/android.yml) for cloud saves
npm run build:android          # the game for the app + cap sync
cd android
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease        # app/build/outputs/bundle/release/app-release.aab
```

`npm run android:open` opens the project in Android Studio (Run ▶ installs it
on a connected phone or an emulator). After changing the game, run
`npm run build:android` again before building the app.

Icons, the notification icon and launch screens are drawn by
`npm run app:assets` (`scripts/app-assets.mjs`, which also draws the iOS ones)
from the game's logo (`assets/logo.webp`).

## Installing the debug APK on your phone

1. Get the APK. The quickest way is to open this link on the phone:
   <https://github.com/zazochannel-art/Idle-Car-Empire/releases/download/test-apk/idle-car-empire-test.apk>.
   It is `main`'s latest build (the
   [test-apk release](https://github.com/zazochannel-art/Idle-Car-Empire/releases/tag/test-apk),
   replaced by every build of `main`; no zip, no GitHub account). Any other
   build: a workflow run's artifacts (Actions → Android → the run → Artifacts →
   `idle-car-empire-debug-apk`, a zip with `app-debug.apk` inside), or your own.
2. Open it on the phone (from another device: copy it over by USB, Google
   Drive, email…).
3. Android asks to allow installing apps from that source (the file manager or
   browser): allow it, go back, and tap **Install**. Google Play Protect may
   warn about an unknown developer: **More details → Install anyway** (this is
   your own build).
4. Open **Car Empire DEBUG**. It is a separate app from the Google Play one,
   with its own saves (sign in to the same account to share progress), and it
   always shows Google's test ads.

A newer test APK installs over the older one: CI keeps the debug key in its
cache. If Android ever says the app can't be installed (the cache was dropped
after a week without builds, so the key is new), uninstall Car Empire DEBUG
first; the company comes back when you sign in.

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
- that Back closes a dialog (the daily reward a new game shows after two minutes of play, then Settings) and then backgrounds the app;
- that leaving the app saves at once and stops the loop;
- that the same company and settings survive the app being killed, an update, and a restart (`--reboot`).

It **uninstalls the debug app first**, so its saves on that phone are reset.
Screenshots go to `android-check/`.

## Releasing an update

1. Raise `versionCode` (by 1) and `versionName` in `android/version.properties`.
2. Merge to `main`. The workflow builds `app-release.aab`, signed if the key is in the secrets.
3. Upload it in Play Console (see [play-store.md](play-store.md)).
