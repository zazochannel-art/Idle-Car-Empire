-- A player can delete one of their own cloud backups from the Profile (0011 keeps them in
-- ops.save_backups, which the API does not expose). Only the signed-in player's own backup
-- goes; another player's, or one that is already gone, deletes nothing.

create or replace function public.delete_my_backup(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  delete from ops.save_backups b where b.id = p_id and b.user_id = uid;
  return found;
end;
$$;
revoke all on function public.delete_my_backup(bigint) from public, anon;
grant execute on function public.delete_my_backup(bigint) to authenticated;
