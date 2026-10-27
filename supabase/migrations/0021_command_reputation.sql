-- The dashboard can also change a player's reputation (0020's commands for a player's game):
-- the company's (0–100, 50 neutral: car prices move with it, and it drifts back to 50) or the
-- racing team's (whole points: it opens circuits, sponsors and cars). Like every command, the
-- player's own game carries it out (engine/team.ts); the player card shows both today.

-- 'rep': {which: company|racing, mode: add|set, amount}
alter table ops.player_commands drop constraint if exists player_commands_kind_check;
alter table ops.player_commands add constraint player_commands_kind_check
  check (kind in ('cash', 'stars', 'company', 'restore', 'message', 'rep'));

/**
 * Queues a command for a player's game. 'ok'; 'unknown' (no such player); 'invalid' (the kind, the
 * amount, the name, the backup or the note isn't right); 'blocked' (a company name the name check
 * refuses); 'limit' (20 waiting already).
 */
create or replace function public.admin_send_command(p_user uuid, p_kind text, p_payload jsonb, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in jsonb := coalesce(p_payload, '{}'::jsonb);
  v_payload jsonb;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_mode text;
  v_amount numeric;
  v_which text;
  v_name text;
  v_made timestamptz;
  v_id bigint;
begin
  perform ops.must_be_admin();
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    return 'unknown';
  end if;
  if jsonb_typeof(v_in) is distinct from 'object' or (v_note is not null and (char_length(v_note) > 200 or v_note ~ '[[:cntrl:]]')) then
    return 'invalid';
  end if;
  v_mode := v_in ->> 'mode';
  if p_kind in ('cash', 'stars', 'rep') then
    if jsonb_typeof(v_in -> 'amount') is distinct from 'number' or v_mode is null or v_mode not in ('add', 'set') then
      return 'invalid';
    end if;
    v_amount := (v_in ->> 'amount')::numeric;
    if abs(v_amount) > 1e30 or (v_mode = 'set' and v_amount < 0) or (v_mode = 'add' and v_amount = 0)
       or (p_kind = 'stars' and (v_amount <> trunc(v_amount) or abs(v_amount) > 1e9)) then
      return 'invalid';
    end if;
    v_payload := jsonb_build_object('mode', v_mode, 'amount', v_amount);
    if p_kind = 'cash' then
      if coalesce(v_in ->> 'city', 'here') not in ('here', 'home', 'north') then
        return 'invalid';
      end if;
      v_payload := v_payload || jsonb_build_object('city', coalesce(v_in ->> 'city', 'here'));
    elsif p_kind = 'rep' then
      v_which := v_in ->> 'which';
      -- the company's: 0–100; the racing team's: whole points
      if v_which is null or v_which not in ('company', 'racing')
         or (v_which = 'company' and abs(v_amount) > 100)
         or (v_which = 'racing' and (v_amount <> trunc(v_amount) or abs(v_amount) > 1e9)) then
        return 'invalid';
      end if;
      v_payload := v_payload || jsonb_build_object('which', v_which);
    end if;
  elsif p_kind = 'company' then
    v_name := btrim(coalesce(v_in ->> 'name', ''));
    if char_length(v_name) not between 1 and 24 or v_name ~ '[[:cntrl:]]' then
      return 'invalid';
    end if;
    if not public.name_is_clean(v_name) then
      return 'blocked';
    end if;
    v_payload := jsonb_build_object('name', v_name);
  elsif p_kind = 'restore' then
    if jsonb_typeof(v_in -> 'backup') is distinct from 'number' then
      return 'invalid';
    end if;
    select b.made_at into v_made from ops.save_backups b where b.id = (v_in ->> 'backup')::bigint and b.user_id = p_user;
    if v_made is null then
      return 'invalid';
    end if;
    v_payload := jsonb_build_object('backup', (v_in ->> 'backup')::bigint, 'made_at', v_made);
  elsif p_kind = 'message' then
    if v_note is null then
      return 'invalid';
    end if;
    v_payload := '{}'::jsonb;
  else
    return 'invalid';
  end if;
  if (select count(*) from ops.player_commands c where c.user_id = p_user and c.claimed_at is null and c.cancelled_at is null) >= 20 then
    return 'limit';
  end if;
  insert into ops.player_commands (user_id, kind, payload, note, created_by)
  values (p_user, p_kind, v_payload, v_note, auth.uid())
  returning id into v_id;
  perform ops.log('command.' || p_kind, p_user, v_payload || jsonb_build_object('command', v_id, 'note', v_note));
  return 'ok';
end;
$$;

/** The player card (0020), its save with both reputations too. */
create or replace function public.admin_player(p_user uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  u auth.users%rowtype;
  g public.game_saves%rowtype;
  v_save jsonb;
  v_home jsonb;
  v_north jsonb;
begin
  perform ops.must_be_admin();
  select * into u from auth.users x where x.id = p_user;
  if not found then
    return null;
  end if;
  select * into g from public.game_saves s where s.user_id = p_user;
  if found then
    v_home := ops.save_city(g.data, 'home');
    v_north := ops.save_city(g.data, 'north');
    v_save := jsonb_build_object(
      'revision', g.revision, 'updatedAt', g.updated_at, 'device', g.device, 'saveVersion', g.save_version,
      'app', g.data ->> 'appVersion',
      'company', coalesce(g.data -> 'brand' ->> 'name', ''),
      'activeCity', coalesce(g.data ->> 'activeCity', 'home'),
      'cash', jsonb_build_object('home', ops.save_num(v_home, 'cash'), 'north', case when v_north is null then null else ops.save_num(v_north, 'cash') end),
      'plants', jsonb_build_object('home', ops.save_plants(v_home), 'north', case when v_north is null then null else ops.save_plants(v_north) end),
      'territories', ops.save_territories(v_home),
      'earned', ops.save_earned(g.data),
      'cars', ops.save_num(g.data, 'lifetime', 'carsProduced'),
      'stars', ops.save_num(g.data, 'stars'),
      'rp', ops.save_num(g.data, 'rp'),
      'resets', ops.save_num(g.data, 'imperiumCount'),
      'racing', coalesce(g.data -> 'racing' -> 'unlocked' = 'true'::jsonb, false),
      'rep', case when jsonb_typeof(g.data -> 'quality' -> 'rep') = 'number' then (g.data -> 'quality' ->> 'rep')::numeric else 50 end,
      'racingRep', ops.save_num(g.data, 'racing', 'rep'),
      'createdAt', ops.save_num(g.data, 'createdAt'),
      'lastActiveAt', ops.save_num(g.data, 'lastActiveAt'));
  end if;
  return jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'guest', coalesce(u.is_anonymous, false),
    'createdAt', u.created_at,
    'lastSignIn', u.last_sign_in_at,
    'profile', (select jsonb_build_object('username', p.username, 'avatar', p.avatar, 'listed', p.listed, 'banned', p.banned)
                from public.profiles p where p.id = p_user),
    'save', v_save,
    'daysPlayed30', (select count(*) from analytics.play_days d where d.user_id = p_user and d.day > (now() at time zone 'utc')::date - 30),
    'backups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'madeAt', b.made_at, 'reason', b.reason, 'device', b.device, 'saveVersion', b.save_version,
        'company', coalesce(b.data -> 'brand' ->> 'name', ''), 'cash', ops.save_num(b.data, 'cash'),
        'earned', ops.save_earned(b.data), 'plants', ops.save_plants(ops.save_home(b.data))) order by b.made_at desc, b.id desc)
      from ops.save_backups b where b.user_id = p_user
    ), '[]'::jsonb),
    'alliance', (select jsonb_build_object('name', a.name, 'tag', a.tag, 'leader', a.leader = p_user)
                 from public.alliance_members m join public.alliances a on a.id = m.alliance_id where m.user_id = p_user),
    'invites', jsonb_build_object(
      'code', (select k.code from ops.invite_codes k where k.user_id = p_user),
      'friends', (select count(*) from ops.invites i where i.inviter = p_user),
      'usedCode', exists (select 1 from ops.invites i where i.invitee = p_user)),
    'reportsAbout', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'at', r.created_at, 'reason', r.reason, 'status', r.status,
        'seen', concat_ws(' · ', r.seen_name, r.seen_company, r.seen_alliance)) order by r.created_at desc)
      from (select * from public.player_reports y where y.target = p_user order by y.created_at desc limit 10) r
    ), '[]'::jsonb),
    'reportsAboutTotal', (select count(*) from public.player_reports y where y.target = p_user),
    'reportsBy', (select count(*) from public.player_reports y where y.reporter = p_user),
    'commands', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'payload', c.payload, 'note', c.note,
        'createdAt', c.created_at, 'claimedAt', c.claimed_at, 'cancelledAt', c.cancelled_at) order by c.id desc)
      from (select * from ops.player_commands y where y.user_id = p_user order by y.id desc limit 30) c
    ), '[]'::jsonb),
    'log', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.at, 'action', l.action, 'detail', l.detail,
        'admin', (select a.email from auth.users a where a.id = l.admin)) order by l.at desc)
      from (select * from ops.admin_log y where y.target = p_user order by y.at desc limit 30) l
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_send_command(uuid, text, jsonb, text) from public, anon;
grant execute on function public.admin_send_command(uuid, text, jsonb, text) to authenticated;
revoke all on function public.admin_player(uuid) from public, anon;
grant execute on function public.admin_player(uuid) to authenticated;
