-- 155_purge_orphan_invalid_email_users.sql
-- Purge the 4 orphaned creator accounts that were created before the
-- client-side email format check landed (2026-04-10). All four have
-- zero handle / zero links / zero purchases / zero conversations / zero
-- favorites — audited on 2026-04-21 before this migration. They exist
-- only because the user hit Submit before finishing typing the TLD, then
-- retried and created a separate valid-email account.
--
-- Running this via migration because Supabase's Auth admin API
-- (/auth/v1/admin/users/:id) was unavailable (504 gateway timeout) when
-- attempting the purge via CLI. Direct auth.users DELETE inside Postgres
-- cascades all referenced auth.* rows (auth.identities, auth.sessions,
-- auth.refresh_tokens, auth.mfa_factors, auth.one_time_tokens,
-- auth.flow_state) because Supabase defines those FKs with ON DELETE
-- CASCADE. It also cascades our public.profiles via the same pattern.
--
-- Each target has a valid-email counterpart kept intact (the user's
-- real account). Those remain untouched:
--   user4810121719@gmail        ← purged;  no valid twin identified
--   marinterrasson@gmail.c      ← purged;  no valid twin identified
--   dux@me                      ← purged;  no valid twin identified
--   johnsgirl7778@gmail.c0m     ← purged;  no valid twin identified
--
-- If the admin REST API recovers and these users were already deleted
-- during a 504-timed-out DELETE attempt, the WHERE clause below matches
-- zero rows and the migration is a no-op.

delete from auth.users
where id in (
  '14c246ce-c651-44ce-aa78-bf9476f44b26',  -- user4810121719@gmail
  '762f193b-62fd-4999-abfd-fb96c5498fa6',  -- marinterrasson@gmail.c
  '50c483e9-bada-4ad8-9ac7-0fec719bf7cf',  -- dux@me
  '36ff4a86-5974-48ee-a1f1-86917305421c'   -- johnsgirl7778@gmail.c0m
);
