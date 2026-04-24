-- Migration 161: Link integrity + purchases.creator_id snapshot
--
-- Goals
--   1. Prevent the "paid link with no content" class of bugs by enforcing at
--      the DB level that every non-support link has either storage_path or a
--      link_media row.
--   2. Stop losing purchase history when a creator deletes a link: change
--      purchases.link_id FK from CASCADE to SET NULL, and snapshot creator_id
--      directly on `purchases` so the revenue ledger survives.
--   3. Clean up the 30 orphan draft/published links (none have sales).
--
-- This fixes the "Ass and tities bouncing" case (link published without content
-- uploaded) and the cascade-delete wipeouts seen on Sen08, star, misa, etc.

BEGIN;

-- ── A. purchases.creator_id snapshot ──────────────────────────────────
-- Denormalized for two reasons:
--   a) survive `links` deletions without breaking the revenue ledger,
--   b) let admin_user_metrics filter by pu.creator_id directly (no JOIN).

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS creator_id uuid;

UPDATE public.purchases pu
SET creator_id = l.creator_id
FROM public.links l
WHERE pu.link_id = l.id
  AND pu.creator_id IS NULL;

-- Every purchase row must be attributable to a creator going forward.
ALTER TABLE public.purchases
  ALTER COLUMN creator_id SET NOT NULL;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_purchases_creator_id ON public.purchases(creator_id);

-- BEFORE INSERT trigger: populate creator_id from links if caller forgot it.
CREATE OR REPLACE FUNCTION public.purchases_set_creator_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.creator_id IS NULL AND NEW.link_id IS NOT NULL THEN
    SELECT creator_id INTO NEW.creator_id FROM public.links WHERE id = NEW.link_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS purchases_set_creator_id_trg ON public.purchases;
CREATE TRIGGER purchases_set_creator_id_trg
  BEFORE INSERT ON public.purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.purchases_set_creator_id();

-- ── B. Flip purchases.link_id FK to SET NULL ──────────────────────────
-- Historical purchases must survive when a creator deletes a link.
-- creator_id stays (snapshot), link_id becomes NULL.

ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_link_id_fkey;

ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_link_id_fkey
  FOREIGN KEY (link_id) REFERENCES public.links(id) ON DELETE SET NULL;

-- link_id is no longer required at insert time for a purchase to be meaningful,
-- but the app still sets it — keep NOT NULL off so SET NULL works.
ALTER TABLE public.purchases
  ALTER COLUMN link_id DROP NOT NULL;

-- ── C. Block non-support links without content ────────────────────────
-- CHECK constraints can't reference other tables, so enforce via trigger.
-- Rule: a link with is_support_link = false MUST have either a non-null
-- storage_path OR at least one link_media row. Applies on INSERT and on
-- any UPDATE that changes the content fields, is_support_link, or status.

CREATE OR REPLACE FUNCTION public.links_require_content()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  has_media boolean;
BEGIN
  IF COALESCE(NEW.is_support_link, false) = true THEN
    RETURN NEW;
  END IF;

  IF NEW.storage_path IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.link_media WHERE link_id = NEW.id)
    INTO has_media;

  IF has_media THEN
    RETURN NEW;
  END IF;

  -- Allow drafts to exist without content so the editor can progressively save.
  IF COALESCE(NEW.status, 'draft') = 'draft' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Link % cannot be published without content (storage_path or link_media)', NEW.id
    USING ERRCODE = 'check_violation',
          HINT = 'Upload a file or attach a library asset before publishing.';
END;
$$;

DROP TRIGGER IF EXISTS links_require_content_trg ON public.links;
CREATE TRIGGER links_require_content_trg
  BEFORE INSERT OR UPDATE OF status, is_support_link, storage_path ON public.links
  FOR EACH ROW
  EXECUTE FUNCTION public.links_require_content();

-- ── D. Clean up the 30 existing orphan links ──────────────────────────
-- None have succeeded sales (verified before migration). Drafts + 2 published
-- with no attached file. link_media rows are CASCADE-removed automatically.

DELETE FROM public.links
WHERE COALESCE(is_support_link, false) = false
  AND storage_path IS NULL
  AND NOT EXISTS(SELECT 1 FROM public.link_media lm WHERE lm.link_id = id)
  AND NOT EXISTS(SELECT 1 FROM public.purchases pu
                 WHERE pu.link_id = id AND pu.status = 'succeeded');

COMMIT;
