# Google Play: listing, forms and publication

Everything Play Console asks for, prepared from what the game actually does,
and the order to do it in. Items marked **(you)** depend on your accounts,
your choices or manual approval: they can't be done from the repository.

## Where things stand

### Ready in the repository

| | |
| --- | --- |
| App | Android 16 target (API 36), min Android 7.0; edge to edge; Back button (also with predictive back); large screens rotate; any native library checked for 16 KB memory pages in CI |
| Release bundle | `app-release.aab`, signed when the upload key is in the repository's secrets (CI on `main`), checked with bundletool and Google Play's own rules (target SDK, not debuggable, 16 KB pages) |
| Store listing | English, Romanian and Russian texts, release notes, icon, feature graphic, phone and tablet screenshots: `fastlane/metadata/android/` (below) |
| Legal pages | [privacy policy](https://zazochannel-art.github.io/Idle-Car-Empire/privacy/), [terms of use](https://zazochannel-art.github.io/Idle-Car-Empire/terms/), [account deletion](https://zazochannel-art.github.io/Idle-Car-Empire/delete-account/) (en/ro/ru), also linked in the game (Settings, the account form) |
| Players' content (Google Play's [UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937)) | terms accepted when creating an account, a name filter in the game and on the server, in-app reports of players and alliances, hiding players; [moderation.md](../moderation.md) |
| Accounts | registration works for every address (no confirmation email needed); in-app account deletion; *Forgot password?* (by email once SMTP is set, else the contact address) |
| Ads | rewarded ads only, Google AdMob with Google's consent form (UMP); test ads until you set your AdMob ids ([ads.md](ads.md)) |
| Ratings | the store's own rating card after collecting the offline earnings, for engaged players, at most every 45 days (`src/lib/review.ts`) |
| Servers | Supabase migrations 0001–0008 applied; `keep-alive.yml` calls the API every two days so the free project never pauses, and its run turns red (GitHub emails you) if the project is down |
| Publishing | `play-publish.yml` (Actions → *Publish to Google Play*) uploads a signed bundle, the release notes and, if asked, the listing (once you add a service account) |

### To do, in this order (you)

1. **Upload key** ([signing.md](signing.md)): create it, back it up, add the
   four `ANDROID_KEYSTORE_*` secrets. The next run of *Actions → Android* on
   `main` then builds a signed bundle (its log says `release bundle: SIGNED`).
2. **Google Play developer account**:
   [play.google.com/console/signup](https://play.google.com/console/signup).
   A one-time US$25 fee and identity verification; *personal* or
   *organization*. (Without it the alternatives are sharing the APK or other
   stores: free, but with "unknown app" warnings and no automatic updates.)
3. **Create the app** in Play Console: All apps → Create app → name
   *Idle Car Empire*, default language English (United States), **Game**,
   **Free**, accept the declarations.
4. **Store listing**: paste the texts and upload the graphics (below), for
   English, then *Manage translations* → add Romanian and Russian.
5. **App content**: the forms below (privacy policy, ads, app access, content
   rating, target audience, data safety, the other declarations).
6. **A reviewer account** (*App access*, below): create one in the game and
   enter its email and password in Play Console. Not in this repository.
7. **AdMob** ([ads.md](ads.md)): create the account and the app (link it to
   the Play listing once it exists), set the `ADMOB_APP_ID` and
   `ADMOB_REWARDED_ID` repository variables. Until then the game shows test
   ads, which pay nothing (the Android build warns about it).
8. **First upload by hand**: download `idle-car-empire-release-aab` from the
   latest *Actions → Android* run on `main` (signed), then Testing → Internal
   testing → Create release → upload `app-release.aab` → accept **Play App
   Signing** → release notes (from `fastlane/metadata/android/*/changelogs/1.txt`)
   → Save → Review → Roll out. Install it from the testers' link on your phone.
9. **Closed test, if your account needs it**: **personal accounts created
   after 13 November 2023** need a closed test with **at least 12 testers
   opted in for 14 days in a row** before they can apply for production
   ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)).
   - Testing → Closed testing → create a track, upload the bundle (or promote
     the internal release), add testers' Google accounts (or a Google Group),
     send them the opt-in link; they install from Play and play during the
     14 days. Testers who leave early don't count; little activity can make
     Google ask for more testing.
   - Organization accounts don't have this requirement.
10. **Apply for production** (Dashboard → *Apply for production*), answering
    the questions about the test. Approval usually takes a few days.
