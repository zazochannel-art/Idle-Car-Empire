# Player accounts and cloud saves

Every player has their own account and their own save in the cloud
(Supabase). The game still works without the cloud: with no Supabase
settings, or while it can't be reached, it saves on the device only.

## How it works for a player

- **Welcome page**: before the game, a player who isn't signed in on this
  device sees "Create account" (name, email, password) and "Sign in" (email
  and password). Nobody plays without an account: nothing starts or saves
  behind the page, and it stays until the player registered or signed in
  (`SaveManager.start`). Creating the account needs a connection; after that
  the game plays offline too.
- **Create an account**: under the hood it is a guest account that gets the
  name, email and password, so a confirmation email the player hasn't
  clicked yet never blocks the game (they play meanwhile, the profile shows
  the email as waiting). A failed attempt (name or email taken) is retried
  with the same account.
- **Guests from before** (when the game could be played without an
  account: a Supabase anonymous account): their next start shows the welcome
  page with a note. "Create account" adds the name, email and password to
  their guest account, so their game, id and progress stay as they are.
  "Sign in" to another account plays that account's game, and the guest's
  game is kept on the device as a backup (Profile → Backups on this device).
- **Sign in on another device** (welcome page or profile): the account's game
  is loaded from the cloud.
- **Log out**: the game is saved first, then the account's copy is removed
  from the device; the next start shows the welcome page, opened on "Sign in".
- **Profile**: name (3–20 characters, unique, case-insensitive) and an avatar;
  company, money, earnings, factories, cars built, the cloud save's status
  and time, "save now", password, switch account, log out. In every language
  of the game.

## Saving

`src/game/save/` — `index.ts` (SaveManager), `sync.ts` (CloudSync),
`policy.ts` (which copy to play), `local.ts` (device storage), `supabase.ts`
(the backend), `serialize.ts` (versioned format and migrations).

- **This device** is written on every save (instant, works offline), under a
  key per account: `idle-car-empire:save:u:<account id>`. One player's copy
  is never read for another account.
- **The cloud** gets the latest state at most every 30 s while playing,
  2 s after an important action (grouping several), and at once when the
  page is hidden or closed (best effort: the periodic saves keep it close
  either way). "Save now" in the profile sends it immediately.
- **One request at a time**: a newer state waits for the one in flight, so an
  older save can never land after a newer one.
- **Revisions**: every cloud save names the revision it builds on.
  `save_game()` only writes when the cloud is still at that revision; if
  another device or tab saved in between, it refuses and the game shows a
  conflict instead of overwriting anything.
- **Failures** (network, server, 20 s timeout) are retried after 5, 15, 30,
  60 s, and at once when the browser comes back online. The game never
  waits for any of it.
- **Status**, shown on the avatar button and in the profile: saving, saved
  (with time and revision), save failed / offline (retrying), conflict.
- **Loading**: the game doesn't start (and saves nothing) until the account,
  its cloud save and its profile are known; a loading screen shows meanwhile.
  A slow connection holds it up only so long:
  - the session: after 3 s the account stored on this device is used (supabase-js
    finishes refreshing an expired token in the background), so a signed-in
    player is never sent to the sign-in page by a slow network;
  - the cloud save: with this account's copy on the device, after 3 s that copy
    plays and its first save is checked against the cloud's revision (a newer
    save there brings the conflict choice); with no copy here, up to 12 s;
  - the profile: after 1.5 s the game shows and the name follows.

## Which copy is played at the start

| Situation | Result |
|---|---|
| No save anywhere | a new company |
| Cloud unreachable | this device's copy, uploaded when the cloud is back (checked against the cloud's revision then) |
| Cloud empty, this device has a copy (or a save from before accounts) | the device's copy, uploaded |
| This device's copy started from the cloud's current revision | the device's copy (uploaded if it had unsaved progress) |
| The cloud moved on (another device), this device has no unsaved progress | the cloud's |
| Both moved on | **the player chooses**; the other copy is kept as a backup |
| A save from before accounts and a cloud save of a **different** company | **the player chooses**; the other is kept as a backup |
| The same company in both | the one played last |
| The cloud save comes from a newer version of the game | "reload to update", nothing is played or saved |
| The cloud save is damaged (unreadable) | this device's copy repairs it |

