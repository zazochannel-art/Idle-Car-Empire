-- Access rules and save conflicts, checked inside one transaction that is
-- rolled back: two players A and B (made up here, never committed), each
-- acting as the "authenticated" role with their own JWT, the way PostgREST
-- runs their requests. Any failed check raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

insert into auth.users (id, instance_id, aud, role, is_anonymous, created_at, updated_at)
values
  ('a0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now()),
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', true, now(), now());

do $test$
declare
  a constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  b constant uuid := 'b0000000-0000-4000-8000-00000000000b';
  res record;
  n int;
  failed boolean;
begin
  -- every new player gets a profile
  if (select count(*) from public.profiles where id in (a, b)) <> 2 then
    raise exception 'FAIL profiles created by the sign-up trigger';
  end if;

  -- ── player A ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select * into res from public.save_game('{"cash": 100, "createdAt": 1}'::jsonb, 3, 0, 'pc');
  if not res.ok or res.revision <> 1 then raise exception 'FAIL A first save: %', res; end if;

  select * into res from public.save_game('{"cash": 200, "createdAt": 1}'::jsonb, 3, 1, 'pc');
  if not res.ok or res.revision <> 2 then raise exception 'FAIL A second save: %', res; end if;

  -- a session still at revision 1 (another device) must not overwrite revision 2
  select * into res from public.save_game('{"cash": 999, "createdAt": 1}'::jsonb, 3, 1, 'phone');
  if res.ok or res.revision <> 2 then raise exception 'FAIL stale save rejected: %', res; end if;

  -- a client with an older save format must not overwrite a newer one
  select * into res from public.save_game('{"cash": 5}'::jsonb, 2, 2, 'old');
  if res.ok then raise exception 'FAIL older format rejected'; end if;

  -- a first save (base 0) on an existing save is a conflict, not an overwrite
  select * into res from public.save_game('{"cash": 1}'::jsonb, 3, 0, 'new');
  if res.ok or res.revision <> 2 then raise exception 'FAIL base-0 conflict: %', res; end if;

  select * into res from public.load_game();
  if (res.data->>'cash')::int <> 200 or res.revision <> 2 or res.server_now is null then
    raise exception 'FAIL A load: %', res;
  end if;

  -- invalid saves
  failed := false;
  begin
    perform public.save_game('[1,2]'::jsonb, 3, 2, 'pc');
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL non-object save rejected'; end if;

  -- A changes their name; the name is unique (any case)
  update public.profiles set username = 'Alice Motors' where id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL A renames'; end if;

  -- A cannot touch columns other than name and avatar
  failed := false;
  begin
    update public.profiles set created_at = now() - interval '1 year' where id = a;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL created_at is read-only'; end if;

  -- ── player B ──
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- B sees neither A's save nor A's profile
  select count(*) into n from public.game_saves where user_id = a;
  if n <> 0 then raise exception 'FAIL B reads A''s save'; end if;
  select count(*) into n from public.profiles where id = a;
  if n <> 0 then raise exception 'FAIL B reads A''s profile'; end if;

  -- B starts empty
  select * into res from public.load_game();
  if res.data is not null or res.revision <> 0 then raise exception 'FAIL B starts empty: %', res; end if;

  -- B cannot change A's profile, and cannot take A's name
  update public.profiles set username = 'Hacked' where id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B renames A'; end if;
  failed := false;
  begin
    update public.profiles set username = 'alice motors' where id = b;
  exception when unique_violation then failed := true;
  end;
  if not failed then raise exception 'FAIL names are unique'; end if;

  -- B cannot write A's save directly, even naming A's id
  update public.game_saves set data = '{"cash": 1}'::jsonb where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B updates A''s save'; end if;
  failed := false;
  begin
    insert into public.game_saves (user_id, data) values (a, '{"cash": 1}'::jsonb);
  exception when others then failed := true;
  end;
  if not failed then raise exception 'FAIL B inserts a save for A'; end if;

  -- B's own save goes to B, whatever B sends
  select * into res from public.save_game('{"cash": 7}'::jsonb, 3, 0, 'pc');
  if not res.ok or res.revision <> 1 then raise exception 'FAIL B first save: %', res; end if;

  reset role;
  if (select (data->>'cash')::int from public.game_saves where user_id = a) <> 200 then
    raise exception 'FAIL A''s save unchanged after B';
  end if;
  if (select (data->>'cash')::int from public.game_saves where user_id = b) <> 7 then
    raise exception 'FAIL B''s save stored';
  end if;

  -- signed out (anon) gets nothing
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  failed := false;
  begin
    perform public.load_game();
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon cannot load'; end if;
  failed := false;
  begin
    perform count(*) from public.game_saves;
  exception when insufficient_privilege then failed := true;
  end;
  if not failed then raise exception 'FAIL anon cannot read saves'; end if;
  reset role;
end;
$test$;

select 'all access checks passed' as result;

rollback;
