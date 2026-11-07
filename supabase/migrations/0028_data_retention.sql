-- How long the server keeps what it no longer needs (audit P3). Players' saves, profiles, cards,
-- purchases and their backups are kept while the account exists (deleting the account deletes
-- them, 0001-0022); what follows is the rest, kept only as long as it is any use:
--
--   analytics.funnel_steps, analytics.play_days   400 days (a year of retention, and its cohorts)
--   analytics.client_errors                       90 days after an error was last seen
--   ops.push_queue (done)                         30 days
--   ops.player_commands (taken or cancelled)      180 days
--   public.gifts (claimed)                        60 days (the dashboard counts the last 30)
--   ops.admin_log                                 2 years (who did what in the dashboard)
--
-- ops.prune_old_data() deletes it and says how much. Run it by hand in the SQL Editor, or once a
-- day with pg_cron (docs/data-retention.md):
--   select cron.schedule('prune', '17 3 * * *', $$ select ops.prune_old_data() $$);

create or replace function ops.prune_old_data() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  out jsonb := '{}'::jsonb;
  n bigint;
begin
  delete from analytics.funnel_steps where at < now() - interval '400 days';
  get diagnostics n = row_count; out := out || jsonb_build_object('funnel_steps', n);
  delete from analytics.play_days where day < (now() at time zone 'utc')::date - 400;
  get diagnostics n = row_count; out := out || jsonb_build_object('play_days', n);
  delete from analytics.client_errors where last_at < now() - interval '90 days';
  get diagnostics n = row_count; out := out || jsonb_build_object('client_errors', n);
  delete from ops.push_queue where done_at is not null and done_at < now() - interval '30 days';
  get diagnostics n = row_count; out := out || jsonb_build_object('push_queue', n);
  delete from ops.player_commands where coalesce(claimed_at, cancelled_at) < now() - interval '180 days';
  get diagnostics n = row_count; out := out || jsonb_build_object('player_commands', n);
  delete from public.gifts where claimed and day < (now() at time zone 'utc')::date - 60;
  get diagnostics n = row_count; out := out || jsonb_build_object('gifts', n);
  delete from ops.admin_log where at < now() - interval '2 years';
  get diagnostics n = row_count; out := out || jsonb_build_object('admin_log', n);
  return out;
end;
$$;
revoke all on function ops.prune_old_data() from public, anon, authenticated;
