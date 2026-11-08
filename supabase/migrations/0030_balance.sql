-- Economy knobs the game's owner can turn without a new app version.
--
-- The game's money numbers (what rewards pay, what the second-hand lot sells for, what the quality
-- control pays) are in the app. When the first real players show that one is off, the owner
-- changes it here and every player's game picks the new number up the next time it asks
-- live_balance() (at the start, every half hour and when the app comes back, like the scheduled
-- events: src/lib/live-events.ts). Each knob is a multiplier of the game's own number (1 = as
-- built), limited to a narrow range on the server and again in the game
-- (src/game/engine/balance.ts), so a typo can't ruin the economy. No row: the game's own number.
--
-- Change one in the SQL editor, for example:
--   insert into ops.balance (key, value) values ('rewards', 0.9)
--   on conflict (key) do update set value = excluded.value, updated_at = now();
-- and put it back with  delete from ops.balance where key = 'rewards';
--
-- Checked by supabase/tests/balance_rules.sql.

create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.balance (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now(),
  -- the keys of src/game/engine/balance.ts (a test there checks the list matches)
  constraint balance_key check (key in ('rewards', 'usedSell', 'qc')),
  constraint balance_range check (case key when 'usedSell' then value between 0.8 and 1.25 else value between 0.5 and 2 end)
);
alter table ops.balance enable row level security;
revoke all on ops.balance from public, anon, authenticated;

/** The knobs that are set: {"rewards": 0.9, …} (an empty object: all as built). */
create or replace function public.live_balance()
returns jsonb
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(b.key, b.value), '{}'::jsonb) from ops.balance b
$$;
revoke all on function public.live_balance() from public;
grant execute on function public.live_balance() to anon, authenticated;
