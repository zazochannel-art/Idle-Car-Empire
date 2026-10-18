# The iOS app (iPhone and iPad)

The iOS app is the same game as the Android app, packaged with
[Capacitor](https://capacitorjs.com) in the Xcode project in `ios/`. It
starts and plays with no connection; cloud saves, leaderboards and the
rewarded ads use the network when there is one.

| | |
| --- | --- |
| Bundle id | `com.zazochannel.idlecarempire` (the same as on Android; permanent once on the App Store) |
| Version | `MARKETING_VERSION` 1.0.0, build `CURRENT_PROJECT_VERSION` 1 (Xcode → App target → General) |
| iOS | 15 and newer, iPhone (portrait) and iPad |
| Native code | Capacitor 8 with Swift Package Manager (no CocoaPods): `ios/App/CapApp-SPM/Package.swift` lists the plugins (AdMob, App, Local Notifications) |

## What is checked automatically

`.github/workflows/ios.yml` runs on a macOS runner for every pull request
and every push to `main`:

1. builds the game (`npm run build:ios`);
2. builds the app for the iOS Simulator (no signing);
3. installs it in an iPhone simulator, starts it, and checks after a minute
   that it is still running, that the game's page loaded inside the app, and
   that the screen isn't empty. The screenshot and the app's log are kept as
   the run's artifact (`ios-simulator-check`).

It doesn't sign the app or send it to Apple: that needs your account (below).

## Building on a Mac

You need a Mac with Xcode (the version the App Store currently asks for) and
Node.js 22.

```bash
npm ci
npm run build:ios      # the game into the iOS project
npm run ios:open       # opens ios/App/App.xcodeproj in Xcode
```

In Xcode, pick a simulator or your iPhone and press Run. After any change to
the game, run `npm run build:ios` again.

The app's icons and launch screen are drawn by `npm run app:assets` (the same
logo as the Android icons, `assets/logo.webp`).

## What you need to do (your Apple account)

These steps need your identity and payment details: they can't be done from
the repository.

1. **Apple Developer Program**: join at
   [developer.apple.com/programs](https://developer.apple.com/programs/) with
   your Apple ID. It costs 99 USD a year (an organisation also needs a D-U-N-S
   number). Without it the app can run only in the simulator or, for 7 days at
   a time, on your own iPhone.
2. **Signing**: in Xcode → App target → *Signing & Capabilities*, choose your
   team and keep *Automatically manage signing*. Xcode creates the App ID
   `com.zazochannel.idlecarempire` and the certificates.
3. **App Store Connect**: [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
   → *My Apps* → *+* → *New App*: platform iOS, name *Idle Car Empire*, bundle
   id `com.zazochannel.idlecarempire`, SKU of your choice.
4. **AdMob for iOS**: in [AdMob](https://admob.google.com), add the iOS app
   (*Apps → Add app → iOS*) and a **Rewarded** ad unit for it, as for Android
   (docs/android/ads.md). Then, in GitHub → the repository → Settings →
   Secrets and variables → Actions → **Variables**:
   - `ADMOB_APP_ID_IOS`: the iOS app id (`ca-app-pub-…~…`);
   - `ADMOB_REWARDED_ID_IOS`: the iOS rewarded unit (`ca-app-pub-…/…`).

   For a build in Xcode, set the same app id in the App target's build
   settings (`ADMOB_APP_ID`, a user-defined setting; it holds Google's sample
   id until then) and build the game with
   `NEXT_PUBLIC_ADMOB_REWARDED_ID_IOS=… npm run build:ios`. Until both are
   set, the app shows Google's test ads, which pay nothing.
5. **Consent messages**: in AdMob → *Privacy & messaging*, publish the GDPR
   message for the iOS app too, and the **IDFA explainer** message (shown
   before Apple's *Allow tracking?* question).
6. **App Privacy** (App Store Connect → the app → *App Privacy*): declare
   what the privacy policy describes:
   - *Contact info → Email address* (accounts), linked to the user, not used
     for tracking;
   - *Identifiers → User ID* (the account id), linked, not for tracking;
   - *Identifiers → Device ID* (the advertising identifier, through AdMob),
     used for third-party advertising and tracking (only if the player allows
     tracking);
   - *Usage data → Advertising data* and *Diagnostics* (AdMob);
   - *Coarse location* (AdMob estimates it from the IP address), for
     advertising.

   The privacy policy URL:
   `https://zazochannel-art.github.io/Idle-Car-Empire/privacy/`.
7. **Age rating**: answer the questionnaire; the game targets 13+ and its ads
   are limited to the *Teen* rating.
8. **Sign-in for App Review**: the game needs an account. In App Store
   Connect → the version → *App Review Information*, tick *Sign-in required*
   and enter a test account's email and password (create it in the app; keep
   the password out of this repository). Apple's guideline 5.1.1(v) asks
   apps without significant account-based features to let people play without
   signing in: the game's cloud save, leaderboards, alliances and gifts are
   the account-based features to name in the review notes if Apple asks.
9. **Upload**: in Xcode, *Product → Archive*, then *Distribute App → App
   Store Connect*. Test it with TestFlight, then submit it for review.

## Declarations already in the app

- `Info.plist`:
  - `NSUserTrackingUsageDescription`: the text of Apple's *Allow tracking?*
    question. The app asks once, after Google's consent form, before the first
    ad is requested. A "no" still gets ads, without the advertising id.
  - `GADApplicationIdentifier`: the AdMob app id, from the `ADMOB_APP_ID`
    build setting.
  - `SKAdNetworkItems`: Google's own network (`cstr6suwn9.skadnetwork`). To
    let other ad buyers measure installs too, add the identifiers from
    Google's current list (AdMob's iOS setup guide, *Update your Info.plist*).
  - `ITSAppUsesNonExemptEncryption`: `false`. The app only uses the system's
    HTTPS, so App Store Connect doesn't ask for export documents.
- **Notifications**: the app asks for permission only when the player turns
  notifications on in Settings. It then reminds them, while the game is
  closed, of a building finished or the offline limit reached; nothing is
  sent to a server.
- **Saves**: the game keeps its save in the app's own storage (the page's
  origin is `capacitor://localhost`). Never change `appId` or the server
  settings in `capacitor.config.ts` after release, or players lose their
  progress.
