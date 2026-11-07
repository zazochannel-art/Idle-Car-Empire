-- The premium pass (src/game/config/iap.ts "pass"): the season pass's premium track, bought again
-- every season (a consumable product on Google Play, consumed once the game has given it). The
-- purchases check (supabase/functions/iap) keeps it in the ledger like the other two products.
-- Run after 0022_purchases.sql.
alter table ops.purchases drop constraint if exists purchases_product_check;
alter table ops.purchases add constraint purchases_product_check check (product in ('starter', 'adFree', 'pass'));
