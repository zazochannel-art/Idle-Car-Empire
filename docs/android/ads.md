# Rewarded ads (Android app)

The Android app offers **rewarded ads**: the player chooses to watch a short ad
for a bonus. Nothing in the game needs one, and no ad plays without a tap. The
iOS app shows the same offers ([../ios.md](../ios.md)).

## What an ad gives

| Where | Reward | Limits |
| --- | --- | --- |
| Offline report ("Welcome back") | the money earned while away, ×2 | once per report |
| A construction or an upgrade in progress | finished at once | no pause before the next; offered only with at least 90 s left |
| The HUD chip "📺 ×2 profit" (asks first) | ×2 margin on every sale for **30 minutes of play** (the time waits while the game is closed) | when no boost is running (the shop adds to a running one) |
| Daily login reward (money days only, not the Star days) | the day's money ×2, next to the normal "Claim" button | once a day |
| Quality control, during the break between two inspections | the wait skipped (never more than the day's 6 inspections) | as the break; offered only with at least 90 s left |
| The shop (🛒 top left): mystery box | one prize per box: 1 h of income (40%), 1 h of research (30%), 3 h of income (20%) or 1 ⭐ Star (10%); each box opened is a new draw, which waiting can't change | **none** |
| The shop: cash pack | 30 minutes of income | **none** |
| The shop: research pack | 30 minutes of research output (at least 25 RP) | **none** |
| The shop: ×2 profit | +30 minutes of ×2 profit, added to a boost already running | up to 4 hours in all |
| The shop: instant build | the same as the construction button above | as above |

The shop also has a **free crate** every 4 hours and items paid with in-game ⭐
Stars (time warps of 2 h, 8 h and 24 h of income, 8 h of research, +2 h of ×2
profit up to 4 h in all, and a tycoon pack of 8 h of income and research for a
Star less than the two): no ad and no real money for those. Its numbers live in
`src/game/config/shop.ts`, its rules in `src/game/engine/shop.ts` (tested in
`src/game/shop.test.ts`).

## Full-screen ads (no reward)

Besides the rewarded offers, the app shows a **full-screen (interstitial) ad now
and then, with no reward**. It never shows in the middle of something:

- only when the player **closes a screen** and is back on the map (not the
  shop, the build/upgrade sheets or the pass), and ~1.2 s after the close, so a
  tap on "close" can never land on the ad;
- never over the tour, a race, a factory, the offline report, a visit, the
  first-car celebration, or a dialog or card that opened meanwhile (an unlock,
  the daily reward, the company name: the player is about to tap it);
- not in the first hour of a company, and not before its first car is built (a new
  company makes it at about 45 minutes), nor in the first 3 minutes after
  the app opens;
- a break of 3 minutes after **any** ad (a rewarded one counts); after it, every
  eligible close shows one; there is **no limit a day**. Not more often: AdMob
  and Google Play count ads that keep interrupting the game as disruptive, which
  can limit the account's ad serving;
- **never with the ad-free rewards purchase**.

The limits live in `INTERSTITIAL` in `src/lib/ads.ts`; the plugin side is in
`src/lib/native-ads.ts`; the trigger is `InterstitialBridge`
(`src/components/game/interstitial-bridge.tsx`). It uses its own ad unit:
create an **Interstitial** unit in AdMob (Ad units → Add ad unit →
Interstitial) and put its id in the GitHub variable `ADMOB_INTERSTITIAL_ID`
(iOS: `ADMOB_INTERSTITIAL_ID_IOS`). Until it is set the build uses Google's
sample interstitial unit (`ca-app-pub-3940256099942544/1033173712`), which
shows test ads and pays nothing. Same rules as above: the consent comes first
and the content rating is Teen.

## App Open ads

An **App Open** ad can show when the player comes back to the game:

- from another app or the Home screen after **at least 5 minutes** away (a
  quick app switch shows nothing), as the game returns, before the player can
  touch anything;
- **never straight after one of the game's own ads**: Android pauses the game
  under a full-screen ad, and that is no time away (the close of an interstitial
  or a rewarded ad never brings an App Open ad after it);
- **not as the game opens**: the game is on screen at once from its own files,
  and an ad that arrived a few seconds later would land on a screen in use
  (Google: App Open ads go over a loading screen, never over content in use);
- never in a company with under an hour of play or before its first car (so never on the first
  opens or over the tour), never over a race;
- the same 3-minute pause after any ad as above, and no limit a day;
- **never with the ad-free rewards purchase**, and only after the consent.

The code is `maybeShowAppOpen` in `src/lib/ads.ts` (the limits are in
`APP_OPEN`), called from `src/lib/native.ts`. Google lets an App Open ad expire
4 hours after its load. The plugin kept an unshown App Open ad and answered every
later load with it, so an expired one could be shown; `scripts/patch-admob.mjs`
(run by `npm install`) fixes that in the plugin's Android and iOS code: a load
always asks for a new ad, and one past its 4 hours is never shown
(`src/lib/admob-plugin-patch.test.ts` checks the patch is in). It uses its own ad unit: create an
**App open** unit in AdMob and set the GitHub variable `ADMOB_APP_OPEN_ID`
(iOS: `ADMOB_APP_OPEN_ID_IOS`). Until it is set the build uses Google's sample
unit (`ca-app-pub-3940256099942544/9257395921`), which pays nothing.

There is **no limit on the rewarded ads**: the shop's packs and mystery box are
there for every ad, a boost adds up to 4 hours, any job can be finished; only
what has nothing to give is not offered (the offline report and the daily login
are taken once, a job needs time left). The numbers live in
`src/game/config/ads.ts`; the rules in `src/game/engine/ads.ts` (tested in
`src/game/ads.test.ts`).

The reward is given only on the ad network's **reward event** (the ad watched
to the end), once per ad. Closing the ad early gives nothing, and a repeated
event is ignored. The offers show only when an ad is loaded, so a phone that is
offline, or a player who hasn't given consent where it is needed, simply sees
no offer. The two one-time offers (the offline report's ×2 and the daily
login's ×2) say **"Loading the ad…"** (not tappable) while the app is still
getting their ad as the game opens, instead of being missing until it arrives.

An instant build or a quality-control skip is offered only with at least
90 seconds left (`ADS.minOfferSeconds`): an ad can last a minute, and one that
ended with nothing left to skip would have been watched for nothing. The game
stops while an ad covers it (a construction doesn't advance), but the
quality-control break runs on the clock: one that ended during the ad still
counts as the reward (the next inspection is ready).

## Which ads are requested, and the ad log

An ad is requested only when the game could show it (`src/lib/ads.ts` `adNeeds`); a request that can't
become an impression only lowers the show rate AdMob reports (impressions ÷ matched requests):

- **Rewarded**: kept loaded for every company without ad-free rewards; requested as soon as the
  consent allows, before the save is loaded, unless the company last played on the phone had
  ad-free rewards (`ice.adFree`, kept by `src/lib/native.ts`).
- **Full-screen (interstitial, App Open)**: only once the company has built its first car and played
  55 minutes (5 minutes before they may show at the hour).
- **Ad-free rewards** bought: nothing is requested at all.
- **In the background**: nothing is requested; coming back loads what is missing. After a failed request
  (no fill, no network) the next try waits longer each time, and no other check goes round that wait,
  except one: a request that failed for want of the network (code 2) is tried again as soon as the phone
  is online or the game is back on screen.

Every step of every ad is written to logcat under one tag, in every build (the native `AdLog` plugin):
in Android Studio, Logcat, filter `tag:IDLE_CAR_ADMOB`. A line looks like

```
AD_FAILED_TO_LOAD format=interstitial unit=…8255 code=3 message="No fill." t=2026-11-19T08:00:00.000Z
```

Events:

- each ad: `AD_REQUEST_STARTED`, `AD_LOADED`, `AD_FAILED_TO_LOAD` (the SDK's code: 3 no fill, 2 network,
  0 internal, 1 invalid request or a unit of the wrong format, 8 app id missing), `AD_REQUEST_SKIPPED`
  (in the background), `AD_SHOW_REQUESTED`, `AD_SHOWED` (the ad on screen: this is the impression),
  `AD_PAID_EVENT` (the SDK's paid event with its value; it can be missing while the AdMob account's
  *impression-level ad revenue* setting is off, so never read its absence as "no impression"),
  `AD_CLICKED` (rewarded ads), `AD_REWARDED`, `AD_FAILED_TO_SHOW` (with the SDK's code), `AD_DISMISSED`,
  `AD_EXPIRED` (a loaded ad dropped before Google's limit, to load a fresh one);
- the one-time offers: `AD_OFFER_VISIBLE` (the offline report's or the daily login's ×2 on screen, its
  ad ready) and `AD_OFFER_LOADING` (on screen, still getting its ad). A report with
  `AD_OFFER_LOADING` and no `AD_OFFER_VISIBLE` was collected before its ad arrived;
- what decides whether any ad is requested on the phone: `CONSENT_INFO` and `CONSENT_FORM` (format
  `consent`: the status, `canRequestAds`, the privacy options), `CONSENT_ERROR`, `SDK_INIT_OK`,
  `SDK_INIT_FAILED` (format `sdk`). With `canRequestAds=false` no ad is ever requested.

`place` says where: the reward offered (`offline`, `login`, `build`, `boost`, `qc`, `shop:…`),
`map-break` for a full-screen ad, `resume` for App Open. Only a unit's last 4 digits are written.

Collect them from a phone (the Play build: the test APK always uses Google's test units):

```
adb logcat -c
adb logcat -v time IDLE_CAR_ADMOB:I Ads:V UserMessagingPlatform:V Capacitor/AdMob:V *:S | tee admob.log
grep -oE "AD_[A-Z_]+ format=[a-zA-Z]+" admob.log | sort | uniq -c
```

Playing the store build on your own phone makes real requests: add the phone under AdMob → Settings →
Test devices (its id is in logcat, tag `Ads`, "Use RequestConfiguration.Builder().setTestDeviceIds").

## How it is built

- **Plugin:** [`@capacitor-community/admob`](https://github.com/capacitor-community/admob)
  8.2.1, pinned exactly, with the App Open fix of `scripts/patch-admob.mjs`
  (`postinstall`; it stops `npm install` if a new plugin version changed that
  code, so the fix is looked at again). It brings the Google Mobile Ads SDK
  (pinned to 25.4.0 in `android/variables.gradle`) and Google's User Messaging
  Platform (4.0.0).
- **Loaded only in the app:** `src/lib/native-ads.ts` is imported from
  `src/lib/native.ts`, which only the Android app loads. The screens use
  `src/lib/ads.ts`, which never loads the plugin, so in a development browser no ad is ever
  ready and no offer shows.
- **Consent first:** at start the app asks Google's UMP whether consent is
  needed (the EEA, the UK, Switzerland). If it is, Google's consent form shows
  before any ad is requested. Where the law asks for it, Settings shows
  **Ad privacy choices** to change it later.
- **Withdrawn consent:** if the player turns the consent off in **Ad privacy choices**, every
  loaded ad is dropped and none is requested or shown until it is given again (then they load again).
- **Fresh ads only:** Google lets rewarded and full-screen ads expire after 1 hour and App Open
  ads after 4, so an ad is loaded again after 55 minutes (App Open: 3 h 45 min) and one that
  is already too old is never shown.
- **No stuck screen:** if an ad doesn't appear within 20 seconds, or one is still "on screen"
  after 15 minutes, the game stops waiting for its close event and the offers come back. An SDK
  or consent start that fails is retried (with growing pauses, and at once when the phone is
  back online), not given up for the session. When the SDK reports a rewarded ad as failed to
  show before it appears (a slow phone, which then often shows it anyway), the game waits 4
  seconds for it before telling the player it couldn't be shown.
- **Rating:** ads are limited to *Teen* content (the game is for 13 and over).
- **Test ads until you set your ids:** without real ids, the build uses
  Google's public sample ids, which serve test ads that pay nothing:
  - app id `ca-app-pub-3940256099942544~3347511713`;
  - rewarded unit `ca-app-pub-3940256099942544/5224354917`.

  The build log says so ("No AdMob app id … test ads only").
- **The emulator check** (`scripts/android-device-check.mjs`, in CI) loads a
  test ad and watches it to the end, then checks that the ×2 profit started.
  Then, with a company past its first hour (`e2e/fixtures/save-3h.json`), it
  checks an interstitial at a map break and an App Open ad on coming back, each
  shown in its own screen and closed back to the game. For that, a test build
  (app id ending in `.debug`) takes quicker limits from `localStorage`
  (`ice.adTestTiming`, `quickenAdsForTest` in `src/lib/ads.ts`); a build for
  players never reads them.

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
   - Add `ADMOB_APP_ID` (the app id), `ADMOB_REWARDED_ID`,
     `ADMOB_INTERSTITIAL_ID` and `ADMOB_APP_OPEN_ID` (the ad unit ids).
   - *Publish to Google Play* refuses to build while any of the four is
     unset, malformed, Google's sample id, or from another AdMob account than
     the app id (`scripts/check-admob-ids.mjs`), and checks that the built game
     carries the three units: without its ids a build would quietly show test
     ads, which pay nothing.
   - Mind which is which: the **app id has a `~`** (`ca-app-pub-…~…`, in
     AdMob → Apps → App settings), an **ad unit id has a `/`**. An ad unit id
     in `ADMOB_APP_ID` would make the app close as it starts, so the build
     refuses it: it uses Google's sample app id instead and says so in the
     log, and *Publish to Google Play* stops until the app id is right.
   - They are not secrets: every copy of the app contains them. They are
     yours, though, so they live in your settings and not in the code.
   - For a build on your computer, set the same two in the environment:
     `ADMOB_APP_ID=… NEXT_PUBLIC_ADMOB_REWARDED_ID=… npm run build:android`,
     then build in Android Studio.
6. **Test safely:** never tap ads in your own app with the real ids. AdMob
   treats that as invalid traffic and can close the account. To test with
   real ids, add your phone as a test device: AdMob → Settings → Test
   devices.
7. **app-ads.txt:** AdMob checks for an `app-ads.txt` file at the root of the
   developer website listed on Google Play. Without it, some ads may not show.
   - The game's site is a project page,
     `zazochannel-art.github.io/Idle-Car-Empire/`, so the file lives at the
     domain's root, `zazochannel-art.github.io/app-ads.txt`, published from the
     separate user-site repository `zazochannel-art.github.io` (in place, with
     the account's publisher id `pub-3250474828606129`). `site/app-ads.txt` in
     this repository is the same line, for reference.
   - AdMob → Apps → *app-ads.txt* shows whether it was found and verified.
8. **Play Console declarations:** see [play-store.md](play-store.md):
   - Ads: *Yes*;
   - Advertising ID: used, for advertising;
   - Data safety: the AdMob rows;
   - Target audience: 13+.

   If you add under-13 age groups, the Families policy applies. That needs
   AdMob's child-directed settings and no advertising ID, which the code
   doesn't do today.

## Declarations that changed with ads

- **Privacy policy** (`site/privacy/index.html`): the section "Ads in the
  app" covers:
  - what Google collects;
  - consent;
  - how to reset the advertising ID.
- **Manifest:** the SDK adds the `com.google.android.gms.permission.AD_ID`
  permission and its own components. The app id is set by the build
  (`android/app/build.gradle`, `manifestPlaceholders`).
- **3D models:** an app with ads is commercial, so the three non-commercial
  (CC BY-NC-SA) car models were removed (`public/models/CREDITS.txt`).
