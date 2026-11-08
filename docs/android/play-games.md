# Google Play Games (achievements and a leaderboard)

The Android app can send the player's achievements and a "cars built" leaderboard to Google Play
Games Services. The code is in the app already (`PlayGamesPlugin.java`, `src/lib/play-games.ts`,
`src/lib/native-play-games.ts`); it does nothing until **both** of these are done, so a build
without the setup behaves exactly as before:

1. the build has its Play Games project id (repository variable `PLAY_GAMES_APP_ID`), and
2. the Play Games ids are written in `src/game/config/play-games.ts`.

A player signs in with Google Play Games on the phone (Play Games signs them in by itself when
the game starts; the achievements screen has a "Sign in" button when it did not). Nothing about the
game account or the cloud save changes.

## Setup (Play Console)

1. Play Console → the game → **Grow users → Play Games Services → Setup and management →
   Configuration** → "Add Play Games Services to your game" (no existing Google API project:
   let Play Console create one).
2. **Credentials**: add an **Android** credential for the package `com.zazochannel.idlecarempire`
   twice, with the SHA-1 of (a) the **app signing key** (Play Console → Test and release → App
   integrity) and (b) the **upload key** (SHA-1 `75:54:91:…:E0:46`, for builds installed from a
   file). Add the testers' Google accounts under **Testers** until the game services are published.
3. **Achievements**: create one per row of the table below. Each needs a name, description,
   a 512×512 icon and the points below (Play Games allows at most 1000 points in all; the table
   uses 850). Copy each achievement's id (`CgkI…`).
4. **Leaderboards**: create one, "Cars built", *Larger is better*, *Integer*. Copy its id.
5. In the same Configuration page, copy the **project id** (a number such as `123456789012`).
6. The project id is `297022434236`; the Android workflows use it by default (it is not a secret). To
   use another one, add the `PLAY_GAMES_APP_ID` repository variable (GitHub → Settings → Secrets and
   variables → Actions → Variables). A value that is not digits only is ignored with a warning in the build log.
7. The ids are written in `src/game/config/play-games.ts` (done for the 29 achievements and the leaderboard): each Play Games achievement id next to the
   game's own id (first column below) in `PLAY_GAMES_ACHIEVEMENTS`, and the leaderboard id in
   `PLAY_GAMES_LEADERBOARD_CARS`. A test checks that every key is a real achievement and no id is used twice.
8. **Publish** the game services (Configuration → Publish) before the first public release; until
   then only the listed testers can sign in.

Build from the console the same way as always (the Android workflow). Locally:
`./gradlew assembleDebug -PplayGamesAppId=123456789012`.

## Before the first release with it

* **Data safety** (Play Console → App content): Play Games Services collects what Google's own
  library collects (the player's Play Games profile and game progress, linked to their Google
  account). Re-read the form and add it if Play Console's "Play Games Services" note asks for it.
* The Android build needs the new dependency `com.google.android.gms:play-services-games-v2` (21.0.0,
  `android/variables.gradle`); the first CI run after this change compiles `PlayGamesPlugin.java`.

## What the game sends

* Each achievement the player has, once (the phone remembers which, `idle-car-empire:pgs-told`;
  Play Games ignores a repeat anyway), when it is signed in: at start and at each new one.
* The cars built (a whole number) to the leaderboard, when it grew, at most every 5 minutes.

## Achievements to create

| # | Game id | Name | Description | Points |
|---|---------|------|-------------|--------|
| 1 | `first_body` | First Body | Produce your first car body. | 10 |
| 2 | `panel_beater` | Panel Beater | Produce 100 car bodies. | 10 |
| 3 | `second_factory` | Second Factory | Own 2 factories. | 10 |
| 4 | `first_engine` | It Runs! | Produce your first engine. | 10 |
| 5 | `first_hire` | First Hire | Hire your first manager. | 10 |
| 6 | `logistics` | On the Road | Transport 500 components. | 10 |
| 7 | `scientist` | Scientist | Complete 3 research projects. | 10 |
| 8 | `millionaire` | Millionaire | Earn $1,000,000. | 10 |
| 9 | `supply_chain` | Supply Chain | Own 6 different kinds of plant. | 10 |
| 10 | `first_car` | First Car | Complete your first car. | 10 |
| 11 | `first_customer` | First Customer | Sell your first car. | 30 |
| 12 | `showroom` | Showroom Floor | Sell 100 cars. | 30 |
| 13 | `mega_factory` | Mega Factory | Upgrade a plant to Mega Factory (Level 8). | 30 |
| 14 | `dealer_network` | Dealer Network | Own 3 dealerships. | 30 |
| 15 | `ten_factories` | Industrial District | Own 10 factories. | 30 |
| 16 | `tycoon` | Tycoon | Earn $1B. | 30 |
| 17 | `mass_production` | Mass Production | Produce 1,000 complete cars. | 30 |
| 18 | `sports_debut` | Sports Debut | Build your first sports car. | 30 |
| 19 | `luxury_debut` | First Class | Build your first luxury coupe. | 30 |
| 20 | `supercar_maker` | Supercar Manufacturer | Build your first supercar. | 30 |
| 21 | `money_printer` | Money Printer | Reach $10K profit per second. | 50 |
| 22 | `hypercar_first` | Hypercar Maker | Build your first hypercar. | 50 |
| 23 | `beyond_limits` | Beyond the Limit | Raise a plant to level 11. | 50 |
| 24 | `automotive_empire` | Automotive Empire | Own every kind of plant. | 50 |
| 25 | `trillionaire` | Ten-Billionaire | Earn $10B. | 50 |
| 26 | `electric_era` | Electric Era | Build an Electric Performance car. | 50 |
| 27 | `autonomous_era` | Nobody at the Wheel | Build an Autonomous Lounge. | 50 |
| 28 | `hypercar_legend` | Hypercar Legend | Build 1,000 hypercars. | 50 |
| 29 | `flagship` | Global Flagship | Raise a plant to level 15. | 50 |

The names and descriptions are the English ones; Play Console takes translations for the other five
languages (Romanian, Russian, Spanish, Portuguese, German) under each achievement's *Localizations*.
