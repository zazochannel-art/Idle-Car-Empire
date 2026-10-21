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
  - Alliances and open reports.
  - Errors today, and different errors in 7 days.
- **Events (Evenimente):** schedule an event, see the scheduled ones, cancel one.
- **Reports (Raportări):** players' open reports, with three actions (see [moderation.md](moderation.md)):
  - **Rename** gives the player a neutral name and closes the report.
  - **Done** closes it after you have acted.
  - **Dismiss** closes it when nothing is wrong.
- **Errors (Erori):** the last 30 days' errors in the game, most frequent first ([errors.md](errors.md) explains how to find the line in the code).
- **New players (Jucători noi):** the anonymous funnel, how far new players get and after how many minutes ([funnel.md](funnel.md)).
- **Coming back (Revin):** how many players play and how many come back.
  - Players who played today, in 7 days and in 30 days.
  - Of the new players, how many played again the next day (D1), on the 7th day (D7) and on any day of their first week.
  - The last 30 days one by one, with the same numbers per day of sign-up.
  - A player's day counts when their game saves to the cloud that day (UTC), so a player who only plays offline counts on the day the save gets through. The days before this tab came (20 October 2026) were filled in from each player's last save, their cloud backups and the day they signed up, so the first weeks show fewer days than were played.
  - Only totals: the page never lists a player.

The page is in Romanian. You stay signed in until you close the tab or press **Ieși** (sign out).

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

## Safety

- **Not reachable from the API:** the tables (`ops.admins`, `ops.live_events`) are in the `ops` schema, which the API does not expose. Nobody but the database owner can read or change them directly (`supabase/migrations/0010_live_events_and_dashboard.sql`).
- **The days played:** `analytics.play_days` keeps one row per player and day (UTC date only), marked by the server when a cloud save is written, and goes with the account. It is in the `analytics` schema, out of the API's reach; only `admin_retention()` reads it, for an admin, and returns totals (`supabase/migrations/0015_retention.sql`).
- **What players can call:** only `live_events()`, which returns the events running or coming in the next two weeks. All the `admin_*` functions refuse anyone who isn't in `ops.admins` (error `42501`). Guests and players without an account can't call them at all.
- **The live check:** `scripts/cloud-e2e.mjs` checks on every database change that a player can read the schedule but not the dashboard's data, can't schedule an event, and can't reach the tables.
- **On the page:**
  - Players' words (names in reports, error messages) are always shown as text, never run as code.
  - The page may only talk to the game's Supabase project (its Content Security Policy).
  - The sign-in lasts as long as the browser tab.
