# The owner's dashboard and live events

A page on the game's site shows how the game is doing and lets you run events for every player:

**https://zazochannel-art.github.io/Idle-Car-Empire/admin/**

It is not linked from anywhere and search engines are asked to skip it, but the page itself is public: what protects the data is the server. Every function the page calls checks that the signed-in account is an admin, and nobody is one until you add yourself (below).

## Making yourself an admin (once)

1. In the game, use an account with an email and a password (Profile → create an account, if you still play as a guest).
2. In the Supabase dashboard, open **SQL Editor** and run, with that account's email:

   ```sql
   insert into ops.admins (user_id) select id from auth.users where email = 'YOUR-EMAIL';
   ```

3. Open the page, sign in with the same email and password.

To remove an admin: `delete from ops.admins where user_id = (select id from auth.users where email = '…');`

## What the page shows

- **Overview (Pe scurt):** the main numbers.
  - Accounts and guest accounts, and new accounts in 7 days.
  - Players who played today and in the last 7 days.
  - New games started in 7 days.
  - Companies that opened Nordheim.
  - Alliances and open reports.
  - Errors today and in 7 days, and different errors in 7 days.
  - Each 7-day number shows its change against the 7 days before (green when it is the good way: fewer errors is green).
  - A bar for each of the last 30 days: how many played that day (today in gold).
- **Progress (Progres):** how far players are, from the cloud saves of the last 7 days, 30 days or all. Only totals.
  - Money earned, in bands.
  - Territories open in the first city.
  - Nordheim: who opened it, who plays there now, and who could open it.
  - Reset Imperium, and the racing team.
  - Medians: plants, ⭐ Stars, research, cars made, money earned.
  - The app versions in use. Saves from 1.0.7 on say which version wrote them; the older ones are counted apart.
- **Players (Jucători):** find a player by player name, company name, email or id, and open their card (below).
- **Events (Evenimente):**
  - A calendar of the next 4 weeks: the events and seasons scheduled here, the calendar's seasons and the announcements, day by day, so the gaps show.
  - Schedule an event or a season, see the scheduled ones, cancel one.
  - Post an announcement (below).
- **Reports (Raportări):** players' open reports, with these actions (see [moderation.md](moderation.md)):
  - **Card** opens the reported player's card.
  - **Rename** gives the player a neutral name and closes the report.
  - **Hide** takes the player off the boards and closes the report.
  - **Done** closes it after you have acted.
  - **Dismiss** closes it when nothing is wrong.
- **Errors (Erori):** the last 30 days' errors in the game, most frequent first ([errors.md](errors.md) explains how to find the line in the code).
  - Choose a version to see only what it sent. An error that first came from that version is tagged "nouă în versiunea asta".
  - **Rezolvat** (fixed) hides an error. It comes back, tagged "a revenit", when a version it hadn't come from sends it again. "Arată și cele rezolvate" shows the hidden ones.
- **New players (Jucători noi):** the anonymous funnel, how far new players get and after how many minutes ([funnel.md](funnel.md)).
- **Coming back (Revin):** how many players play and how many come back.
  - Players who played today, in 7 days and in 30 days.
  - Of the new players, how many played again the next day (D1), on the 7th day (D7) and on any day of their first week.
  - The last 30 days one by one, with the same numbers per day of sign-up.
  - A player's day counts when their game saves to the cloud that day (UTC), so a player who only plays offline counts on the day the save gets through. The days before this tab came (20 October 2026) were filled in from each player's last save, their cloud backups and the day they signed up, so the first weeks show fewer days than were played.
  - Only totals: this tab never lists a player.
- **Social:** invite codes made and used, friends that brought the reward, gifts, alliances, phones with notifications, and the weekly cup's entrants and prizes taken, week by week.
- **Log (Jurnal):** what every admin did, newest first: events, seasons and announcements scheduled or cancelled, names changed, players hidden, commands sent or cancelled, reports closed, errors marked. An entry about a player goes with their account when it is deleted.

The page is in Romanian. You stay signed in until you close the tab or press **Ieși** (sign out).

## A player's card

Found from **Players**, a report or the log. It shows:

- The account: email (or guest), when it was made, the last sign-in, the days played in the last 30, the boards, the alliance, invites and reports.
- The game as last saved to the cloud: when, from which device and app version, the city being played, money and plants in each city, territories, money earned, cars, ⭐ Stars, both reputations, research points, resets.
- Its cloud backups, what was sent to its game, the reports about the player, and the log about them.

What you can do:

- **The player name:** give one of your choosing (the name check and the 3–20 characters apply), or a neutral one.
- **Off the boards:** hide the player from the leaderboards, or let them back (they then list themselves again from their Profile).
- **Send to their game:** money (add, take or set exactly, in the city they play in or in a city of your choosing), ⭐ Stars (add, take or set), reputation, the company's name, or just a message. A message of up to 200 characters can go with any of them; the player sees it with the change.
  - **Reputation** is one of two (migration `0021_command_reputation.sql`). The company's goes from 0 to 100, with 50 neutral: each point above or below moves car prices by 0.2%, and it drifts back towards 50 by about 3 points an hour, so a change wears off. The racing team's is whole points and only grows by racing: it opens circuits, sponsors and cars. The card shows both as last saved.