Backups: the last 3 replaced copies stay on the device under
`idle-car-empire:backup:<time>:<reason>`, listed in the profile under
"Backups on this device". **Restore** (after a confirmation) plays one again:
the current game becomes a backup itself and the restored one replaces the
account's save here and in the cloud. A restored save earns nothing for the
time it spent as a backup. Saves from before accounts
(`idle-car-empire:save:v1`) move into the first account that loads them and
are kept as such a backup.

During play, a refused save (another session saved meanwhile) opens the
conflict dialog with both copies side by side (company, money, earnings,
factories, cars, last played). The copy not chosen is kept as a backup.

## Cloud backups

Besides the backups on the device, the server keeps older copies of each
account's save (`0011_cloud_backups.sql`), shown in the Profile under
*Cloud backups*, on any device the player signs in on:

- every time a save is written, the copy it replaces is kept when the
  newest automatic backup is more than 3 hours old (so the first write after
  a new account's first save makes one at once);
- always when the new save has earned less than half of what the old one had
  (a game that lost most of its progress: a bug, a wrong choice in the
  conflict dialog, an old phone's save);
- before a restore, the cloud save it is about to replace.

Each player keeps the newest 12; they go with the account when it is deleted.
A player can also delete one of their own from the Profile
(`delete_my_backup`, `0017_delete_backups.sql`).
A restore works like a device backup's: the server hands the backup to the
game (`take_my_backup`, after keeping the current cloud save), the game it
replaces is kept on the device too, and the game saves the restored one
through `save_game()` as always, so a session that moved on meanwhile still
gets the conflict dialog. A backup made by a newer version of the game than
the one running isn't offered for restore ("update the app"). A backup that
fails to be made never stops the save: the trigger logs it and goes on.

## Offline earnings and cheating

- Time away is measured on the **server's clock**: `load_game()` returns the
  server time with the save, and a save can't claim more time away than
  passed on the server since its last cloud save. Setting the device's clock
  forward earns nothing extra. Offline earnings stay capped (24 h, longer
  with research/perks) as before.
- **No double rewards from two sessions**: two tabs or devices playing the
  same account both start from the same revision; the first to save wins,
  the second gets a conflict and must pick one copy. Progress from both is
  never added together.
- **What the server checks**: who owns the save (only the signed-in player,
  enforced by the database), that it is a game object, its format version
  (an older game can't overwrite a newer save), its revision, and its size
  (4 MB). **What it does not check**: the economy values inside the save.
  The whole simulation runs in the browser, so a determined player can edit
  their own save. In their own game that harms no one (there is no trading);
  what others see of it (the leaderboard) is limited instead, see below.
  Validating the economy on the server would need the simulation to run
  there (e.g. a Supabase Edge Function replaying actions); that is a large
  change and was left out on purpose.

## Leaderboard, visits and gifts

Signed-in players (guests too) see a **global leaderboard** (this week: money
earned since Monday 00:00 UTC; all time: money earned in total, across
resets), can tap a player to **visit their empire** (read only) and send them
a **gift** once a day.

- **What others can see**: only a public card the server builds from each
  save after it is written (`public.empires`): the profile's name and avatar,
  the company name, money earned, cars built, Stars, and the plants with
  their levels, number of districts, racing totals and resets, and (from
  `0018_visit_map.sql`) the map of their island for visits in 3D: which
  building stands on which lot at what level, the districts and territories
  open, the dealerships owned and whether the Racing District is built.
  Nothing else of a save is ever readable by another player.
- **Plausible totals**: the card's money earned can't grow faster than the
  game allows on the server's clock: at most doubling every 30 minutes, plus
  $20K a second and $1M (for the early game); a first card starts at no more
  than $10M and 5,000 cars. It never goes down. A hand-edited save therefore
  climbs only as fast as a very good player could, not to the top at once.
  This limits cheating on the board; it doesn't make it impossible.
- **Leaving the board**: Profile → "Show me on the leaderboard" off
  (`profiles.listed`). The player is then neither listed, visitable nor
  giftable; they still see their own rank.
- **Gifts**: one a day (UTC) to the same player, 5 a day in all, and a
  player receives at most 20 a day (so spare guest accounts can't feed one
  player without end). The receiver collects them at the next start, every
  10 minutes while playing, or on opening the board; each is worth 2 minutes
  of their income, and sending one pays the sender 30 seconds of theirs.
  Gifts are rewards: they don't count as money earned (not for the board,
  not for resets).
- A deleted save takes its card off the board.

## Ghost duels and alliances

- **Ghosts**: the game publishes the player's best race car at the track
  (model, colours and its performance figures, unworn) on their card, at
  the start and every 10 minutes when it changed (`publish_ghost`; the
  server keeps only those fields, numbers in range). Visiting a player with a
  ghost offers a **duel**: one against one on one of the visitor's tracks,
  three laps, decided in the visitor's game like every race, with no wear.
  A win pays 2 minutes of income and 5 reputation, a loss 30 seconds and 1;
  one duel a day with each player, 5 a day in all. Nothing about the duel is
  stored on the server: it only pays the visitor.
- **Alliances**: up to 20 players. Anyone can found one (name 3–24
  characters, tag of 2–4 letters or digits, both unique, and an emblem) or
  join an open one; a player is in one alliance at a time. The leader can
  remove members; when the leader leaves, the longest-standing member leads,
  and the last member leaving closes the alliance.
- **The weekly goal**: each member brings points for their own growth this
  week, from their card: money earned since Monday (UTC) in % of what they
  had at its start (at least $1M), at most 100 each. The alliance's points
  open three tiers (100, 250, 500 points). Each member takes each tier once a
  week, a day after joining at the earliest, and once per week whatever
  alliance they are in (so hopping between alliances pays nothing more).
  Rewards: 15 minutes of income, 45 minutes, and 2 hours plus ⭐ 1.
  Rewards don't count as money earned.

## Weekly cup

Leaderboard → *Cup*: one track a week (Monday 00:00 UTC to the next), every
track in turn, the same for every player whatever their reputation
(`src/game/engine/cup.ts`).

- **Timed runs**: three a UTC day, with the player's ghost car (their best
  car at the track, unworn), against the clock: the track's reference lap
  scaled by the car's rating, with a little form and noise. Each run is
  decided once (seeded by week, day, run and car), so reloading doesn't race
  it again. The week's best goes to the board.
- **The board** (`cup_board(week)`): the best 50 times of listed players,
  and the player's own; the entrants are counted. Players who left the
  leaderboards don't show.
- **Prizes**, paid once the week is over, by place (`claim_cup_prizes()`
  hands each finished week out once; the game pays it, on the gifts timer):

  | Place | Needs | Prize |
  |---|---|---|
  | 1st | 5+ players | 5 ⭐, 2 h of income, +60 reputation |
  | top 3 | 5+ players | 3 ⭐, 90 min, +40 |
  | top 25% | 4+ players | 2 ⭐, 1 h, +25 |
  | top half | 2+ players | 1 ⭐, 45 min, +15 |
  | everyone else who raced | | 30 min, +10 |

  Rewards, like gifts: they don't count as money earned.
- **On the server** (`ops.cup_entries`, not reachable from the API): one row
  per player and week, the best time, its car and colour, the sends that day
  (3 at most) and when the prize was taken. `cup_submit(week, ms, car,
  color)` answers `ok`, `closed` (not this week), `invalid` (faster than the
  best car could drive: laps × reference lap × 0.49 s, or not a car) or
  `limit`. Times come from the player's game, as every score on the boards
  does; the floor stops the impossible ones. The server's track list
  (`ops.cup_track`) must match the game's `TRACKS`: a test compares them.

## Invite codes

Each player has a 6-character **invite code** (Profile → *Invite friends*),
made the first time they open it, to share as text. A new player can enter
one friend's code in their account's first 7 days:

- **The new player** gets a welcome gift at once: $25K plus 10 minutes of
  their income (`src/game/engine/invites.ts`).
- **The friend** gets 2 ⭐ and 30 minutes of income once the new player has
  built their first car, for up to 10 friends in all. The server reads that
  from the new player's own cloud save (`lifetime.carsProduced ≥ 1`), so a
  friend's reward can't be claimed by an account that never played. The game
  collects due rewards on the same timer as gifts.
- Both are rewards: they don't count as money earned (not for the board, not
  for resets).
