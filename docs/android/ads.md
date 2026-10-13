# Rewarded ads: not in the first release

The first Android release has **no ads**. Adding them later is possible, but
it needs things that can't be done from this repository alone, and it changes
the app's licences and declarations. So it is left out of 1.0.

## What blocks it today

1. **Car model licences.** Three 3D car models are CC BY-NC-SA 4.0
   (non-commercial): `public/models/CREDITS.txt`. An app with ads is
   commercial, so those models must be replaced first (see
   [play-store.md](play-store.md), open item 3).
2. **An AdMob account (you).** Create the app in AdMob and its rewarded
   ad unit. Real ad unit ids are never invented in code; they come from
   your account.
3. **Consent.** In the EEA, the UK and Switzerland, Google requires a
   certified consent tool before personalised ads; AdMob's User Messaging
   Platform (UMP) is the usual one, set up in the AdMob console.

## How it would be built

- Plugin: [`@capacitor-community/admob`](https://github.com/capacitor-community/admob),
  maintained and compatible with Capacitor 8. Android only, loaded through
  `src/lib/native.ts`: the web version stays without ads.
- During development, use Google's **test** rewarded unit for Android,
  `ca-app-pub-3940256099942544/5224354917`, and the test app id. Never click
  your own real ads.
- Reward only on the SDK's reward callback
  (`RewardAdPluginEvents.Rewarded`), never on "ad shown" or "closed".
  - Grant it once per ad: track the ad's id in the save, and ignore repeats.
  - For server-trusted rewards, AdMob's server-side verification (SSV) can
    call a Supabase function.
- Ads stay optional: a "watch an ad for a ×2 boost" button that doesn't show
  when no ad is loaded, offline, or before consent. Nothing in the game
  requires watching one.
- Consent first: show the UMP form at start where it is required, and request
  ads only once consent allows it (non-personalised otherwise).

## Declarations that change with ads

- **Play Console → App content → Ads**: *Yes, my app contains ads*.
- **Data safety**: add the data the Google Mobile Ads SDK collects (device or
  other IDs → advertising ID, approximate location from IP, app interactions,
  diagnostics), used for advertising, and shared with Google. Check the SDK's
  current [data disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure).
- **Manifest**: the SDK adds `com.google.android.gms.permission.AD_ID`. Apps
  targeting children must not use it.
- **Privacy policy**: add an advertising section (AdMob, the consent choice,
  how to opt out).
- **Target audience**: if children are among your audience, only Families
  self-certified ad SDKs and settings are allowed.
