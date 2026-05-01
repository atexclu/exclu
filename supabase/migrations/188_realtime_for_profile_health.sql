-- supabase/migrations/188_realtime_for_profile_health.sql
--
-- Enables Supabase Realtime (Postgres logical replication) for the three
-- tables consumed by useProfileHealth() so the sidebar Profile Health card
-- updates live as the creator edits their profile, links, or feed.
--
-- Why this matters
--   Without these tables in the `supabase_realtime` publication, the channel
--   subscriptions in useProfileHealth fire no events — the percent stays
--   frozen even when the creator clears their bio, deletes a link, etc.
--   The card can ONLY refresh on a hard reload, which is broken UX.
--
-- Replica identity
--   `creator_profiles` is filtered by `id` (primary key), so DEFAULT replica
--   identity is enough for postgres_changes filtering.
--   `links` and `assets` are filtered by `profile_id` (a non-PK column), so
--   they need REPLICA IDENTITY FULL — otherwise Supabase can't match the
--   filter on UPDATE/DELETE events (the old row image lacks profile_id).
--
-- Cost
--   FULL replica identity logs the entire row on every UPDATE. These tables
--   have row counts and write rates well within Supabase realtime budgets;
--   creators only mutate their own rows. RLS already scopes everything.

ALTER PUBLICATION supabase_realtime ADD TABLE public.creator_profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;

ALTER TABLE public.links REPLICA IDENTITY FULL;
ALTER TABLE public.assets REPLICA IDENTITY FULL;