- **Limits**: one code per account, ever; not one's own code, nor the code of
  a friend who used one's own (no pairs inviting each other); a code takes at
  most 50 players. A player sees how many friends used their code, never who.
- The codes and the links (`ops.invite_codes`, `ops.invites`) are not
  reachable from the API; players reach them only through `my_invite()`,
  `redeem_invite(p_code)` (`ok`, `already`, `late`, `self`, `full`,
  `unknown`) and `claim_invite_rewards()`. A deleted account takes its code
  and its own link with it; a friend who used its code keeps only the fact
  that they used one.

## Database

Migrations in `supabase/migrations/`, in order:

1. `0001_game_saves.sql` — the save table (one row per player) with Row Level
   Security.
2. `0002_profiles_and_revisions.sql` — profiles, revisions and server
   timestamps on saves, `save_game()` / `load_game()`.
3. `0003_saves_through_rpc_only.sql` — **apply only after the new game
   version is live on GitHub Pages** (and open tabs had a day to reload).
   It closes direct table writes, so saves go through `save_game()` only.
   Until then, an old tab's direct write still gets a new revision from the
   trigger, so newer clients see a conflict instead of losing anything.
4. `0004_leaderboard_visits_gifts.sql` — the public empire cards, the
   leaderboard, visits and gifts (see "Leaderboard, visits and gifts").
   Independent of 0003. Players who saved before it get their card at their
   next save. `0018_visit_map.sql` adds the island's map to the cards (visits
   in 3D) and draws the cards already published again from their saves. Until it
   runs, cards have no map and the visit only offers the card itself.
