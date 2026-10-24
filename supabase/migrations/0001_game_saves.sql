-- Cloud saves for Idle Car Empire. One row per (anonymous or real) user.
-- Enable "Anonymous sign-ins" in Supabase Auth settings for this to work.
create table if not exists public.game_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  saved_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

create policy "Players read their own save"
  on public.game_saves for select
  using ((select auth.uid()) = user_id);

create policy "Players create their own save"
  on public.game_saves for insert
  with check ((select auth.uid()) = user_id);

create policy "Players update their own save"
  on public.game_saves for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Players delete their own save"
  on public.game_saves for delete
  using ((select auth.uid()) = user_id);
