# Player accounts and cloud saves

Every player has their own account and their own save in the cloud
(Supabase). The game still works without the cloud: with no Supabase
settings, or while it can't be reached, it saves on the device only.

## How it works for a player

- **First visit**: a guest account is created silently (Supabase anonymous
  sign-in). The game is saved to the cloud under that account at once, but
  only this browser can reach it.
- **Create an account** (Profile → Account): email + password are added to
  the *same* account, so the game, the id and the name stay as they are.
  From then on the player can sign in on any device.
- **Sign in on another device**: the account's game is loaded from the cloud.
  A guest game that device had is never merged into the account; the sign-in
  form warns that it is left behind (register it first to keep it).
- **Log out**: the game is saved first, then the account's copy is removed
  from the device; the next start shows the sign-in screen (or "play as a new
  guest").
- **Profile**: name (3–20 characters, unique, case-insensitive) and an avatar;
  company, money, earnings, factories, cars built, the cloud save's status
  and time, "save now", password, switch account, log out. In English,
  Romanian and Russian.

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
  their own save. That only affects their own game: there is no shared
  economy or trading. Validating the economy on the server would need the
  simulation to run there (e.g. a Supabase Edge Function replaying actions);
  that is a large change and was left out on purpose.

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

Apply them in the Supabase dashboard → SQL Editor (paste each file, run), or
with the Supabase CLI (`supabase db push`).

## Setup

### Environment variables

Only two, both **public by design** (they end up in the browser):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key, "sb_publishable_…" (or the legacy anon key)>
```

Locally: copy `.env.example` to `.env.local`. For GitHub Pages they are set
in `.github/workflows/pages.yml`. **Never** put the `service_role` /
`sb_secret_…` key in the game, the repository or a workflow: it bypasses Row
Level Security. The game doesn't need it.

### Supabase dashboard

1. **Authentication → Sign In / Providers**: enable **Anonymous sign-ins**
   and **Email**.
2. **Email confirmation** (Authentication → Sign In / Providers → Email →
   "Confirm email"). Supabase's built-in email sender only delivers to the
   project's team members and a few emails per hour, so for public players
   either:
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
   under Redirect URLs (it is where confirmation and sign-in links lead).
4. Free plan notes: the project pauses after a week without any traffic
   (restore it from the dashboard; the game keeps saving on devices
   meanwhile), and anonymous sign-ins are rate limited per IP (30/hour by
   default; Authentication → Rate Limits). A CAPTCHA (e.g. Cloudflare
   Turnstile, free) can be added later against abuse.

## Tests

- `npx vitest run src/game/save` — the start policy, the sync engine
  (grouping, ordering, retries, conflicts, backups) and whole-player
  scenarios against an in-memory server with the same rules as the database:
  player A (guest → account → second device), player B (isolation, name
  uniqueness), a save from before accounts, logout/sign-in, offline start, a
  damaged cloud save.
- `supabase/tests/access_rules.sql` — run in the SQL editor: creates two test
  users inside a transaction, checks every access rule as each of them and as
  a signed-out visitor, and rolls everything back. Ends with "all access
  checks passed".
- `scripts/cloud-e2e.mjs` — the same checks against the real project through
  its public API, exactly as the browser does (two anonymous test players).
  Runs in CI (`.github/workflows/cloud-e2e.yml`) on pull requests that touch
  the save code or the database, and on demand.

The e2e test players stay as anonymous users named `e2e-…`. To remove them
(SQL editor; deletes their profiles and saves too):

```sql
delete from auth.users
where is_anonymous
  and id in (select id from public.profiles where username like 'e2e-%');
```

Old guest accounts that never registered can be cleared the same way, e.g.
`where is_anonymous and created_at < now() - interval '90 days'` — only if
losing those guests' cloud saves is acceptable (their devices keep a copy).