5. `0005_ghosts_and_alliances.sql` — ghosts on the cards, and alliances (see
   "Ghost duels and alliances"). Safe to run again.
6. `0011_cloud_backups.sql` — cloud backups (see "Cloud backups"): the
   `ops.save_backups` table (not reachable from the API), the trigger on
   `game_saves` that keeps them, `list_my_backups()` and `take_my_backup()`.
   `0017_delete_backups.sql` adds `delete_my_backup()`.
7. `0012_invites.sql` — invite codes (see "Invite codes"): the
   `ops.invite_codes` and `ops.invites` tables (not reachable from the API),
   `my_invite()`, `redeem_invite()` and `claim_invite_rewards()`.
8. `0013_weekly_cup.sql` — the weekly cup (see "Weekly cup"): the
   `ops.cup_entries` table (not reachable from the API), `cup_submit()`,
   `cup_board()` and `claim_cup_prizes()`.
9. `0019_purchases.sql` — the server's check of in-app purchases
   ([android/iap.md](android/iap.md)): the `ops.purchases` ledger (not
   reachable from the API), `my_purchases()` for players, and three functions
   for the service key only (`iap_record()`, `iap_refunded()`,
   `iap_voided_mark()`).

`profiles`: `id` (= the auth user, deleted with it), `username` (unique on
`lower(username)`, 3–20 characters, no control characters), `avatar`,
`created_at`, `updated_at`. Created by a trigger for every new user (guest or
registered) as `Player-<12 hex>`. A player can read only their own row and
change only `username` and `avatar`.

`game_saves`: `user_id` (primary key, = the auth user, deleted with it),
`data` (jsonb object), `save_version`, `revision`, `updated_at`, `device`.
A trigger stamps every write with the server's time and the next revision
and keeps `user_id` unchanged. A player can read and delete only their own
row; signed-out visitors can't touch the table.

Functions (all for signed-in players only, `search_path` pinned):

- `save_game(p_data, p_save_version, p_base_revision, p_device)` → `ok,
  revision, updated_at`. Writes the caller's own row only if its revision
  is `p_base_revision` (0 = no save yet) and the stored version is not
  newer; otherwise returns `ok = false` and the current revision.
