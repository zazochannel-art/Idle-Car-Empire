# Anonymous error reports

When the game hits an error on a player's phone, it sends what went wrong and where, so it can be fixed. Android vitals (Play Console) only sees the app itself crashing; errors inside the game (a screen that fails, a button that throws) only show up here.

## What is sent

One request per different error, at most 8 per session. It carries:

- the **kind**: `error` (an error nothing caught), `rejection` (a failed promise nothing handled) or `screen` (a screen that couldn't be shown: the player saw "Something went wrong");
- the **message**, cut to 300 characters, with anything that looks like an email, a web address, an id, a sign-in token or a long number replaced (`<email>`, `<url>`, `<id>`, `<token>`, `<n>`);
- the **place**: the screen that was open and the top 4 lines of the stack, as file names and positions only (`[research] buy 0a1b2c3d.js:1:16728 < onClick 0a1b2c3d.js:1:20301`);
- the **app version** (`1.0.0 (1) 3f2b8c1`: `android/version.properties` and the commit it was built from);
- the **platform** (`android`, `ios` or `web`) and the **engine**: the Android/iOS version and the web engine's (`Android 14 · Chrome 129`; not the phone's model).

Nothing else is sent or stored:

- no account or user id, and not the player's session (only the project's public key goes with it);
- no device or install id;
- no IP address in the table;
- nothing from the save.

The same error on the same day is counted (`times`), not stored again.

## Turning it off

- **Settings → Anonymous statistics** turns these off together with the funnel ([funnel.md](funnel.md)).
- Off in any browser that asks not to be tracked (Do Not Track or Global Privacy Control).
- Errors from before the save has loaded (the start) wait for the player's choice: sent once it allows them, dropped otherwise, and never sent if the game doesn't get that far.
- Only from real builds (`next build`) with the cloud set up; never from `npm run dev` or the tests.

## Reading the reports

The easiest way is the **Errors** tab of the dashboard ([admin.md](admin.md)). The same report in SQL:

In the Supabase dashboard, open the **SQL Editor** and run:

```sql
select * from analytics.error_report;
```

Each row is an error of the last 30 days, the most frequent first, with:

- `kind`, `message` and `place`;
- `times`: how many times it happened, and `days`: on how many days;
- `versions`, `platforms` and `engines` it came from;
- `first_seen` and `last_seen`.

An error that started with a version is that version's bug; one that comes from a single `engines` value is that phone system's (an old Android WebView, say).

The raw rows, per day:

```sql
select day, kind, message, place, version, engine, times
from analytics.client_errors
order by last_at desc
limit 50;
```

## Finding the line in the code

The place names the game's built files. Each Android build in GitHub Actions keeps that build's source maps as the **source-maps** artifact (90 days), outside the app. To read a place back:

1. Find the run of the version in the report (the commit at the end of the version, e.g. `3f2b8c1`): GitHub → Actions → *Android* (or *Publish to Google Play*) → the run for that commit.
2. Download its **source-maps** artifact and unzip it.
3. Run, with the place copied from the report:

   ```bash
   node scripts/error-place.mjs ~/Downloads/source-maps "[research] buy 0a1b2c3d.js:1:16728 < onClick 0a1b2c3d.js:1:20301"
   ```

   Each frame comes back as the game's file and line:

   ```
   [research] buy 0a1b2c3d.js:1:16728 < onClick 0a1b2c3d.js:1:20301
     screen: research
     buy 0a1b2c3d.js:1:16728  →  src/game/engine/actions.ts:212:9 (buyResearch)
     ...
   ```

Maps from another build don't match: use the run of the same commit. A local build keeps them too with `SOURCE_MAPS=1 npm run build:android` (in `source-maps/`, which git ignores).

## Safety

- **Not reachable from the API:** the table and the report are in the `analytics` schema, which the API does not expose, and nobody but the database owner can read them (`supabase/migrations/0009_error_reports.sql`).
- **One way in:** `public.report_error()` checks the kind and the lengths, and turns requests away (`busy`) after 300 reports in a minute or 2,000 different errors in a day (a flood, not players).
- **Clean test calls:** the live check (`scripts/cloud-e2e.mjs`) sends an unknown kind, which is answered `unknown` without writing anything, so CI never adds rows.
- **Old rows:** reports older than 90 days are deleted as new ones come in.
