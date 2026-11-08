-- The economy knobs (migration 0030), checked inside one transaction that is rolled back: the
-- owner's numbers reach the public function, stay inside their range, and the table itself is
-- closed to players. Any failed check raises an exception naming it.
--
-- Run in the Supabase SQL editor (or psql) as the postgres role.

begin;

do $test$
declare
  j jsonb;
  failed boolean;
begin
  delete from ops.balance;
  if public.live_balance() <> '{}'::jsonb then raise exception 'FAIL empty means all as built'; end if;

  insert into ops.balance (key, value) values ('rewards', 0.9), ('usedSell', 1.1), ('qc', 2);
  j := public.live_balance();
  if (j ->> 'rewards')::numeric <> 0.9 or (j ->> 'usedSell')::numeric <> 1.1 or (j ->> 'qc')::numeric <> 2 then raise exception 'FAIL knobs read back: %', j; end if;

  -- outside the range, or not a knob
  failed := false;
  begin insert into ops.balance (key, value) values ('rewards', 3); exception when check_violation then failed := true; end;
  if not failed then raise exception 'FAIL rewards past 2'; end if;
  failed := false;
  begin update ops.balance set value = 0.4 where key = 'qc'; exception when check_violation then failed := true; end;
  if not failed then raise exception 'FAIL qc under 0.5'; end if;
  failed := false;
  begin update ops.balance set value = 1.5 where key = 'usedSell'; exception when check_violation then failed := true; end;
  if not failed then raise exception 'FAIL usedSell past 1.25'; end if;
  failed := false;
  begin insert into ops.balance (key, value) values ('cash', 1); exception when check_violation then failed := true; end;
  if not failed then raise exception 'FAIL unknown knob'; end if;

  -- a player (or anyone) reads the numbers through the function, not the table
  set local role anon;
  if (public.live_balance() ->> 'rewards')::numeric <> 0.9 then raise exception 'FAIL anon reads the function'; end if;
  failed := false;
  begin perform 1 from ops.balance; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL anon reads the table'; end if;
  failed := false;
  begin delete from ops.balance; exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL anon writes the table'; end if;
  reset role;
  set local role authenticated;
  failed := false;
  begin insert into ops.balance (key, value) values ('rewards', 1); exception when insufficient_privilege then failed := true; end;
  if not failed then raise exception 'FAIL authenticated writes the table'; end if;
  reset role;
end
$test$;

select 'balance rules passed';

rollback;