- `load_game()` → `data, save_version, revision, updated_at, server_now`.
- `ensure_profile()` → the caller's profile, created if missing.
- `list_my_backups()` → the caller's cloud backups, newest first: `id,
  made_at, reason` (`auto`, `drop`, `restore`), `device, save_version`, and
  the summary the Profile shows (`company, cash, earned, cars, plants,
  last_played`), read from the backup on the server.
- `take_my_backup(p_id)` → `data, save_version` of one of the caller's own
  backups (nothing for anyone else's), after keeping the caller's current
  cloud save as a `restore` backup.
- `delete_my_backup(p_id)` → `true` when one of the caller's own backups was
  deleted, `false` for anyone else's or one already gone (0017).
- `leaderboard(p_kind)` (`'week'` or `'all'`) → the top 50 listed players
  plus the caller's own row: `rank, user_id, username, avatar, company,
  value, me`.
- `visit_empire(p_user)` → a listed player's card (or the caller's own).
- `send_gift(p_to)` → `'sent'`, `'already'`, `'limit'`, `'full'`, `'self'`
  or `'unknown'`; `claim_gifts()` → how many gifts were waiting (each
  counted once); `gifts_sent_today()`.

- `publish_ghost(p_ghost)` → whether the caller's card took it (null
  withdraws it).
- `list_alliances(p_search)` → up to 30 alliances (the strongest this week,
  or matching the search): `id, name, tag, emblem, members, points, mine`.
- `my_alliance()` → the caller's alliance as JSON (members and their points,
  the week's tiers and the ones taken, from when they may take them), or null.
- `create_alliance(p_name, p_tag, p_emblem)` → `'ok'`, `'member'`,
  `'invalid'`, `'name'` or `'tag'`; `join_alliance(p_id)` → `'ok'`,
  `'member'`, `'full'` or `'unknown'`; `leave_alliance()` → `'ok'` or
  `'none'`; `kick_member(p_user)` (leader) → `'ok'`, `'leader'` or
  `'unknown'`; `claim_alliance_tier(p_tier)` → `'ok'`, `'none'`, `'new'`,
  `'short'`, `'claimed'` or `'invalid'`.

`empires` (the public cards), `gifts`, `alliances`, `alliance_members` and
`alliance_claims` have Row Level Security on and no policies, and no table
rights for players: they are reached only through the functions above. A trigger on `game_saves` writes the card after every save
and removes it with the save.

Apply them in the Supabase dashboard → SQL Editor (paste each file, run), or
with the Supabase CLI (`supabase db push`).

## Setup

### Environment variables

Only two, both **public by design** (they ship inside the apps):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key, "sb_publishable_…" (or the legacy anon key)>
```

Locally: copy `.env.example` to `.env.local`. For the app builds they are set
in `.github/workflows/android.yml` and `ios.yml`. **Never** put the `service_role` /
`sb_secret_…` key in the game, the repository or a workflow: it bypasses Row
Level Security. The game doesn't need it.

### Supabase dashboard

1. **Authentication → Sign In / Providers**: enable **Anonymous sign-ins**
   and **Email**.
2. **Email confirmation** (Authentication → Sign In / Providers → Email →
   "Confirm email"). Playing needs an account, so registering must work for
   everyone. Supabase's built-in email sender only delivers to the project's
   team members and a few emails per hour, so for public players either:
   - turn **Confirm email off**: registering adds email + password right
     away (no email is sent), or
   - keep it on and set up **custom SMTP** (Authentication → Emails → SMTP
     Settings). Free tiers exist, e.g. Resend or Brevo; any SMTP provider
     works.
   With confirmation on and no working email, a player who registers stays a
   guest with the email "waiting for confirmation"; their game is still saved
   under the guest account.
3. **Authentication → URL Configuration**: Site URL
   `https://zazochannel-art.github.io/Idle-Car-Empire/`, and the same URL
   under Redirect URLs (it is where confirmation links lead: the site's page
   there says the address is confirmed and to go back to the app).
4. Free plan notes: the project pauses after a week without any traffic
   (restore it from the dashboard; the game keeps saving on devices
   meanwhile), and anonymous sign-ins are rate limited per IP (30/hour by
   default; Authentication → Rate Limits). A CAPTCHA (e.g. Cloudflare
   Turnstile, free) can be added later against abuse.
