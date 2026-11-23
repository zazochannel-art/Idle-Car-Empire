-- The invite reward rule of migration 0036, checked inside one transaction that is rolled back:
-- a friend's reward is due only for a new player whose account is 2 hours old and whose save has
-- a car and 15 minutes of play.

begin;

insert into auth.users (id, instance_id, aud, role, email, is_anonymous, created_at, updated_at)
values
  ('1a036001-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inviter-0036@example.invalid', false, now() - interval '5 days', now()),
  ('1a036002-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null, true, now(), now());

do $test$
declare
  inviter constant uuid := '1a036001-0000-4000-8000-000000000001';
  guest constant uuid := '1a036002-0000-4000-8000-000000000002';
  n int;
begin
  insert into ops.invites (invitee, inviter) values (guest, inviter);
  insert into public.game_saves (user_id, data, save_version, device)
  values (guest, '{"lifetime": {"carsProduced": 3, "playTime": 3600}}'::jsonb, 9, 'test');

  -- a car and an hour of play, but the account was made a moment ago: not due
  select count(*) into n from ops.invites_due(inviter);
  if n <> 0 then raise exception 'FAIL a new account is not due, got %', n; end if;

  -- two hours later: due
  update auth.users set created_at = now() - interval '3 hours' where id = guest;
  select count(*) into n from ops.invites_due(inviter);
  if n <> 1 then raise exception 'FAIL an account of 3 hours with a car and an hour is due, got %', n; end if;

  -- too little play: not due
  update public.game_saves set data = '{"lifetime": {"carsProduced": 3, "playTime": 600}}'::jsonb where user_id = guest;
  select count(*) into n from ops.invites_due(inviter);
  if n <> 0 then raise exception 'FAIL 10 minutes of play is not due, got %', n; end if;

  -- no car: not due
  update public.game_saves set data = '{"lifetime": {"carsProduced": 0, "playTime": 3600}}'::jsonb where user_id = guest;
  select count(*) into n from ops.invites_due(inviter);
  if n <> 0 then raise exception 'FAIL no car is not due, got %', n; end if;

  -- no play time at all in the save (an old save): not due
  update public.game_saves set data = '{"lifetime": {"carsProduced": 3}}'::jsonb where user_id = guest;
  select count(*) into n from ops.invites_due(inviter);
  if n <> 0 then raise exception 'FAIL a save without play time is not due, got %', n; end if;

  -- enough of everything, and the reward is taken once
  update public.game_saves set data = '{"lifetime": {"carsProduced": 3, "playTime": 1200}}'::jsonb where user_id = guest;
  perform set_config('request.jwt.claims', json_build_object('sub', inviter, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select public.claim_invite_rewards() into n;
  if n <> 1 then raise exception 'FAIL one reward taken, got %', n; end if;
  select public.claim_invite_rewards() into n;
  if n <> 0 then raise exception 'FAIL the same reward is not taken twice, got %', n; end if;
  reset role;

  raise notice 'invite_guard_rules: all checks passed';
end;
$test$;

rollback;