11. **Production release**: Production → Create release → the same (or a
    newer) bundle, the countries, release notes → *Send for review*. The app
    is published only when Play Console shows it as *Available on Google Play*.

Optional, any time:
- **Password reset emails** ([cloud-save.md](../cloud-save.md), "Supabase
  dashboard", step 5): custom SMTP (the game's Gmail works), then the
  `PASSWORD_RESET` variable.
- **Uploads from GitHub** (below): a service account, then every release is
  *Actions → Publish to Google Play → Run workflow*.
- **Supabase plan**: the free plan pauses a project after a week without
  activity; `keep-alive.yml` keeps it active, and a red run means it needs
  restoring from the dashboard. Supabase Pro (paid) has no pause.
- **app-ads.txt** for AdMob ([ads.md](ads.md), step 7).

## Store listing

The texts, release notes and graphics live in `fastlane/metadata/android/`,
one folder per language (`en-US`, `ro`, `ru-RU`): paste them in Play Console,
or let `play-publish.yml` upload them (*listing* checked). `src/store-listing.test.ts`
keeps them within Google Play's limits, with release notes for the current
`versionCode`, and checks that the counts they promise (14 factory kinds,
10 car models) are still the game's.

| Play Console field | File |
| --- | --- |
| App name (30 max) | `<lang>/title.txt` |
| Short description (80 max) | `<lang>/short_description.txt` |
| Full description (4000 max) | `<lang>/full_description.txt` |
| Release notes (500 max) | `<lang>/changelogs/<versionCode>.txt` |
| App icon, 512×512 PNG | `en-US/images/icon.png` (drawn from the logo by `npm run app:assets`) |
| Feature graphic, 1024×500 | `en-US/images/featureGraphic.png` |
| Phone screenshots, 1080×1920 | `<lang>/images/phoneScreenshots/` (8 per language, the game in that language) |
| 7" tablet screenshots, 1920×1080 | `en-US/images/sevenInchScreenshots/` |
| 10" tablet screenshots, 2560×1440 | `en-US/images/tenInchScreenshots/` |

The screenshots are the real game (a late-game company, a June noon so no
season shows) rendered in a browser; the leaderboard's other players are
made up for the picture. Play shows a language's own screenshots, and the
English ones where a language has none (tablets).

**Category**: Game → Simulation. **Tags** (up to 5): Tycoon, Idle, Business,
Management, Simulation.

**Contact details**: email `idlecarempire@gmail.com` (required, public), website
`https://zazochannel-art.github.io/Idle-Car-Empire/`.

**Privacy policy URL**: `https://zazochannel-art.github.io/Idle-Car-Empire/privacy/`.

## App content (Policy → App content)

**Privacy policy**: the URL above.

**Ads**: *Yes, my app contains ads* (rewarded ads, Google AdMob).

**Advertising ID**: *Yes* (the Google Mobile Ads SDK adds the `AD_ID`
permission), for **Advertising or marketing**.

**App access**: *All or some functionality in my app is restricted*: the game
needs an account.
- **(you)** create an account for the reviewers in the game (any name, an
  email address you own, a password) and enter that email and password in
  Play Console → App access. Never put the password in this repository.
- Instructions: "Open the app, tap *Sign in* on the welcome page, enter the
  email and password above. (Anyone can also create an account: *Create
  account* needs a name, an email and a password, no confirmation email.)"
- The same credentials let the **pre-launch report**'s test robot sign in
  (Testing → Pre-launch report → Settings → *Sign-in credentials*, or it
  uses App access).

**Content rating** (IARC questionnaire), as the game is today:
- Category: Game.
- Violence, fear, sexuality, language, controlled substances, crude humour: **none**.
- Gambling or simulated gambling: **none** (no casino games, no paid random items: the shop's mystery box is opened for a rewarded ad, never bought).
- **Users can interact / share content: yes.** Other players see player names,
  company names and alliance names chosen by players (leaderboards, visits,
  alliances). No chat. Players can report and hide others; names are filtered.
- Shares the user's location: no.
- Digital purchases: no.

The likely outcome is *Everyone / PEGI 3* with a "Users Interact" notice. The
rating authority decides.

**Target audience (you)**: the game is not designed for children.
- Recommended: **13 and over** (the privacy policy and terms say so).
- Including under-13 age groups brings the
  [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335)
  (stricter rules for accounts, data and ads).

**Data safety** form. Answers that match the code and the privacy policy:

- Does the app collect or share user data? **Yes, collects and shares.**
  Supabase processes the game's data on your behalf, which is not "sharing";
  the Google Mobile Ads SDK collects data and **shares** it with Google for
  advertising (rows marked *AdMob*). Check Google's current
  [data disclosure for the SDK](https://developers.google.com/admob/android/privacy/play-data-disclosure)
  before submitting.
- Is all data encrypted in transit? **Yes** (HTTPS).
- Can users request deletion? **Yes**: in the app (Profile → Delete account)
  and at `https://zazochannel-art.github.io/Idle-Car-Empire/delete-account/`.

| Data type | Collected | Optional? | Purpose |
| --- | --- | --- | --- |
| Personal info → **Email address** | yes | required (an account is needed to play) | Account management |
| Personal info → **Name** (player name) | yes | required (chosen when registering, can be changed) | App functionality |
| Personal info → **User IDs** (account id) | yes | required | App functionality, Account management |
| App activity → **Other actions** (game progress / save) | yes | required when online | App functionality |
| App activity → **Other user-generated content** (company and alliance names; reports sent about other players) | yes | optional | App functionality; Fraud prevention, security, and compliance |
| App activity → **App interactions** (anonymous beginner steps) | yes | optional (Settings → Anonymous statistics) | Analytics |
| *AdMob:* Device or other IDs → **Device or other IDs** (advertising ID) | yes, **shared** | required (the SDK collects it when an ad is requested) | Advertising or marketing, Analytics, Fraud prevention, security, and compliance |
| *AdMob:* Location → **Approximate location** (from the IP address) | yes, **shared** | required | Advertising or marketing, Analytics, Fraud prevention, security, and compliance |
| *AdMob:* App activity → **App interactions** (with the ads) | yes, **shared** | required | Advertising or marketing, Analytics |
| *AdMob:* App info and performance → **Crash logs**, **Diagnostics** | yes, **shared** | required | Analytics, Fraud prevention, security, and compliance |

Not collected: precise location, contacts, photos/files, messages, financial
info, health, web history, audio, calendar. The "Android" device label stored
with saves is a type, not an identifier.

**Other declarations**: news app no; COVID-19 no; government no; financial
features none; health no. Data used for ads: yes, by the Google Mobile Ads SDK
only. The game's own data (saves, accounts, profiles, reports) is never used
for ads.

## Uploading from GitHub (optional)

`play-publish.yml` builds the signed bundle and uploads it, with the release
notes, to the track you choose (as a *draft* by default, to roll out from Play
Console). It needs the upload key secrets and one more secret, a Google Cloud
**service account** key that Play Console trusts:

1. Google Cloud Console → create a project (or pick one) → *APIs & Services*
   → enable **Google Play Android Developer API**.
2. *IAM & Admin → Service accounts* → Create → no roles needed → *Keys* → Add
   key → JSON. Keep the file private.
3. Play Console → *Users and permissions* → Invite new users → the service
   account's email → app permissions for *Idle Car Empire*: **Release apps to
   testing tracks** (and **Release to production** if you want that too),
   **Manage store presence** (for the listing).
4. GitHub → the repository → Settings → Secrets and variables → Actions → New
   secret `PLAY_SERVICE_ACCOUNT_JSON`, the JSON file's whole content.
5. Actions → *Publish to Google Play* → Run workflow → track, status, listing.

Google's API only adds to an app that already has a bundle: the first upload
(step 8 above) is by hand. Every upload needs a higher `versionCode`.

## Releasing an update

1. Raise `versionCode` (by 1) and `versionName` in `android/version.properties`.
2. Write the release notes: `fastlane/metadata/android/<lang>/changelogs/<versionCode>.txt`
   for the three languages (the tests ask for them).
3. Merge to `main`; then either run *Publish to Google Play*, or download the
   signed `app-release.aab` from the Android run and upload it in Play Console.
4. Roll it out (internal testing first is quickest to try).

Google Play requires each new upload to target the API level current at the
time: Android 16 (API 36) for new apps and updates since 31 August 2026, rising
about every August. Capacitor's next major versions bring the next target.

## After the launch

- **Reports** about players and alliances: [moderation.md](../moderation.md).
- **Android vitals** (Play Console → Quality): crashes and ANRs; the pre-launch
  report of every release.
- **Ratings and reviews** (Play Console → Ratings and reviews): you can answer
  them; the rating card in the game asks engaged players.
- **The keep-alive run**: if *Supabase keep-alive* turns red, restore the
  project in the Supabase dashboard.
