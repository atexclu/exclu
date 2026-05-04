-- 201_scrub_cardmask_from_payment_events.sql
--
-- Back-fill complement to the forward fix in ugp-confirm/ugp-listener
-- (scrub CardMask + BankMessage from raw_payload, derive IsTestCard
-- before stripping). The 2026-05-04 PCI audit live cross-check found
-- that 115 historical rows of payment_events.raw_payload contained
-- CardMask in the BIN+last4 format (e.g. "448545XXXXXX1400"). PCI DSS
-- 3.4.1 allows storing first6+last4 together, but the merchant
-- guideline #5 from PayBuddy is stricter ("store ONLY token + last 4
-- digits + expiry month/year"). This migration brings historical rows
-- into compliance with the stricter merchant rule.
--
-- For each row that has CardMask, we derive IsTestCard from the BIN
-- before deletion so the audit/reconcile scripts keep working without
-- the BIN. BankMessage is stripped without replacement (no production
-- code reads it).
--
-- This is a back-fill UPDATE on data already in payment_events. RLS is
-- enabled with no permissive policy on this table, so only service_role
-- can run this — which is exactly what `supabase migration apply` uses.

UPDATE payment_events
SET raw_payload = (
  -- Inject IsTestCard flag derived from the existing CardMask BIN
  CASE
    WHEN raw_payload::jsonb ? 'CardMask'
      AND raw_payload->>'CardMask' ~ '^(4242|5555|0000)'
    THEN (raw_payload::jsonb || '{"IsTestCard":"1"}'::jsonb)
    WHEN raw_payload::jsonb ? 'CardMask'
    THEN (raw_payload::jsonb || '{"IsTestCard":"0"}'::jsonb)
    ELSE raw_payload::jsonb
  END
  -- Strip the sensitive keys
  - 'CardMask'
  - 'BankMessage'
)::jsonb
WHERE raw_payload::jsonb ? 'CardMask' OR raw_payload::jsonb ? 'BankMessage';
