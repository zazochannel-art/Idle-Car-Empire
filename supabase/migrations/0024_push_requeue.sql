-- Push notes that Firebase didn't take for a passing reason (no connection, busy, down, asked
-- to slow down) go back in the queue for the next run, instead of being lost as sent
-- (functions/push/lib.ts). A note still expires 24 hours after it was queued (push_take).
-- Run once in the SQL editor, after 0016 (numbered 0024: 0023 is the funnel's end).

create or replace function public.push_requeue(p_tokens text[], p_kinds text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce(array_length(p_tokens, 1), 0) <> coalesce(array_length(p_kinds, 1), 0) then
    raise exception 'push_requeue: tokens and kinds differ in length';
  end if;
  update ops.push_queue q
  set done_at = null, sent = false
  from unnest(coalesce(p_tokens, '{}'), coalesce(p_kinds, '{}')) as n(token, kind)
  join ops.push_tokens t on t.token = n.token
  where q.user_id = t.user_id and q.kind = n.kind and q.sent and q.done_at is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.push_requeue(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_requeue(text[], text[]) to service_role;
