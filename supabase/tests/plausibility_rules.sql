-- The plausibility record of cloud saves (migration 0031), checked inside one transaction that is rolled
-- back: a save that earns too much too fast is written down and still saved; an ordinary one leaves no
-- trace; players can't read the record; the dashboard function is for admins only.
--
-- Within one transaction the server's clock doesn't move, so every save here is "0 seconds" after the
-- one before: the limit is the early-game allowance ($1M) over what the save before it said.

begin;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('ad03200d-0000-4000-8000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-test-0031@example.invalid', false, now(), now()),
  ('ad03200a-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'player-test-0031@example.invalid', false, now(), now());
insert into ops.admins (user_id) values ('ad03200d-0000-4000-8000-0000000000ad');

do $test$
declare
  adm constant uuid := 'ad03200d-0000-4000-8000-0000000000ad';
  p constant uuid := 'ad03200a-0000-4000-8000-00000000000a';
  n int;
  j jsonb;
  rev bigint;
  failed boolean;
begin
  -- a first save: nothing before it to compare with, nothing recorded
  insert into public.game_saves (user_id, data, save_version, device)
  values (p, '{"lifetime": {"moneyEarned": 1000}}'::jsonb, 9, 'test');
  select count(*) into n from ops.save_flags where user_id = p;
  if n <> 0 then raise exception 'FAIL a first save is not compared'; end if;

  -- an ordinary save (a little more earned): nothing recorded
  update public.game_saves set data = '{"lifetime": {"moneyEarned": 500000}}'::jsonb where user_id = p;
  select count(*) into n from ops.save_flags where user_id = p;
  if n <> 0 then raise exception 'FAIL an ordinary save leaves no trace'; end if;

  -- a save claiming billions at once: recorded, and still saved as it was
  update public.game_saves set data = '{"lifetime": {"moneyEarned": 9e12}}'::jsonb where user_id = p;
  select revision into rev from public.game_saves where user_id = p;
  select count(*) into n from ops.save_flags where user_id = p;
  if n <> 1 then raise exception 'FAIL a runaway save is recorded once, got %', n; end if;
  if (select (data -> 'lifetime' ->> 'moneyEarned')::numeric from public.game_saves where user_id = p) <> 9e12 then
    raise exception 'FAIL the save is stored as it was sent';
  end if;
  if not exists (select 1 from ops.save_flags f where f.user_id = p and f.revision = rev and f.claimed = 9e12 and f.previous = 500000 and f.allowed = 1500000) then
    raise exception 'FAIL what the record says: %', (select to_jsonb(f) from ops.save_flags f where f.user_id = p);
  end if;

  -- a save with garbage in the number still saves, and records nothing
  update public.game_saves set data = '{"lifetime": {"moneyEarned": "lots"}}'::jsonb where user_id = p;
  update public.game_saves set data = '{}'::jsonb where user_id = p;
  select count(*) into n from ops.save_flags where user_id = p;
  if n <> 1 then raise exception 'FAIL garbage records nothing, got %', n; end if;

  -- at most 20 are kept for a player
  for i in 1..30 loop
    update public.game_saves set data = jsonb_build_object('lifetime', jsonb_build_object('moneyEarned', 0)) where user_id = p;
    update public.game_saves set data = jsonb_build_object('lifetime', jsonb_build_object('moneyEarned', 1e12 + i)) where user_id = p;
  end loop;
  select count(*) into n from ops.save_flags where user_id = p;
  if n <> 20 then raise exception 'FAIL 20 kept, got %', n; end if;

  -- a player reads neither the table nor the function
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  set local role authenticated;
  failed := false;
  begin perform 1 from ops.save_flags; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL a player reads the table'; end if;
  failed := false;
  begin perform public.admin_save_flags(30); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL a player calls the dashboard function'; end if;
  reset role;

  -- an admin reads it, with the player's name
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  j := public.admin_save_flags(30);
  if jsonb_array_length(j) <> 20 or (j -> 0 ->> 'user_id') <> p::text then raise exception 'FAIL the admin reads the record: %', j; end if;
  reset role;

  -- the record goes with the account
  delete from auth.users where id = p;
  select count(*) into n from ops.save_flags where user_id = p;
  if n <> 0 then raise exception 'FAIL the record goes with the account'; end if;

  raise notice 'plausibility_rules: all checks passed';
end;
$test$;

rollback;
