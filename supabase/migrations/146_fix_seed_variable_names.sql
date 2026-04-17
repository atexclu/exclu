-- 146_fix_seed_variable_names.sql
-- Phase 6.5 — Corrective migration for 3 transactional seed templates.
--
-- Background: migration 140_transactional_templates_newsletter_style.sql
-- rewrote every seed's html_body to the new white-card newsletter look.
-- In that rewrite, the placeholder names inside the new bodies drifted
-- from the declared variables (migration 132) and from what the edge
-- function callers actually pass at render time. Because renderTemplate
-- silently substitutes unknown placeholders with the empty string
-- (email_templates.ts:42), these templates have been shipping *broken*
-- in production ever since: the links / names were literally replaced
-- by empty strings, and Brevo delivered dead-link emails.
--
-- Mismatches detected by the Phase 6 linter (email_lint.ts):
--   auth_magiclink     body uses {{magic_url}}         → caller passes {{magic_link}}
--   auth_email_change  body uses {{confirmation_url}}  → caller passes {{change_url}}
--   referral_invite    body uses {{inviter_name}}      → caller passes {{sender_name}}
--
-- Fix strategy: idempotent `replace()` on html_body targeted by slug.
-- No schema change. No data loss. Running this migration twice is safe
-- (the second run is a no-op because the placeholder no longer exists).

do $migration_146$
begin
  update public.email_templates
  set html_body = replace(html_body, '{{magic_url}}', '{{magic_link}}'),
      updated_at = now()
  where slug = 'auth_magiclink'
    and html_body like '%{{magic_url}}%';

  update public.email_templates
  set html_body = replace(html_body, '{{confirmation_url}}', '{{change_url}}'),
      updated_at = now()
  where slug = 'auth_email_change'
    and html_body like '%{{confirmation_url}}%';

  update public.email_templates
  set html_body = replace(html_body, '{{inviter_name}}', '{{sender_name}}'),
      updated_at = now()
  where slug = 'referral_invite'
    and html_body like '%{{inviter_name}}%';

  -- Surface what we did so the migration log is self-documenting.
  raise notice '[146] seed placeholder names realigned with declared variables';
end
$migration_146$;
