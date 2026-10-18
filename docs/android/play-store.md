# Google Play: listing, forms and publication

Everything Play Console asks for, prepared from what the game actually
does. Items marked **(you)** depend on your developer account, your choices or
manual approval. They can't be done from the repository.

## Before the first upload: open items

1. **Supabase migrations: done.** `0005_ghosts_and_alliances.sql` and
   `0007_delete_account.sql` are applied on the live project (18 October
   2026); the `cloud-e2e` workflow checks them, and passed.
2. **Contact email: done.** `idlecarempire@gmail.com`, in
   `site/privacy/index.html` and `site/delete-account/index.html`. Show the
   same address on the store listing.
3. **3D car model licences: done.** The app shows ads, so it is commercial:
   the three non-commercial (CC BY-NC-SA) models (Porsche 911, Citroën
   Survolt, DeLorean) are gone. Their platforms use bodies
   from the CC BY car pack (`public/models/CREDITS.txt`).
   - **(you) one model left to decide on:** the MC GT is a Nissan R34 from
     the "Fast & Furious" films (CC BY 4.0, so commercial use is allowed by
     its licence). The badges are hidden, but the shape is recognisable, and
     Google Play's [intellectual property policy](https://support.google.com/googleplay/android-developer/answer/9888072)
     lets the owners file complaints. Replacing it with an original or
     unbranded CC BY / CC0 model is the safest path for the store.
4. **(you) Upload key.** Create it and give it to the build ([signing.md](signing.md)).
5. **(you) Supabase plan.** The free plan pauses a project after a week
   without activity. Paused, the cloud save and the leaderboards stop, and
   the game falls back to saving on the device; new players can't create an
   account, so they can't start playing until it is restored.
   - Supabase Pro (paid) avoids the pause.
   - Free alternatives: keep the project active (any visit or the CI checks
     count) and restore it from the dashboard if it pauses.
6. **Registrations work for every email address: done.** Playing needs an
   account, so creating one must work for anyone: **Confirm email** is off in
   Supabase (18 October 2026). The `cloud-e2e` workflow registers a test
   player with an email and a password and signs in with them, so it fails if
   that changes. (To turn confirmation back on, set up custom SMTP first:
   [cloud-save.md](../cloud-save.md), "Supabase setup", step 2.)
7. **(you) A test account for the reviewers** (see *App access* below).
8. **(you) Auth redirect URLs.** Email confirmations from the app link to
   `https://zazochannel-art.github.io/Idle-Car-Empire/`. It must be listed
   under Supabase → Authentication → URL Configuration → Redirect URLs, and
   should be the **Site URL** there too (that page now says the address is
   confirmed and to go back to the app).

## Store listing

**App name** (30 characters max): `Idle Car Empire`

**Short description** (80 max):
> Build car factories, run the supply chain and grow your own car empire.

**Full description** (4000 max):

> Start with one small workshop and build a car empire of your own.
>
> Idle Car Empire is a tycoon game about making cars from the ground up. Build
> body works, engine factories, tire, glass, interior and battery plants, and
> an assembly line that turns their parts into finished cars. Trucks carry
> every part across a living 3D city. Sell the cars through your dealers and
> watch the money roll in, even while you're away.
>
> BUILD THE WHOLE SUPPLY CHAIN
> • Over a dozen kinds of factories, each one feeding the next
> • Buy land, construct buildings and upgrade every plant through 15 levels
> • Step inside your factories: machines, workers and assembly lines at work
> • Logistics: trucks and transport upgrades keep the parts flowing
>
> DESIGN AND SELL YOUR CARS
> • Unlock car models from city cars to supercars, hypercars and electric cars
> • Paint and tune them in the garage
> • Dealers with real demand, market events and client contracts
>
> GROW YOUR EMPIRE
> • Research new technology, up to electric and self-driving cars
> • Hire managers to run your plants
> • Missions, milestones, achievements and a free season pass
> • Race your cars on the circuit and against other players' ghost cars
> • Reset your empire for Stars and permanent bonuses
>
> PLAY YOUR WAY
> • Your factories keep producing while you're offline
> • Plays offline once your account is created
> • Your account keeps your empire in the cloud: continue on another phone
> • Leaderboards, alliances and daily gifts with other players
> • Battery saver and low-graphics mode for older phones
> • English, Română, Русский
>
> Optional rewarded ads: watch one only when you want a bonus. No in-app purchases.