5. **Password resets** (the sign-in form's *Forgot password?*). The game emails
   a link to `site/reset-password/`, where the player chooses a new password.
   It needs an email sender for every address, so it is off until you turn
   it on; meanwhile *Forgot password?* shows the contact address (below).
   1. Authentication → Emails → **SMTP Settings** → enable custom SMTP. The
      game's own Gmail works and is free: host `smtp.gmail.com`, port `465`,
      user `idlecarempire@gmail.com`, password: an **app password** (Google
      Account → Security → 2-Step Verification on → App passwords), sender
      `idlecarempire@gmail.com`, name `Idle Car Empire` (Gmail sends up to
      about 500 a day). Brevo's free plan (300 a day) works the same way.
      Never put the password in the repository.
   2. Authentication → URL Configuration → **Redirect URLs**: add
      `https://zazochannel-art.github.io/Idle-Car-Empire/reset-password/`.
      (Without it Supabase sends the link to the Site URL; that page passes
      it on to the reset page, so it still works.)
   3. GitHub → the repository → Settings → Secrets and variables → Actions →
      **Variables** → `PASSWORD_RESET` = `on`, then build the app again
      (Actions → Android / iOS → Run workflow, or the next merge).
   4. Try it: sign out in the app, *Sign in* → *Forgot password?* with your
      own email, open the email's link, set a password, sign in with it.

   **Helping a player by hand** (before that, or when an email doesn't
   arrive): when a player writes from their account's email address, set a
   temporary password in the SQL Editor, send it to them, and ask them to
   choose their own in Profile → *New password*:

   ```sql
   update auth.users
   set encrypted_password = extensions.crypt('a-temporary-password', extensions.gen_salt('bf'))
   where email = 'player@example.com';
   ```

## Tests

- `npx vitest run src/game/save` — the start policy, the sync engine
  (grouping, ordering, retries, conflicts, backups) and whole-player
  scenarios against an in-memory server with the same rules as the database:
  no game without an account (the welcome page stays until there is one),
  player A (account → second device), player B (isolation, name
  uniqueness), a guest from before registering or signing in elsewhere, an
  email still to confirm, a save from before accounts, logout/sign-in,
  offline start, a damaged cloud save.
- `supabase/tests/access_rules.sql` — run in the SQL editor: creates two test
  users inside a transaction, checks every access rule as each of them and as
  a signed-out visitor, and rolls everything back. Ends with "all access
  checks passed".
- `supabase/tests/social_rules.sql` — the same for the leaderboard, visits
  and gifts (plausibility limits, leaving the board, the gift limits, a new
  week, a deleted save). Ends with "all social checks passed".
- `supabase/tests/purchase_rules.sql` — the purchases ledger (a purchase kept
  for one account, refunds, what a player can and can't reach). Ends with
  "purchase rules: all checks passed".
- `supabase/tests/alliance_rules.sql` — ghosts and alliances (cleaned
  ghosts, names and tags, joining, the week's points, who may take which
  reward, removing a member, the leader leaving, an empty alliance closed).
  Ends with "all alliance checks passed".
- `scripts/cloud-e2e.mjs` — the same checks against the real project through
  its public API, exactly as the browser does (two anonymous test players;
  they appear on the board for a few seconds, under `e2e-…` names, until
  they delete their saves and then their accounts; a third registers with an
  email and a password, signs in with them, then deletes its account).
  Runs in CI (`.github/workflows/cloud-e2e.yml`) on pull requests that touch
  the save code or the database, and on demand.

Before October 2026 the two anonymous test players were kept, named
`e2e-…`. To remove those left from then (SQL editor; deletes their profiles
too, they never kept a save):

```sql
delete from auth.users
where is_anonymous
  and id in (select id from public.profiles where username like 'e2e-%');
```

Old guest accounts that never registered can be cleared the same way, e.g.
`where is_anonymous and created_at < now() - interval '90 days'` — only if
losing those guests' cloud saves is acceptable (their devices keep a copy).
