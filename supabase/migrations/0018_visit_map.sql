-- Visits in 3D: the empire card also says what stands where on the island,
-- so a visitor can look round a friend's empire on the map (engine/visit.ts).
-- It is what the card already shows (each building's type and level) with its
-- lot, plus the districts and territories open, the dealerships owned and
-- whether the Racing District is built. Nothing else of the save leaves it,
-- and visit_empire still shows only listed players' cards.

create or replace function public.empire_card(d jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $fn$
  select jsonb_build_object(
    'plants', coalesce((
      select jsonb_agg(p order by p->>'type')
      from (
        select jsonb_build_object(
          'type', left(b.value->>'type', 32),
          'level', least(15, greatest(1, floor(public.save_number(b.value->'level'))::int))
        ) as p
        from jsonb_each(case when jsonb_typeof(d->'city'->'buildings') = 'object' then d->'city'->'buildings' else '{}'::jsonb end) b
        where jsonb_typeof(b.value) = 'object' and b.value ? 'plant' and jsonb_typeof(b.value->'type') = 'string'
        limit 60
      ) plants
    ), '[]'::jsonb),
    'zones', case when jsonb_typeof(d->'city'->'zones') = 'array' then least(jsonb_array_length(d->'city'->'zones'), 20) else 0 end,
    'rep', floor(public.save_number(d->'racing'->'rep')),
    'races', floor(public.save_number(d->'racing'->'stats'->'races')),
    'wins', floor(public.save_number(d->'racing'->'stats'->'wins')),
    'resets', floor(least(public.save_number(d->'imperiumCount'), 10000)),
    'map', jsonb_build_object(
      -- every building: [lot, type, level, a garage's specialization]
      'b', coalesce((
        select jsonb_agg(jsonb_build_array(
          b.key,
          left(b.value->>'type', 32),
          least(15, greatest(1, floor(public.save_number(b.value->'level'))::int)),
          coalesce(left(b.value->'garage'->>'spec', 16), '')
        ) order by b.key)
        from (
          select key, value
          from jsonb_each(case when jsonb_typeof(d->'city'->'buildings') = 'object' then d->'city'->'buildings' else '{}'::jsonb end)
          where jsonb_typeof(value) = 'object' and jsonb_typeof(value->'type') = 'string' and key ~ '^[A-Za-z0-9:_-]{1,32}$'
          limit 150
        ) b
      ), '[]'::jsonb),
      'z', coalesce((
        select jsonb_agg(left(z.value #>> '{}', 24))
        from (
          select value from jsonb_array_elements(case when jsonb_typeof(d->'city'->'zones') = 'array' then d->'city'->'zones' else '[]'::jsonb end)
          where jsonb_typeof(value) = 'string'
          limit 20
        ) z
      ), '[]'::jsonb),
      't', coalesce((
        select jsonb_agg(left(t.value #>> '{}', 24))
        from (
          select value from jsonb_array_elements(case when jsonb_typeof(d->'city'->'territories') = 'array' then d->'city'->'territories' else '[]'::jsonb end)
          where jsonb_typeof(value) = 'string'
          limit 20
        ) t
      ), '[]'::jsonb),
      'd', coalesce((
        select jsonb_agg(left(k.key, 16))
        from (
          select key from jsonb_each(case when jsonb_typeof(d->'dealers') = 'object' then d->'dealers' else '{}'::jsonb end)
          where jsonb_typeof(value) = 'object' and value->'owned' = 'true'::jsonb
          limit 12
        ) k
      ), '[]'::jsonb),
      'r', coalesce(d->'racing'->'unlocked' = 'true'::jsonb, false)
    )
  );
$fn$;

revoke all on function public.empire_card(jsonb) from public, anon, authenticated;

-- the cards already published: drawn again from their saves, so visits in 3D
-- work at once (the next save of each player would do it too)
update public.empires e
set card = public.empire_card(g.data)
from public.game_saves g
where g.user_id = e.user_id;
