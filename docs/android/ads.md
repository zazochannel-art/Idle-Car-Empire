# Rewarded ads (Android app)

The Android app offers **rewarded ads**: the player chooses to watch a short ad
for a bonus. Nothing in the game needs one, and no ad plays without a tap. The
web version (GitHub Pages) has no ads.

## What an ad gives

| Where | Reward | Limits |
| --- | --- | --- |
| Offline report ("Welcome back") | the money earned while away, ×2 | once per report |
| A construction or an upgrade in progress | finished at once | then a 10-minute pause before the next |
| The HUD chip "📺 ×2 profit" (asks first) | ×2 margin on every sale for **30 minutes of play** (the time waits while the game is closed) | one at a time |

At most **20 rewarded ads a day**, all kinds together. The numbers live in
`src/game/config/ads.ts`; the rules in `src/game/engine/ads.ts` (tested in
`src/game/ads.test.ts`).

The reward is given only on the ad network's **reward event** (the ad watched
to the end), once per ad. Closing the ad early gives nothing, and a repeated
event is ignored. The offers show only when an ad is loaded, so a phone that is
offline, or a player who hasn't given consent where it is needed, simply sees
no offer.

## How it is built

- **Plugin:** [`@capacitor-community/admob`](https://github.com/capacitor-community/admob)
  8.1.0, pinned exactly. It brings the Google Mobile Ads SDK (pinned to 25.4.0
  in `android/variables.gradle`) and Google's User Messaging Platform (4.0.0).
- **Loaded only in the app:** `src/lib/native-ads.ts` is imported from
  `src/lib/native.ts`, which only the Android app loads. The screens use
  `src/lib/ads.ts`, which never loads the plugin, so on the web no ad is ever
  ready and no offer shows.
- **Consent first:** at start the app asks Google's UMP whether consent is
  needed (the EEA, the UK, Switzerland). If it is, Google's consent form shows
  before any ad is requested. Where the law asks for it, Settings shows
  **Ad privacy choices** to change it later.
- **Rating:** ads are limited to *Teen* content (the game is for 13 and over).
- **Test ads until you set your ids:** without real ids, the build uses
  Google's public sample ids, which serve test ads that pay nothing:
  - app id `ca-app-pub-3940256099942544~3347511713`;
  - rewarded unit `ca-app-pub-3940256099942544/5224354917`.

  The build log says so ("No AdMob app id … test ads only").
- **The emulator check** (`scripts/android-device-check.mjs`, in CI) loads a
  test ad and watches it to the end, then checks that the ×2 profit started.

## What you need to do (your accounts)

These steps need your Google accounts, your identity and your payment details.
They can't be done from the repository.

1. **AdMob account:** sign up at [admob.google.com](https://admob.google.com)
   with your Google account and accept the AdMob terms. Before AdMob can pay
   you, it asks for:
   - your country and time zone;
   - payment details;
   - tax information;
   - identity verification once you near the payment threshold.

   AdMob costs nothing. You earn from the ads shown.
2. **Add the app:** Apps → Add app → Android → *Is the app listed on a
   supported app store?*
   - Choose *No* until it is on Google Play. Link it to the Play listing
     afterwards.
   - Name it *Idle Car Empire*. AdMob gives you an **app id**,
     `ca-app-pub-…~…`.
3. **Create the ad unit:** in the app, Ad units → Add ad unit → **Rewarded**.
   - Name: *Bonus*. Reward: 1 *bonus*. The game doesn't use the amount.
   - Server-side verification: leave it off.
   - AdMob gives you the **ad unit id**, `ca-app-pub-…/…`.
4. **Consent message:** Privacy & messaging → *European regulations* (GDPR)
   → create a message for the app and publish it.
   - Without a published message, players in the EEA and the UK get no
     consent form, and so no personalised ads.
   - The privacy policy link to use:
     `https://zazochannel-art.github.io/Idle-Car-Empire/privacy/`.
5. **Give the ids to the build:** in GitHub, the repository → Settings →
   Secrets and variables → Actions → **Variables** tab.
   - Add `ADMOB_APP_ID` (the app id) and `ADMOB_REWARDED_ID` (the ad unit
     id).
   - They are not secrets: every copy of the app contains them. They are
     yours, though, so they live in your settings and not in the code.
   - For a build on your computer, set the same two in the environment:
     `ADMOB_APP_ID=… NEXT_PUBLIC_ADMOB_REWARDED_ID=… npm run build:android`,
     then build in Android Studio.
6. **Test safely:** never tap ads in your own app with the real ids. AdMob
   treats that as invalid traffic and can close the account. To test with
   real ids, add your phone as a test device: AdMob → Settings → Test
   devices.
7. **app-ads.txt (recommended):** AdMob checks for an `app-ads.txt` file at
   the root of the developer website listed on Google Play. Without it, some
   ads may not show.
   - The game's site is a project page,
     `zazochannel-art.github.io/Idle-Car-Empire/`. The file would have to be
     at `zazochannel-art.github.io/app-ads.txt`, which needs a separate
     user-site repository named `zazochannel-art.github.io`.
   - The alternative is a domain of your own.
8. **Play Console declarations:** see [play-store.md](play-store.md):
   - Ads: *Yes*;
   - Advertising ID: used, for advertising;
   - Data safety: the AdMob rows;
   - Target audience: 13+.

   If you add under-13 age groups, the Families policy applies. That needs
   AdMob's child-directed settings and no advertising ID, which the code
   doesn't do today.

## Declarations that changed with ads

- **Privacy policy** (`public/privacy/index.html`): the section "Ads in the
  Android app" covers:
  - what Google collects;
  - consent;
  - how to reset the advertising ID.
- **Manifest:** the SDK adds the `com.google.android.gms.permission.AD_ID`
  permission and its own components. The app id is set by the build
  (`android/app/build.gradle`, `manifestPlaceholders`).
- **3D models:** an app with ads is commercial, so the three non-commercial
  (CC BY-NC-SA) car models were removed (`public/models/CREDITS.txt`).
