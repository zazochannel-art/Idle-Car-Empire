# How long the server keeps data

Kept while the account exists (deleting the account in the game deletes all of it): the save and
its backups, the profile, the empire card, the cup entries, alliance membership, purchases.

Everything else is kept only as long as it is of use, then deleted by `ops.prune_old_data()`
(migration `0028_data_retention.sql`):

| What | Kept |
| --- | --- |
| Funnel steps, play days (anonymous retention numbers) | 400 days |
| Error reports | 90 days after the error was last seen |
| Sent or dropped notifications | 30 days |
| Dashboard commands a player took (or that were cancelled) | 180 days |
| Claimed gifts | 60 days |
| The dashboard's log of admin actions | 2 years |

## Turning it on

Once, in Supabase → SQL Editor (pg_cron is already on for the push schedule, docs/push.md):

```sql
select cron.schedule('prune', '17 3 * * *', $$ select ops.prune_old_data() $$);
```

It runs every night at 03:17 UTC. To see what it would delete now, run
`select ops.prune_old_data();` by hand (it deletes, and answers how many rows of each). To stop
it: `select cron.unschedule('prune');`.

The privacy policy's retention section should name the same periods.