Check that the description still matches the build you upload: if a feature
is removed (for example a car model), update the text.

**Category**: Game → Simulation. **Tags** (pick up to 5 in Play Console):
Tycoon, Idle, Business, Management, Simulation.

**Contact details**: email `idlecarempire@gmail.com` (required, public), website
`https://zazochannel-art.github.io/Idle-Car-Empire/` (optional).

**Privacy policy URL**:
`https://zazochannel-art.github.io/Idle-Car-Empire/privacy/`. It is live once
this branch is merged and Pages has deployed. It is also linked in the game:
Settings → Privacy policy.

### Graphics (in `docs/android/store/`)

| Asset | Required | File |
| --- | --- | --- |
| App icon, 512×512 PNG, 32-bit, ≤1 MB | yes | `docs/android/store/icon-512.png` |
| Feature graphic, 1024×500 PNG/JPEG, no transparency | yes | `docs/android/store/feature-graphic.png` |
| Phone screenshots, 2–8, 16:9 or 9:16, 320–3840 px per side | yes (min 2; 4+ at 1080 px or more recommended for games) | `docs/android/store/phone-1…6-*.jpg` (1080×1920) |
| 7" and 10" tablet screenshots | optional (recommended if you list for tablets) | not made |
| Promo video (YouTube link) | optional | not made |

The screenshots come from the real game (a late-game save, the 3D map
rendered in software), captured at 1080×1920.

### Release notes (1.0.0)

> First release of Idle Car Empire for Android: build factories, run the car
> supply chain, race, and grow your empire, online or offline.

## App content (Policy → App content)

**Privacy policy**: the URL above.

**Ads**: *Yes, my app contains ads* (rewarded ads, Google AdMob: see
[ads.md](ads.md)).

**Advertising ID** (App content → Advertising ID): *Yes*, the app uses it
(the Google Mobile Ads SDK adds the `AD_ID` permission), for **Advertising or
marketing**.

**App access**: *All or some functionality in my app is restricted*: the game
needs an account. Add instructions for the reviewers:
- **(you)** create an account for them in the app (any name, an email address
  you own, a password), and enter that email and password in Play Console →
  App access. Never put the password in this repository.
- Instructions: "Open the app and tap *Sign in* on the welcome page, then
  enter the email and password above." 

**Content rating** (IARC questionnaire), as the game is today:
- Category: Game.
- Violence, fear, sexuality, language, controlled substances, crude humour: **none**.
- Gambling or simulated gambling: **none** (no casino games, no paid random items).
- **Users can interact / share content: yes.** Other players see player names,
  company names and alliance names chosen by players, on leaderboards, visits
  and alliances. There is no chat.
- Shares the user's location: no.
- Digital purchases: no.

The likely outcome is *Everyone / PEGI 3* with a "Users Interact" notice. The
rating authority decides.

**Target audience (you)**: the game is not designed for children.
- Recommended: **13 and over**.
- If you include under-13 age groups, the
  [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335)
  applies (stricter rules for accounts, data and any future ads).

**Data safety** form. Answers that match the code and the privacy policy:

