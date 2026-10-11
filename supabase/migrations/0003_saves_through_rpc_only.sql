-- Apply once the client that saves through save_game() is live (it replaces
-- the direct table writes of the first cloud-save client).
--
-- From here on a save can only be written through save_game(), which checks
-- the revision: no client can overwrite newer progress without seeing a
-- conflict first. Players can still read and delete their own save.

drop policy if exists "Players create their own save" on public.game_saves;
drop policy if exists "Players update their own save" on public.game_saves;
revoke insert, update on public.game_saves from anon, authenticated;

-- the first client's own timestamp, replaced by the server's updated_at
create or replace function public.game_saves_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.revision := 1;
  else
    new.revision := old.revision + 1;
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

alter table public.game_saves drop column if exists saved_at;
