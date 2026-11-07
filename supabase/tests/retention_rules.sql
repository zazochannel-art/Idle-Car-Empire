-- What the server keeps and for how long (migration 0028), inside one transaction that is rolled
-- back: old rows go, recent ones and anything still in use stay; players can't call it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at) values
  ('f1000000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  ('f2000000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

do $test$
declare
  a constant uuid := 'f1000000-0000-4000-8000-00000000000f';
  b constant uuid := 'f2000000-0000-4000-8000-00000000000f';
  r jsonb;
  n int;
  failed boolean;
begin
  insert into analytics.funnel_steps (step, minutes, at) values ('gate', 0, now() - interval '500 days'), ('gate', 0, now());
  insert into analytics.client_errors (kind, message, day, first_at, last_at) values
    ('error', 'retention test old', current_date - 120, now() - interval '120 days', now() - interval '120 days'),
    ('error', 'retention test new', current_date, now(), now());
  insert into ops.push_queue (user_id, kind, queued_at, done_at, sent) values
    (a, 'gift', now() - interval '40 days', now() - interval '40 days', true),
    (b, 'gift', now(), null, false);
  insert into public.gifts (from_user, to_user, day, claimed) values
    (a, b, current_date - 90, true), (b, a, current_date - 90, false), (a, b, current_date, true);

  r := ops.prune_old_data();
  if (r->>'funnel_steps')::int < 1 or (r->>'client_errors')::int < 1 or (r->>'push_queue')::int < 1 or (r->>'gifts')::int < 1 then
    raise exception 'FAIL old rows pruned: %', r;
  end if;
  select count(*) into n from analytics.client_errors where message = 'retention test new';
  if n <> 1 then raise exception 'FAIL a recent error kept'; end if;
  select count(*) into n from ops.push_queue where user_id = b;
  if n <> 1 then raise exception 'FAIL a waiting note kept'; end if;
  select count(*) into n from public.gifts where (from_user = b and not claimed) or day = current_date;
  if n <> 2 then raise exception 'FAIL an unclaimed gift and today''s kept (%)', n; end if;

  -- a player can't run it
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  failed := false;
  begin
    perform ops.prune_old_data();
  exception when others then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL a player ran the pruning'; end if;

  raise notice 'all retention checks passed';
end;
$test$;

rollback;