- **Restore a cloud backup:** their game opens it in place of what it plays, and keeps that as a new backup, so it can be undone.

### How a command reaches the game

The save lives on the player's phone; the cloud has a copy. Changing the copy on the server would make the two disagree, and the player could keep their own. So the server never edits a save: it queues the command, and the player's game takes it, carries it out and saves, as it does with gifts.

- **When:** the game asks a few seconds after it starts and every 10 minutes while it is open.
- **Which games:** 1.0.7 and later. An older game never asks, so a command waits until the player updates.
- **Once:** the server hands each command out once. Until then the card shows it as "așteaptă jocul" (waiting) and you can cancel it.
- **Limits:** amounts up to 10³⁰, Stars in whole numbers, money and Stars never below 0, 20 commands waiting per player.
- **The player sees** a note for each one ("The game team sent you $1.50M"), with your message, in their language; it stays in their notification center.

## Announcements

From **Events → Un anunț în joc**: a sign (an emoji), a start, a length (1 hour to 14 days), and a title (up to 60 characters) with a text (up to 300) in the languages you choose.

- Each game shows it once, as a note that stays in its notification center.
- The language: the player's, else English, else Romanian, else the first one written.
- **Reaching players:** like events, within half an hour, from 1.0.7 on.
- **One at a time?** No: up to 10 can be waiting or running.
- **Cancelling:** games that haven't shown it yet won't.

## Live events

The game runs a market event every few hours on its own (Factory Week, Car Show, Steel Price Crash…). From the dashboard you can also put one of those events on at a time you choose:

- **When:** from now up to 60 days ahead.
- **How long:** from 15 minutes to 72 hours.
- **Which:** only the game's own events, with their usual effects. A scheduled event can do nothing a regular one doesn't, and nobody can add a new kind from the page.
- **One at a time:** an event that would overlap another scheduled one is refused.
- **While it runs:** it takes the place of the regular events. Everything else (its goal, its reward, the HUD chip) works as for a regular one.
- **Reaching players:** a running game looks for scheduled events at the start, every half hour and when it comes back to the screen. Plan on up to half an hour before every player has it.
- **Offline players:** they don't get it; the regular schedule goes on for them.
- **Cancelling:** players stop seeing the event (within half an hour, as above). The dashboard keeps it, marked "anulat" (cancelled).

## Seasons

Spring and summer come with the calendar, like Halloween and winter:

- **Spring festival:** 21 March to 10 April.
- **Summer road trip:** 15 July to 10 August.

While one runs, every player gets:
- flowers or bunting in the factory halls;
- +10% income;
- the festival: three goals sized to their empire, each paying 1 ⭐ and an hour of income;
- a race livery for all three goals (*Blossom* in spring, *Sunset* in summer).

From the dashboard you can also put spring or summer on at another time (**Programează un anotimp**, on the Events tab):

- **When:** from now up to 120 days ahead.
- **How long:** 1 to 31 days.
- **Which:** spring or summer only. Winter's advent calendar is tied to December, so it stays on the calendar.
- **One at a time:** a season that would overlap another scheduled one is refused.
- **While it runs:** it takes the place of the calendar's season. Each run is a new festival with new goals, even if the player already had one that year.
- **Reaching players:** as for events, within half an hour.
- **Cancelling:** players go back to the calendar's season. The dashboard keeps the row, marked "anulat" (cancelled).

The rules live on the server (`supabase/migrations/0014_seasons.sql`) and in the game (`src/game/engine/season.ts`, `festival.ts`).

## Safety

- **Not reachable from the API:** the tables (`ops.admins`, `ops.live_events`, `ops.live_seasons`) are in the `ops` schema, which the API does not expose. Nobody but the database owner can read or change them directly (`supabase/migrations/0010_live_events_and_dashboard.sql`).
- **The days played:** `analytics.play_days` keeps one row per player and day (UTC date only), marked by the server when a cloud save is written, and goes with the account. It is in the `analytics` schema, out of the API's reach; only `admin_retention()` reads it, for an admin, and returns totals (`supabase/migrations/0015_retention.sql`).
- **What players can call:**
  - `live_events()` and `live_seasons()`: the events running or coming in the next two weeks, and the seasons in the next 60 days.
  - `live_announcements()`: the announcements running now.
  - `claim_my_commands()`: the signed-in player's own commands, each handed out once.
  - All the `admin_*` functions refuse anyone who isn't in `ops.admins` (error `42501`). Guests and players without an account can't call them at all.
- **The commands, announcements, error marks and the log** are in the `ops` schema too (`ops.player_commands`, `ops.announcements`, `ops.error_marks`, `ops.admin_log`, migration `0020_dashboard_tools.sql`). Every admin action that changes something is logged, with the admin's account.
- **The live check:** `scripts/cloud-e2e.mjs` checks on every database change that a player can read the schedule and the announcements but not the dashboard's data, takes only their own commands, can't schedule, send or change anything, and can't reach the tables.
- **The rules, checked:** `supabase/tests/admin_rules.sql` (run in the SQL Editor; it rolls itself back).
- **On the page:**
  - Players' words (names in reports, error messages) are always shown as text, never run as code.
  - The page may only talk to the game's Supabase project (its Content Security Policy).
  - The sign-in lasts as long as the browser tab.
