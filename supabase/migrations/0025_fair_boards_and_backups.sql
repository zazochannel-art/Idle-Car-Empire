-- Fairer boards and safer backups (the technical audit of 7 November 2026).
--   - The board's plausibility check (0004) let one save jump 2^40 times over after a day
--     away. A save may now grow the board's total at most 16 times over, however long since
--     the last; steady play still allows doubling every 30 minutes, as before. The board
--     never goes lower, and a legitimate total catches up with the next saves.
--   - Backups for a drop in earnings (0011) could push out every automatic backup; they now
--     keep to 4 of the 12 places.
--   - A save is at most 1 MB (it was 4 MB).
-- Run once in the SQL editor, after 0024.

create or replace function public.game_saves_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  d jsonb := new.data;
  claimed numeric := public.save_number(d->'lifetime'->'moneyEarned');
  claimed_cars numeric := public.save_number(d->'lifetime'->'carsProduced');
  prev public.empires%rowtype;
  wk date := (date_trunc('week', now()))::date;
  elapsed numeric;
  v_earned numeric;
  v_cars numeric;
begin
  select * into prev from public.empires e where e.user_id = new.user_id;
  if not found then
    -- a first card: no history to measure against, so a modest start
    v_earned := least(claimed, 1e7);
    v_cars := least(claimed_cars, 5000);
    insert into public.empires (user_id, earned, week_start, week_base, cars, stars, company, card, updated_at)
    values (new.user_id, v_earned, wk, v_earned, v_cars, least(public.save_number(d->'stars'), 1000)::int,
            left(coalesce(d->'brand'->>'name', ''), 40), public.empire_card(d), now());
    return new;
  end if;
  elapsed := greatest(0, extract(epoch from now() - prev.updated_at));
  -- at most doubling every 30 minutes on the server's clock, and at most 16 times over in one save
  -- however long since the last (+ $20K/s and $1M for the early game); never lower
  v_earned := greatest(prev.earned, least(claimed, prev.earned * power(2::numeric, least(elapsed / 1800, 4)) + 2e4 * elapsed + 1e6));
  v_cars := greatest(prev.cars, least(claimed_cars, prev.cars + 20 * elapsed + 1000));
  update public.empires e set
    earned = v_earned,
    week_base = case when e.week_start <> wk then prev.earned else e.week_base end,
    week_start = wk,
    cars = v_cars,
    stars = least(public.save_number(d->'stars'), 1000)::int,
    company = left(coalesce(d->'brand'->>'name', ''), 40),
    card = public.empire_card(d),
    updated_at = now()
  where e.user_id = new.user_id;
  return new;
end;
$fn$;

create or replace function ops.keep_backup(p_user uuid, p_data jsonb, p_version integer, p_revision bigint, p_device text, p_reason text, p_spare bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  place smallint;
begin
  -- backups for a drop in earnings take at most 4 of the 12 places: a run of them (a save
  -- going up and down) replaces its own oldest, never the automatic ones
  if p_reason = 'drop' and (select count(*) from ops.save_backups b where b.user_id = p_user and b.reason = 'drop') >= 4 then
    select b.slot into place from ops.save_backups b
    where b.user_id = p_user and b.reason = 'drop' and b.id is distinct from p_spare
    order by b.made_at, b.id limit 1;
  end if;
  if place is null then
    select s into place from generate_series(0, ops.backup_keep() - 1) s
    where not exists (select 1 from ops.save_backups b where b.user_id = p_user and b.slot = s)
    order by s limit 1;
  end if;
  if place is null then
    select b.slot into place from ops.save_backups b
    where b.user_id = p_user and b.id is distinct from p_spare
    order by b.made_at, b.id limit 1;
  end if;
  insert into ops.save_backups as t (user_id, slot, data, save_version, revision, device, reason, made_at)
  values (p_user, place, p_data, p_version, p_revision, left(p_device, 64), p_reason, now())
  on conflict (user_id, slot) do update
    set id = default, data = excluded.data, save_version = excluded.save_version, revision = excluded.revision,
        device = excluded.device, reason = excluded.reason, made_at = excluded.made_at;
end;
$$;

-- a save is at most 1 MB: save_game checks it before anything is written
create or replace function public.save_size_ok()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if octet_length(new.data::text) > 1000000 then
    raise exception 'save too large' using errcode = '54000';
  end if;
  return new;
end;
$fn$;
revoke all on function public.save_size_ok() from public, anon, authenticated;
create or replace trigger game_saves_size before insert or update of data on public.game_saves
  for each row execute function public.save_size_ok();
