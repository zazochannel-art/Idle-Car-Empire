-- Indexes for deleting accounts and moderating (the technical audit of 7 November 2026):
-- deleting a player removes their reports and cup entries through foreign keys, which read
-- these columns; without an index each delete reads the whole table.
-- Run once in the SQL editor, after 0025.

create index if not exists player_reports_target_idx on public.player_reports (target) where target is not null;
create index if not exists player_reports_alliance_idx on public.player_reports (alliance) where alliance is not null;
create index if not exists cup_entries_user_idx on ops.cup_entries (user_id);
