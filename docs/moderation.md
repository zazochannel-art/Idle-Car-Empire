# Moderation: names, reports, bans

Players see each other's player names, company names and alliance names and
tags (leaderboards, visits, ghost races, alliances). Google Play's
[User Generated Content policy](https://support.google.com/googleplay/android-developer/answer/9876937)
asks a game like this for four things, and the game has them:

| Google Play asks | In the game |
| --- | --- |
| Terms players accept before they write anything | The [Terms of Use](../site/terms/index.html) (`/terms/` on the site); the account form says that creating an account accepts them, with links to them and to the privacy policy. |
| A way to keep objectionable content out | Names are checked against a list of slurs, obscenities and staff impersonation, in the game and again on the server (`src/game/engine/names.ts`, migration `0008_player_safety.sql`): a player name or an alliance name that fails is refused, a company name that fails is not shown. |
| In-app reporting of content and players | Leaderboard → tap a player → **Report** (offensive player name, offensive company name, cheating, something else); the flag next to an alliance member or an alliance. |
| In-app blocking | **Hide player** on the same card: the player disappears from that player's leaderboards (kept in their save, so on every device; Profile → *Hidden players* shows them again). |

What is left for you is to look at the reports now and then, and act.

## Reading the reports

The **Reports** tab of the dashboard ([admin.md](admin.md)) lists the open ones, with buttons to rename the player, mark a report done or dismiss it. The same in SQL:

Supabase dashboard → **Table Editor** → `player_reports` (sort by `created_at`),
or **SQL Editor**:

```sql
-- open reports, newest first, with the reported player's name today
select r.id, r.created_at, r.reason, r.seen_name, r.seen_company, r.seen_alliance,
       p.username as name_now, r.target, r.alliance,
       (select count(*) from public.player_reports x where x.target = r.target) as reports_about_them
from public.player_reports r
left join public.profiles p on p.id = r.target
where r.status = 'open'
order by r.created_at desc;
```

`seen_*` is what the reporter saw when they reported; `name_now` is the name
today (the player may have changed it already). One player can't flood the
list: a report made again the same day counts once, and a player can send 20
reports a day.

When you have looked at a report, mark it:

```sql
update public.player_reports set status = 'done' where id = 123;      -- you acted on it
update public.player_reports set status = 'dismissed' where id = 124; -- nothing wrong
```

## Acting

Take the smallest step that fixes the problem (Terms of Use, section 6). In the
SQL Editor, with the player's id (`target` in the report):

**Rename an offending player name** (they can choose a new one, which the
filter checks):

```sql
update public.profiles
set username = 'Player-' || substr(replace(id::text, '-', ''), 1, 12)
where id = '00000000-0000-0000-0000-000000000000';
```

**An offending company name**: the name comes from the player's save at every
save, so renaming it on the server doesn't last. Add the word to the filter
(below), or ban the player.

**Close an offending alliance** (its members are left without one and can join
or found another):

```sql
delete from public.alliances where id = '00000000-0000-0000-0000-000000000000';
```

**Ban a player** from the leaderboards: they can still play their own game, but
nobody sees them on the boards or visits them, and they can't list themselves
again. On the dashboard: **Hide** on the report, or the player's card (which
also lifts it, and gives a player name of your choosing). In SQL:

```sql
update public.profiles set banned = true where id = '00000000-0000-0000-0000-000000000000';
-- and to lift it (they list themselves again from their Profile)
update public.profiles set banned = false where id = '00000000-0000-0000-0000-000000000000';
```

**Delete an account** (serious or repeated cases): Supabase dashboard →
**Authentication** → **Users** → the user → **Delete user**. Their save,
profile, card, gifts, alliance seat and the reports about them go with it.

## Adding words to the filter

The list lives in two places that must stay equal (the tests check it):

1. `src/game/engine/names.ts`: `NAME_PARTS` (never anywhere in a name) or
   `NAME_WORDS` (never a whole word, for short stems that hide in harmless
   words). Write the word folded: lower case, no diacritics, `й` as `и`, `ё`
   as `е`.
2. A new migration that replaces `public.name_parts()` or `public.name_words()`
   with the same list, applied to the project.

`npm test` fails until both match. Words already in use are not renamed by
the change: find them with

```sql
select id, username from public.profiles
where username !~ '^Player-[0-9a-f]{12}$' and not public.name_is_clean(username);
```

## Contact

Players can also write to `idlecarempire@gmail.com` (in the Terms of Use, the
privacy policy and the store listing). Answer reports sent there the same way.