- Does the app collect or share user data? **Yes, collects and shares.**
  Supabase processes the game's data on your behalf, which is not "sharing";
  the Google Mobile Ads SDK collects data and **shares** it with Google for
  advertising (rows marked *AdMob* below). Check Google's current
  [data disclosure for the SDK](https://developers.google.com/admob/android/privacy/play-data-disclosure)
  before submitting: it is the reference for these rows.
- Is all data encrypted in transit? **Yes** (HTTPS).
- Can users request deletion? **Yes**. In the app (Profile → Delete account)
  and at `https://zazochannel-art.github.io/Idle-Car-Empire/delete-account/`.

| Data type | Collected | Optional? | Purpose |
| --- | --- | --- | --- |
| Personal info → **Email address** | yes | required (an account is needed to play) | Account management |
| Personal info → **Name** (player nickname) | yes | required (chosen when registering, can be changed) | App functionality |
| Personal info → **User IDs** (account id) | yes | required | App functionality, Account management |
| App activity → **Other actions** (game progress / save) | yes | required when online | App functionality |
| App activity → **Other user-generated content** (company and alliance names) | yes | optional | App functionality |
| App activity → **App interactions** (anonymous beginner steps) | yes | optional (Settings → Anonymous statistics) | Analytics |
| *AdMob:* Device or other IDs → **Device or other IDs** (advertising ID) | yes, **shared** | required (the SDK collects it when an ad is requested) | Advertising or marketing, Analytics, Fraud prevention, security, and compliance |
| *AdMob:* Location → **Approximate location** (from the IP address) | yes, **shared** | required | Advertising or marketing, Analytics, Fraud prevention, security, and compliance |
| *AdMob:* App activity → **App interactions** (with the ads) | yes, **shared** | required | Advertising or marketing, Analytics |
| *AdMob:* App info and performance → **Crash logs**, **Diagnostics** | yes, **shared** | required | Analytics, Fraud prevention, security, and compliance |

Not collected: precise location, contacts, photos/files, messages, financial
info, health, web history, audio, calendar. The "Android" device label stored
with saves is a type, not an identifier.

**Other declarations**:
- News app: no.
- COVID-19 apps: no.
- Government app: no.
- Financial features: none.
- Health: no.
- Data used for ads: yes, by the Google Mobile Ads SDK only (above). The
  game's own data (saves, accounts, profiles) is never used for ads.

## Publishing, step by step

1. **(you) Developer account**:
   [play.google.com/console/signup](https://play.google.com/console/signup).
   - A one-time US$25 fee, identity verification, and a choice between a
     *personal* and an *organization* account.
   - The fee is Google Play's only cost. Without it, the alternatives are to
     share the APK yourself or publish on other stores. Both are free, but
     players see "unknown app" warnings and get no automatic updates.
2. **(you) Create the app**: All apps → Create app → name *Idle Car Empire*,
   default language, **Game**, **Free**, accept the declarations.
3. **Store listing**: paste the texts above and upload the graphics from
   `docs/android/store/`.
4. **App content**: the forms above (privacy policy, ads, app access, content
   rating, target audience, data safety, the other declarations).
5. **Signed bundle**: run *Actions → Android* on `main` (with the key in the
   secrets) and download `idle-car-empire-release-aab`, or build it locally
   ([signing.md](signing.md)). Check the log line `release bundle: SIGNED`.
6. **Testing track.** Testing → Internal testing → Create release, upload
   `app-release.aab`, accept Play App Signing, add release notes, save,
   review, roll out. Internal testing (up to 100 testers by email) takes
   minutes and is the quickest way to try the store build.
7. **(you) Closed testing, if your account needs it.** For **personal
   accounts created after 13 November 2023**, Google requires a closed test
   with **at least 12 testers opted in for 14 days in a row** before
   Production can be requested
   ([Play Console Help](https://support.google.com/googleplay/android-developer/answer/14151465)).
   - Testing → Closed testing → create a track, upload the bundle, and add a
     list of testers' Google accounts (or a Google Group).
   - Send them the opt-in link. They install from Play and play during the
     14 days.
   - If testers opt out before 14 days, they don't count. Google may ask for
     more testing if engagement is low.
   - Organization accounts don't have this requirement.
8. **(you) Apply for production**: Dashboard → *Apply for production* (after
   the closed test). Answer the questions about the test; approval usually
   takes a few days.
9. **Pre-launch report and warnings**: Play tests the bundle on real devices
   (Testing → Pre-launch report). Fix crashes and errors. Warnings such as
   accessibility contrast are advice, not blockers.
10. **(you) Production release**: Production → Create release → the same (or
    a newer) bundle, the countries, release notes → *Send for review*. Google
    reviews it, often within a few days, sometimes longer for new accounts.
11. **(you) Publish**: when approved, the release goes live (or wait for
    *Managed publishing* if you turned it on). The app is published only when
    Play Console shows it as *Available on Google Play*.

## Updates

1. Raise `versionCode`/`versionName` in `android/version.properties`.
2. Build a signed bundle and upload it to the track you want.
3. Write the release notes and roll it out.

Google Play requires each new upload to target the API level current at the
time. It is Android 16 (API 36) for new apps and updates since 31 August 2026,
and rises about every August. Capacitor's next major versions bring the next
target.
