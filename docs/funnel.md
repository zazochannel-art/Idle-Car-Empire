# Anonymous new-player funnel

Where do new players stop? The game counts how many new companies reach each step of the start, so we can see which step loses players and fix that one instead of guessing.

## What is sent

One request per step, the first time a company reaches it. It carries:

- the **step's name**, from a fixed list;
- the **minutes of play** it took.

The server adds the time it arrived. Nothing else is sent or stored:

- no account or user id;
- no device or install id;
- no IP address in the table;
- nothing from the save.

The request goes out with the project's public key only, without the player's session, so the server cannot tell who sent it. (Supabase's own gateway logs see the request like any other web request; the table never does.)

| Step            | Reached when                                          |
| --------------- | ----------------------------------------------------- |
| `gate`          | A new visitor saw the welcome page (once per browser) |
| `start`         | A new company started                                 |
| `firstBody`     | The first car body was made                           |
| `engineFactory` | An Engine Factory was built                           |
| `assemblyPlant` | An Assembly Plant was built                           |
| `firstCar`      | The first car came off the line                       |
| `firstSale`     | A dealer sold the first car                           |
| `min30`         | 30 minutes of play                                    |
| `zone2`         | A second district was opened                          |
| `research`      | The first research was done                           |
| `hour3`         | 3 hours of play                                       |
| `racing`        | The Racing District was opened                        |
| `day1`          | The player came back on a later day                   |
| `day7`          | The player came back a week or more after starting    |
| `imperium`      | The first Reset Imperium                              |

The list lives in `src/game/config/funnel.ts` and, on the server, in `analytics.funnel_order()` (`supabase/migrations/0006_funnel_stats.sql`). Change both together.

## Who is counted

- Only companies started after this shipped. A save from before it is marked `legacy` when it loads and never sends anything, so the numbers aren't flooded by existing players.
- Each step is sent once per company. The steps already sent are kept in the save, so a second device with the same cloud save doesn't count again, and neither does starting over with "New game".
- A failed send (offline, server busy) is retried on the next try, every 30 seconds while playing.

## Turning it off

- **Settings → Anonymous statistics** turns it off for that player.
- It is also off in any browser that asks not to be tracked (Do Not Track or Global Privacy Control).

## Reading the report

In the Supabase dashboard, open the **SQL Editor** and run:

```sql
select * from analytics.funnel_report;
```

Each row is a step, in order, with:

- `players`: how many reached it;
- `pct_of_start`: the share of the companies that started;
- `median_minutes`: the median minutes of play to get there;
- `since` and `last`: the dates covered.

The biggest drop between two rows is the step to look at.

To look at a period only, filter the raw rows:

```sql
select step, count(*) from analytics.funnel_steps
where at > now() - interval '30 days'
group by step order by array_position(analytics.funnel_order(), step);
```

## Safety

- **Not reachable from the API:** the table and the report are in the `analytics` schema, which the API does not expose, and nobody but the database owner can read them.
- **One way in:** `public.track_step()` accepts only names from the list and caps minutes at a year. It turns requests away once 600 steps arrived in the last minute (a flood, not players).
- **Clean test calls:** `ping` answers without writing anything. The live check (`scripts/cloud-e2e.mjs`) uses `ping` and an unknown step, so CI never adds rows.
- **Old rows:** to keep less history, delete old rows from the SQL Editor, for example:

  ```sql
  delete from analytics.funnel_steps where at < now() - interval '180 days';
  ```
