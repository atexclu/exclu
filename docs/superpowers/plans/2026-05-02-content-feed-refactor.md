# Content & Feed Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overloaded `is_public` / `is_feed_preview` model with a clean two-axis model (`in_feed` set in Content, `is_public` set in Home/Profile feed) and fix the broken visibility toggle so the creator sees the blur/unblur switch live.

**Architecture:** One DB migration adds `assets.in_feed`, drops `is_feed_preview`, and updates RLS so subs-only feed assets are still readable (DB row + storage). Front: ContentLibrary owns `in_feed` (per-card switch + filters + bulk), PublicContentSection and PostVisibilityToggle own `is_public` (per-card switch only). CreatorPublic fetches `in_feed = true` and lets `isUnlocked = item.isPublic || isSubscribed` (drops the `embed` force-unlock so the creator sees their own blur). Bundles a fix for `fan_subscription_price_cents` propagation: SubscriptionPopup re-fetches the price on open, LinkInBioEditor's auto-save guards against missing `activeProfile.id`.

**Tech Stack:** TypeScript, React, Vite, Supabase (PostgreSQL + RLS + Edge Functions), Vitest.

**Spec:** [`docs/superpowers/specs/2026-05-02-content-feed-refactor-design.md`](../specs/2026-05-02-content-feed-refactor-design.md)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/191_content_feed_refactor.sql` | Schema + RLS migration | Create |
| `src/pages/ContentLibrary.tsx` | Library grid, upload modal, in_feed toggle | Modify |
| `src/components/linkinbio/sections/PublicContentSection.tsx` | Profile → Feed editor | Modify |
| `src/components/feed/PostVisibilityToggle.tsx` | Per-post Public/Subs chip | Modify |
| `src/pages/CreatorPublic.tsx` | Feed fetch + render | Modify |
| `src/components/feed/SubscriptionPopup.tsx` | Fan checkout modal | Modify |
| `src/pages/LinkInBioEditor.tsx` | Auto-save | Modify (defensive guard) |

No new components — every concept lives in an existing file.

---

## Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/191_content_feed_refactor.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Migration 191: Content/Feed two-axis refactor
--
-- Replaces the overloaded is_public / is_feed_preview model on `assets` with
-- a clean two-axis model:
--   - in_feed   : set in /app/content. Asset shows up in the public feed.
--   - is_public : set per-post in /app/home and /app/profile. When TRUE the
--                 post is visible to everyone; when FALSE the post is shown
--                 blurred to non-subscribers.
--
-- Backfill preserves what creators currently see: any asset previously
-- public OR set as the free preview becomes in_feed = TRUE; previously
-- private assets become in_feed = FALSE. is_public keeps its existing
-- values; existing public assets remain unblurred.
--
-- Storage RLS is widened so subscribers can fetch full-res for subs-only
-- feed assets directly via signed URLs (no extra Edge Function needed).

BEGIN;

-- ── 1) Add in_feed column ─────────────────────────────────────────────────
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS in_feed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.assets.in_feed
  IS 'Whether this asset appears on the creator profile feed. Set in /app/content. Defaults FALSE — creators opt in.';

-- ── 2) Backfill from existing flags ───────────────────────────────────────
-- Anything currently visible (is_public OR was the free preview) stays in feed.
UPDATE public.assets
   SET in_feed = true
 WHERE (is_public = true OR is_feed_preview = true)
   AND deleted_at IS NULL
   AND in_feed = false;

-- ── 3) Drop is_feed_preview column + its partial unique indexes ──────────
DROP INDEX IF EXISTS public.uniq_feed_preview_per_profile;
DROP INDEX IF EXISTS public.uniq_feed_preview_per_creator_legacy;

ALTER TABLE public.assets
  DROP COLUMN IF EXISTS is_feed_preview;

-- ── 4) Replace is_public-based public read policy with in_feed-based ──────
-- The DB row is readable when the asset is in feed; storage access is
-- gated separately below. This lets fans receive blur path / mime / caption
-- regardless of public/subs status, while full-res storage stays gated.
DROP POLICY IF EXISTS "public_assets_read" ON public.assets;
CREATE POLICY "public_assets_read" ON public.assets
  FOR SELECT
  USING (in_feed = true AND deleted_at IS NULL);

-- ── 5) Storage policy: allow reads for public OR subscribed ───────────────
-- Replaces the migration 064 policy which gated only on is_public.
DROP POLICY IF EXISTS "public_content_read" ON storage.objects;
CREATE POLICY "public_content_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'paid-content'
    AND EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.storage_path = storage.objects.name
        AND a.in_feed = true
        AND a.deleted_at IS NULL
        AND (
          a.is_public = true
          OR EXISTS (
            SELECT 1 FROM public.fan_creator_subscriptions s
            WHERE s.fan_id = auth.uid()
              AND s.status = 'active'
              AND s.period_end > now()
              AND (
                (a.profile_id IS NOT NULL AND s.creator_profile_id = a.profile_id)
                OR (a.profile_id IS NULL AND s.creator_user_id = a.creator_id)
              )
          )
        )
    )
  );

-- ── 6) Update feed-ordering helper index to reference in_feed ─────────────
DROP INDEX IF EXISTS public.idx_assets_profile_feed;
CREATE INDEX idx_assets_profile_feed
  ON public.assets (profile_id, in_feed, created_at DESC)
  WHERE deleted_at IS NULL;

COMMIT;
```

- [ ] **Step 2: Apply locally and verify**

Run:
```bash
supabase db reset
```

Expected: migrations replay cleanly, no errors.

Verify with these SQL queries (use the Supabase SQL editor or `psql`):

```sql
-- 6a. in_feed column exists, default false
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'assets' AND column_name IN ('in_feed', 'is_public', 'is_feed_preview');
-- Expected: in_feed (boolean, false, NO), is_public (boolean), is_feed_preview NOT in result.

-- 6b. backfill correct on a fresh DB with seed data (manual smoke test)
INSERT INTO public.assets (id, creator_id, storage_path, mime_type, is_public)
VALUES (gen_random_uuid(), '<your-test-user-uuid>', 'test/path', 'image/jpeg', true);
-- After re-running migration, the seed row should have in_feed=true.

-- 6c. RLS policies updated
SELECT policyname, qual FROM pg_policies WHERE tablename = 'assets' AND policyname = 'public_assets_read';
-- Expected qual contains: in_feed = true AND deleted_at IS NULL

SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_content_read';
-- Expected: 1 row.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/191_content_feed_refactor.sql
git commit -m "feat(db): migration 191 — content/feed two-axis refactor

Adds assets.in_feed, drops is_feed_preview, repoints RLS to in_feed,
extends storage policy to allow signed reads for active subscribers."
```

---

## Task 2: ContentLibrary — strip caption + visibility from upload modal

**Files:**
- Modify: `src/pages/ContentLibrary.tsx` (lines 41-46, 252-322, 528-555)

- [ ] **Step 1: Remove the upload-modal feed-related state and form fields**

In `src/pages/ContentLibrary.tsx`:

Replace the state block at lines 41-46 with:

```tsx
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<LibraryAsset | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [feedFilter, setFeedFilter] = useState<'all' | 'in_feed' | 'not_in_feed'>('all');
```

(Removes `isPublic`, `feedCaption`, renames `visibilityFilter`.)

In the upload handler (`handleAssetUpload`, around lines 252-302), remove the blur generation block (lines 252-273) and update the insert payload:

```tsx
        const { data: inserted, error: insertError } = await supabase
          .from('assets')
          .insert({
            id: assetId,
            creator_id: user.id,
            profile_id: activeProfile?.id || null,
            title: assetTitle.trim() || null,
            storage_path: objectName,
            mime_type: file.type || rawFile.type || null,
            in_feed: false,
            is_public: false,
            feed_caption: null,
            feed_blur_path: null,
          })
          .select('id, title, created_at, storage_path, mime_type, in_feed, is_public, feed_caption, feed_blur_path')
          .single();
```

(Drops `is_feed_preview` from the insert and the select, swaps `is_public: isPublic` for `is_public: false, in_feed: false`. The blur is generated lazily by PublicContentSection's `ensureBlurForAsset` when the creator flips `in_feed=true`.)

Inside `closeUploadModal` (line 324), drop the `setIsPublic(false)` and `setFeedCaption('')` calls; keep the rest.

Inside `handleAssetUpload` after success (lines 306-315), drop `setIsPublic(true)` and `setFeedCaption('')`.

In the JSX of the upload modal (lines 528-555), delete the entire "Show in my feed" switch container and the feed-caption block:

```tsx
                  <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Show in my feed</p>
                      ...
                    </div>
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                  </div>

                  {isPublic && (
                    <div className="space-y-1">
                      ...
                    </div>
                  )}
```

→ deleted.

- [ ] **Step 2: Update the LibraryAsset type and fetch query**

Replace the `LibraryAsset` type at lines 16-27:

```tsx
type LibraryAsset = {
  id: string;
  title: string | null;
  created_at: string;
  storage_path: string;
  mime_type: string | null;
  previewUrl?: string | null;
  in_feed: boolean;
  is_public: boolean;
  feed_caption: string | null;
  feed_blur_path: string | null;
};
```

Update the fetch select (line 81):

```tsx
      const assetsQuery = supabase
        .from('assets')
        .select('id, title, created_at, storage_path, mime_type, in_feed, is_public, feed_caption, feed_blur_path')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds. If TS errors point at `is_feed_preview` references in this file, double-check both the insert and the select were updated. Other files will still have references — they'll be cleaned up in their own tasks.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ContentLibrary.tsx
git commit -m "refactor(content): strip feed visibility + caption from upload modal

Uploads now insert in_feed=false, is_public=false. Caption and feed
visibility move to Profile → Feed and Home → Feed."
```

---

## Task 3: ContentLibrary — replace `is_public` with `in_feed` in filter / bulk actions

**Files:**
- Modify: `src/pages/ContentLibrary.tsx` (lines 336-431, 600-720)

- [ ] **Step 1: Rename / update mutators**

In `src/pages/ContentLibrary.tsx`:

Rename `handleToggleVisibility` (lines 336-354) to `handleToggleInFeed` and update both reads and writes:

```tsx
  const handleToggleInFeed = async (assetId: string, currentInFeed: boolean) => {
    const newInFeed = !currentInFeed;

    // Optimistic update first so the UI responds instantly.
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, in_feed: newInFeed } : asset,
      ),
    );

    // Persist; if it fails, roll back.
    const { error } = await supabase
      .from('assets')
      .update({ in_feed: newInFeed })
      .eq('id', assetId);

    if (error) {
      console.error('Error updating in_feed', error);
      toast.error('Failed to update feed visibility');
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === assetId ? { ...asset, in_feed: currentInFeed } : asset,
        ),
      );
    }
  };
```

Rename `handleBulkVisibilityChange` (lines 377-397) to `handleBulkInFeedChange`:

```tsx
  const handleBulkInFeedChange = async (makeInFeed: boolean) => {
    const assetIds = Array.from(selectedAssets);
    if (assetIds.length === 0) return;

    const { error } = await supabase
      .from('assets')
      .update({ in_feed: makeInFeed })
      .in('id', assetIds);

    if (error) {
      console.error('Error updating bulk in_feed', error);
      toast.error('Failed to update feed visibility');
      return;
    }

    setAssets((prev) =>
      prev.map((asset) =>
        assetIds.includes(asset.id) ? { ...asset, in_feed: makeInFeed } : asset,
      ),
    );
    setSelectedAssets(new Set());
    toast.success(`${assetIds.length} content${assetIds.length > 1 ? 's' : ''} ${makeInFeed ? 'added to' : 'removed from'} your feed.`);
  };
```

Replace `getFilteredAssets` (lines 427-431) so it uses `in_feed`:

```tsx
  const getFilteredAssets = () => {
    if (feedFilter === 'all') return assets;
    if (feedFilter === 'in_feed') return assets.filter((a) => a.in_feed);
    return assets.filter((a) => !a.in_feed);
  };
```

- [ ] **Step 2: Update the filter pills**

Replace the visibility filter pill block at lines 607-638 with:

```tsx
                    <div className="inline-flex rounded-full border border-exclu-arsenic/60 bg-exclu-ink/80 p-0.5 text-[11px] text-exclu-space/80">
                      <button
                        onClick={() => setFeedFilter('all')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all ${feedFilter === 'all'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFeedFilter('in_feed')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all flex items-center gap-1 ${feedFilter === 'in_feed'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        <Eye className="w-3 h-3" />
                        In feed
                      </button>
                      <button
                        onClick={() => setFeedFilter('not_in_feed')}
                        className={`px-4 py-1.5 rounded-full font-medium transition-all flex items-center gap-1 ${feedFilter === 'not_in_feed'
                          ? 'bg-primary text-white dark:text-black shadow-sm'
                          : 'hover:text-exclu-cloud'
                          }`}
                      >
                        <EyeOff className="w-3 h-3" />
                        Not in feed
                      </button>
                    </div>
```

- [ ] **Step 3: Update the bulk action buttons**

In the bulk-action toolbar (around lines 670-690), replace the `Make public` and `Make private` buttons:

```tsx
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBulkInFeedChange(true)}
                      className="rounded-full text-xs h-8"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Add to feed
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBulkInFeedChange(false)}
                      className="rounded-full text-xs h-8"
                    >
                      <EyeOff className="w-3 h-3 mr-1" />
                      Remove from feed
                    </Button>
```

- [ ] **Step 4: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds. There should be no remaining references to `visibilityFilter`, `handleToggleVisibility`, `handleBulkVisibilityChange`, or `is_public`-keyed filters in this file.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ContentLibrary.tsx
git commit -m "refactor(content): switch filter + bulk actions to in_feed axis"
```

---

## Task 4: ContentLibrary — per-card In feed switch

**Files:**
- Modify: `src/pages/ContentLibrary.tsx` (lines 723-794)

- [ ] **Step 1: Add the per-card switch overlay**

In the asset grid (the `{getFilteredAssets().map(...)}` loop, lines 724-794), add a switch overlay positioned at the bottom-right of each card. Insert this block right before the closing `</button>` of the asset card (around line 792, after the bottom text overlay div):

```tsx
                        {/* In-feed switch — bottom-right, stops propagation so
                            the click doesn't open the preview modal. */}
                        <div
                          className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-white/85">
                            {asset.in_feed ? 'In feed' : 'Hidden'}
                          </span>
                          <Switch
                            checked={asset.in_feed}
                            onCheckedChange={() => handleToggleInFeed(asset.id, asset.in_feed)}
                            aria-label={asset.in_feed ? 'Remove from feed' : 'Add to feed'}
                          />
                        </div>
```

The asset card outer element is already `relative` (parent `<div className={...} key={asset.id}>` carries its own `relative` because of the existing top-left checkbox). If TS complains about `<Switch>` import, the import already exists at line 7.

- [ ] **Step 2: Verify it compiles + visual check**

Run:
```bash
npm run dev
```

Open `http://localhost:8080/app/content`. Expected:
- Each card shows the bottom-right pill with "Hidden" / "In feed" label and a switch.
- Toggling the switch flips the label, doesn't open the preview modal, and (because of the optimistic update) feels instant. Refreshing the page preserves the new state.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ContentLibrary.tsx
git commit -m "feat(content): per-card in_feed switch on each library card"
```

---

## Task 5: PublicContentSection — fetch only `in_feed = true`, drop in_feed switch + Set-as-free button

**Files:**
- Modify: `src/components/linkinbio/sections/PublicContentSection.tsx`

- [ ] **Step 1: Update fetch + types**

In `src/components/linkinbio/sections/PublicContentSection.tsx`:

Replace the `PublicContent` interface (lines 26-36):

```tsx
interface PublicContent {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  in_feed: boolean;
  is_public: boolean;
  feed_caption: string | null;
  feed_blur_path: string | null;
  previewUrl?: string;
}
```

Update `fetchContents` query (around line 200):

```tsx
    const assetsQuery = supabase
      .from('assets')
      .select('id, title, storage_path, mime_type, in_feed, is_public, feed_caption, feed_blur_path, created_at')
      .eq('in_feed', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
```

(Adds `.eq('in_feed', true)`, drops `is_feed_preview` from the column list.)

- [ ] **Step 2: Update SortableItem props**

Replace the `SortableItemProps` interface (lines 45-52):

```tsx
interface SortableItemProps {
  content: PublicContent;
  onToggleIsPublic: (id: string, isPublic: boolean) => void;
  onCaptionChange: (id: string, caption: string) => void;
  isSelected: boolean;
  onSelect: (id: string) => void;
}
```

(Drops `onToggle` (the in_feed switch) and `onSetPreview`, renames the visibility callback.)

- [ ] **Step 3: Replace SortableItem markup**

Replace the right-hand controls block (lines 122-151) — the current "In feed" switch + free-preview button — with a single Public/Subs switch:

```tsx
        {/* Public / Subs switch — bottom-right of the card row. */}
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/70 dark:text-white/70">
            {content.is_public ? (
              <><Globe className="h-3 w-3 text-[#4a6304] dark:text-[#CFFF16]" /> Public</>
            ) : (
              <><Lock className="h-3 w-3" /> Subs only</>
            )}
          </span>
          <Switch
            checked={content.is_public}
            onCheckedChange={(checked) => onToggleIsPublic(content.id, checked)}
            aria-label={content.is_public ? 'Make subscribers-only' : 'Make public'}
          />
        </div>
```

Add the `Globe`, `Lock` imports to the existing lucide-react import at line 2:

```tsx
import { Eye, EyeOff, GripVertical, CheckSquare, Square, Image as ImageIcon, ArrowUpRight, Globe, Lock } from 'lucide-react';
```

(Note: `Eye`/`EyeOff` are still used by the bulk-actions toolbar — keep them.)

Delete the orange "Free" badge in the thumbnail (lines 115-119):

```tsx
          {content.is_feed_preview && content.is_public && (
            <div className="absolute top-1 left-1 ...">Free</div>
          )}
```

→ deleted.

The opacity dim on `!content.is_public` (line 79) — change it to dim subs-only posts subtly so the creator can scan their public-vs-subs distribution at a glance:

```tsx
      className={`group relative rounded-2xl border p-3 transition-colors ${
        isDragging ? 'ring-2 ring-[#CFFF16] shadow-xl' : 'hover:border-[#CFFF16]/40'
      } ${isSelected ? 'border-[#CFFF16]/50 bg-[#CFFF16]/5' : 'border-black/5 dark:border-white/10 bg-white dark:bg-[#0a0a10]'}`}
```

(Drops the `!content.is_public` opacity-75 — it's now meaningful for everyone.)

The empty-state textarea (the bottom row at lines 154-170) — drop the `content.is_public` ternary, always render the textarea since every item in this section is in-feed:

```tsx
      <div className="mt-3">
        <textarea
          defaultValue={content.feed_caption ?? ''}
          onBlur={(e) => onCaptionChange(content.id, e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Write a caption for this post…"
          className="w-full resize-none rounded-lg border border-black/5 dark:border-white/10 bg-foreground/[0.02] dark:bg-white/[0.03] px-3 py-2 text-sm text-foreground dark:text-white placeholder:text-foreground/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#CFFF16]/40"
        />
      </div>
```

- [ ] **Step 4: Replace the visibility mutator + drop set-preview**

Replace `handleToggleVisibility` (lines 369-415) with a new `handleToggleIsPublic`:

```tsx
  const handleToggleIsPublic = async (contentId: string, isPublic: boolean) => {
    setIsUpdating(true);

    // Optimistic local update.
    const previous = contents;
    setContents((prev) =>
      prev.map((c) => (c.id === contentId ? { ...c, is_public: isPublic } : c)),
    );
    // Notify the parent so the mobile preview re-renders with the new state.
    onContentUpdate?.();

    const { error } = await supabase
      .from('assets')
      .update({ is_public: isPublic })
      .eq('id', contentId);

    if (error) {
      console.error('Error updating asset is_public', error);
      toast.error('Failed to update visibility');
      setContents(previous);
      setIsUpdating(false);
      return;
    }

    onUpdate();
    onContentUpdate?.();
    setIsUpdating(false);
  };
```

Delete the entire `handleSetPreview` function (lines 423-460) — the Set-as-free flow is gone.

- [ ] **Step 5: Update SortableItem call site**

Find the `<SortableItem>` JSX inside the SortableContext map (around line 607) and replace its props:

```tsx
                {contents.map((content) => (
                  <SortableItem
                    key={content.id}
                    content={content}
                    onToggleIsPublic={handleToggleIsPublic}
                    onCaptionChange={handleCaptionChange}
                    isSelected={selectedIds.includes(content.id)}
                    onSelect={handleSelectContent}
                  />
                ))}
```

(Drops `onToggle` and `onSetPreview`.)

- [ ] **Step 6: Move the blur backfill trigger**

In `fetchContents` (around lines 267-274), the existing backfill loop reads `c.is_public && !c.feed_blur_path`. Change it to backfill any in-feed asset (since blur is now needed for both public and subs-only):

```tsx
    const missingBlur = visible.filter(
      (c) => c.in_feed && !c.feed_blur_path && c.storage_path,
    );
```

Inside the `handleToggleIsPublic` body, drop the existing `if (isPublic) { ... ensureBlurForAsset ... }` branch — the blur is already guaranteed by the upstream `fetchContents` backfill (or by Task 6, the in_feed flip in ContentLibrary which we'll handle there).

- [ ] **Step 7: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds. Lingering errors will most likely be in `CreatorPublic.tsx` (next task) — not this file.

- [ ] **Step 8: Commit**

```bash
git add src/components/linkinbio/sections/PublicContentSection.tsx
git commit -m "refactor(profile): replace in_feed switch + 'Set as free' button with Public/Subs toggle"
```

---

## Task 6: PublicContentSection — backfill blur on in_feed flip in ContentLibrary

**Files:**
- Modify: `src/pages/ContentLibrary.tsx` (the `handleToggleInFeed` from Task 3)

- [ ] **Step 1: Generate the blur thumbnail when an asset enters the feed**

Currently the blur thumbnail is generated lazily in PublicContentSection. But the user can also flip `in_feed=true` directly in ContentLibrary, so the blur must be generated there too. Add an `ensureBlurForAsset`-equivalent inline (the helper already exists in PublicContentSection but isn't exported).

In `src/pages/ContentLibrary.tsx`, add a helper function above `handleToggleInFeed` (around line 336):

```tsx
  // Lazy: when an asset enters the feed, make sure its server-side blur
  // thumbnail exists. Subs-only posts use this thumbnail as the locked
  // preview shown to non-subscribers, so we always need one.
  const ensureBlurForAsset = async (asset: LibraryAsset): Promise<string | null> => {
    if (asset.feed_blur_path || !asset.storage_path) return asset.feed_blur_path ?? null;
    try {
      const signedUrl = await getSignedUrl(asset.storage_path, 60);
      if (!signedUrl) return null;
      const res = await fetch(signedUrl);
      if (!res.ok) return null;
      const blob = await res.blob();
      const mime = asset.mime_type ?? blob.type ?? 'image/jpeg';
      const file = new File([blob], `source-${asset.id}`, { type: mime });
      const blurBlob = await generateBlurThumbnail(file);
      if (!blurBlob) return null;

      const BUCKET_PREFIX = 'paid-content/';
      const relative = asset.storage_path.startsWith(BUCKET_PREFIX)
        ? asset.storage_path.slice(BUCKET_PREFIX.length)
        : asset.storage_path;
      const [ownerId] = relative.split('/');
      if (!ownerId) return null;
      const blurPath = `${ownerId}/assets/${asset.id}/preview/blur.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from('paid-content')
        .upload(blurPath, blurBlob, { cacheControl: '31536000', upsert: true, contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;
      await supabase.from('assets').update({ feed_blur_path: blurPath }).eq('id', asset.id);
      return blurPath;
    } catch (err) {
      console.warn('[ContentLibrary] Unable to generate blur preview', err);
      return null;
    }
  };
```

Update `handleToggleInFeed` from Task 3 — when flipping ON, kick off the backfill:

```tsx
  const handleToggleInFeed = async (assetId: string, currentInFeed: boolean) => {
    const newInFeed = !currentInFeed;

    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId ? { ...asset, in_feed: newInFeed } : asset,
      ),
    );

    const { error } = await supabase
      .from('assets')
      .update({ in_feed: newInFeed })
      .eq('id', assetId);

    if (error) {
      console.error('Error updating in_feed', error);
      toast.error('Failed to update feed visibility');
      setAssets((prev) =>
        prev.map((asset) =>
          asset.id === assetId ? { ...asset, in_feed: currentInFeed } : asset,
        ),
      );
      return;
    }

    if (newInFeed) {
      const target = assets.find((a) => a.id === assetId);
      if (target && !target.feed_blur_path) {
        ensureBlurForAsset(target).then((blurPath) => {
          if (blurPath) {
            setAssets((prev) =>
              prev.map((a) => (a.id === assetId ? { ...a, feed_blur_path: blurPath } : a)),
            );
          }
        });
      }
    }
  };
```

Same treatment for `handleBulkInFeedChange` (after the successful update, fire-and-forget the backfill loop):

```tsx
    if (makeInFeed) {
      assets
        .filter((a) => assetIds.includes(a.id) && !a.feed_blur_path)
        .forEach((asset) => {
          ensureBlurForAsset(asset).then((blurPath) => {
            if (blurPath) {
              setAssets((prev) =>
                prev.map((a) => (a.id === asset.id ? { ...a, feed_blur_path: blurPath } : a)),
              );
            }
          });
        });
    }
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds. The `getSignedUrl` and `generateBlurThumbnail` imports already exist at the top of ContentLibrary.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ContentLibrary.tsx
git commit -m "feat(content): generate blur thumbnail when an asset enters the feed"
```

---

## Task 7: PostVisibilityToggle — drop the `is_feed_preview` side-effect

**Files:**
- Modify: `src/components/feed/PostVisibilityToggle.tsx` (lines 60-78)

- [ ] **Step 1: Strip the now-dead column write**

In `src/components/feed/PostVisibilityToggle.tsx`, replace the `handleChange` body (lines 55-78) with:

```tsx
  const handleChange = async (next: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    onChange(next); // optimistic

    const table = kind === 'asset' ? 'assets' : 'links';
    const { error } = await supabase.from(table).update({ is_public: next }).eq('id', postId);

    if (error) {
      console.error(`[PostVisibilityToggle] update ${table} failed`, error);
      onChange(!next); // rollback
      toast.error('Failed to update visibility');
    } else {
      toast.success(next ? 'Post is now public' : 'Post is now subscribers-only');
    }
    setIsSaving(false);
  };
```

(Drops the `kind === 'asset' && !next` branch that was clearing `is_feed_preview`.)

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/feed/PostVisibilityToggle.tsx
git commit -m "refactor(feed): drop is_feed_preview side-effect from visibility toggle"
```

---

## Task 8: CreatorPublic — fetch using `in_feed`, fix blur logic, drop `isPreview`

**Files:**
- Modify: `src/pages/CreatorPublic.tsx`

This is the core fix. The creator preview currently force-unlocks every post (`embed || ...`); we drop that so the creator sees the same blur/unblur fans see, with the toggle driving the visual flip live.

- [ ] **Step 1: Update FeedItem type**

Replace the asset arm of `FeedItem` (lines 66-78) — drop `isPreview`:

```tsx
type FeedItem =
  | {
      kind: 'asset';
      id: string;
      previewUrl: string | null;
      blurUrl: string | null;
      storagePath: string;
      mimeType: string | null;
      caption: string | null;
      isPublic: boolean;
      createdAt: string;
    }
  | {
      kind: 'link';
      id: string;
      slug: string;
      title: string;
      description: string | null;
      priceCents: number;
      coverUrl: string | null;
      isPublic: boolean;
      createdAt: string;
    };
```

- [ ] **Step 2: Update fetch query**

Around line 540-555, in the assets fetch, replace the `is_public` filter with `in_feed`, and drop `is_feed_preview` from the select + the order:

```tsx
        let assetsQuery = supabase
          .from('assets')
          .select('id, title, storage_path, mime_type, feed_caption, feed_blur_path, is_public, in_feed, created_at')
          .eq('profile_id', profileData.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false });

        if (!embed) {
          assetsQuery = assetsQuery.eq('in_feed', true);
        }
```

The `embed === true` branch (creator's own preview) keeps loading every asset including non-feed ones, so the creator can verify which are in the feed. We just don't render non-feed assets in the feed list — see Step 3.

- [ ] **Step 3: Update feed-item builder**

In the `useEffect` that builds `feedItems` (around line 639-683), update the asset mapper to filter to in-feed and drop `isPreview`:

```tsx
    const assetItems: FeedItem[] = (publicContent as any[])
      .filter((a) => a.in_feed === true)
      .map((a) => ({
        kind: 'asset',
        id: a.id,
        previewUrl: a.previewUrl ?? null,
        blurUrl: a.blurUrl ?? null,
        storagePath: a.storage_path ?? '',
        mimeType: a.mime_type ?? null,
        caption: a.feed_caption ?? null,
        isPublic: a.is_public !== false,
        createdAt: a.created_at ?? new Date().toISOString(),
      }));
```

Replace the preview-then-rest sort (lines 674-682) with a single sort:

```tsx
    const allItems: FeedItem[] = [...assetItems, ...postItems];
    const sorted = allItems.sort((a, b) => {
      const ai = orderIndex.has(a.id) ? (orderIndex.get(a.id) as number) : Infinity;
      const bi = orderIndex.has(b.id) ? (orderIndex.get(b.id) as number) : Infinity;
      if (ai !== bi) return ai - bi;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
    setFeedItems(sorted);
```

- [ ] **Step 4: Fix `isUnlocked` (mobile branch)**

Around line 1466, replace:

```tsx
                                isUnlocked: embed || item.isPreview || item.isPublic || isSubscribed,
```

with:

```tsx
                                isUnlocked: item.isPublic || isSubscribed,
```

- [ ] **Step 5: Fix `isUnlocked` (desktop branch)**

Around line 1984 (the second `<FeedPost>` instance for the desktop layout), replace the same line with the same code. Both branches must read the same condition.

- [ ] **Step 6: Fix lazy full-res signing**

Around line 728-734, replace:

```tsx
      const targets = feedItems.filter(
        (item): item is Extract<FeedItem, { kind: 'asset' }> =>
          item.kind === 'asset' &&
          !item.previewUrl &&
          (embed || item.isPreview || item.isPublic || isSubscribed) &&
          !!item.storagePath,
      );
```

with:

```tsx
      const targets = feedItems.filter(
        (item): item is Extract<FeedItem, { kind: 'asset' }> =>
          item.kind === 'asset' &&
          !item.previewUrl &&
          (item.isPublic || isSubscribed) &&
          !!item.storagePath,
      );
```

(Drop the `embed` and `isPreview` conditions. The creator now sees the same view as a fan; if they need full-res they open the asset in `/app/content`.)

- [ ] **Step 7: Drop `is_feed_preview` from `setItemVisibility`**

`setItemVisibility` (lines 154-161) doesn't reference `is_feed_preview`. No change required — verify this is true after the type update.

- [ ] **Step 8: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds. Any remaining `is_feed_preview` reference will surface here as a TS error — search and remove.

```bash
grep -n "is_feed_preview\|isPreview" src/pages/CreatorPublic.tsx
```

Expected: 0 matches.

- [ ] **Step 9: Manual smoke test**

Run:
```bash
npm run dev
```

As a creator with at least one in-feed asset:
1. Open `/app/home` → the post should show as **blurred** if it's currently `is_public=false`. (Previously the creator always saw it unblurred.)
2. Toggle the chip to "Public" → the post re-renders unblurred immediately.
3. Toggle back to "Subs" → blurred again.
4. Open the same `/:handle` in an incognito tab → matches the embed view (blurred for non-subs).
5. Subscribe to that creator from a fan account → all in-feed assets show unblurred.

If the blur path is missing (legacy assets), the locked card will fall back to the radial gradient — fine, the post is still locked.

- [ ] **Step 10: Commit**

```bash
git add src/pages/CreatorPublic.tsx
git commit -m "fix(feed): drop embed force-unlock so creator sees blur switch live

Fetch uses in_feed; isUnlocked is item.isPublic || isSubscribed in
both embed and public modes. Toggling the Public/Subs chip now produces
an immediate visual change in the creator's preview."
```

---

## Task 9: SubscriptionPopup — re-fetch fresh price on open

**Files:**
- Modify: `src/components/feed/SubscriptionPopup.tsx`

- [ ] **Step 1: Add live price state + fetch**

In `src/components/feed/SubscriptionPopup.tsx`, after the existing `useState` block (around lines 39-42), add:

```tsx
  // Live price loaded the moment the popup opens. Falls back to the prop
  // (parent's snapshot) until the SELECT returns. This avoids charging the
  // fan a different amount than what's displayed when the creator updates
  // the price from another tab/session.
  const [livePriceCents, setLivePriceCents] = useState<number>(creator.priceCents);
```

In the existing `useEffect(open)` block (lines 45-69), add a side-fetch for the price, immediately after the `getGeoCountry` call:

```tsx
    (async () => {
      const { data } = await supabase
        .from('creator_profiles')
        .select('fan_subscription_price_cents')
        .eq('id', creator.profileId)
        .maybeSingle();
      if (cancelled) return;
      const fresh = data?.fan_subscription_price_cents;
      if (typeof fresh === 'number' && fresh > 0) {
        setLivePriceCents(fresh);
      }
    })();
```

- [ ] **Step 2: Use livePriceCents in the JSX**

Replace `creator.priceCents` references in the JSX (lines 174, 206) with `livePriceCents`:

```tsx
                    ${(livePriceCents / 100).toFixed(2)}
                  </span>
                  <span className="text-sm text-white/60">/ month</span>
```

```tsx
                Subscribe for ${(livePriceCents / 100).toFixed(2)}/mo
```

- [ ] **Step 3: Reset livePriceCents when the popup re-opens for a different creator**

At the top of the same `useEffect`, prefix:

```tsx
    setLivePriceCents(creator.priceCents);
```

(Otherwise switching creators while the popup is mounted would briefly show the previous creator's price.)

- [ ] **Step 4: Verify it compiles + smoke test**

Run:
```bash
npm run dev
```

As a fan:
1. Open the public profile of a creator with `fan_subscription_enabled = true`.
2. Open `/app/profile` (Feed section) in another tab as the creator. Change the monthly price from $X to $Y. Wait for the auto-save toast.
3. Click "Subscribe to view" on the fan tab → the modal should display **$Y/month** (not the cached $X). Refresh-less.
4. Click Subscribe → the QuickPay form posts with `AmountTotal = Y.YY`. Verify in the network tab the form action goes to `https://quickpay.ugpayments.ch/`.

- [ ] **Step 5: Commit**

```bash
git add src/components/feed/SubscriptionPopup.tsx
git commit -m "fix(fan-sub): SubscriptionPopup re-fetches fresh price on open

Avoids displaying stale prices when the creator updated their fan
subscription price after the public profile snapshot was taken."
```

---

## Task 10: LinkInBioEditor — guard auto-save when `activeProfile.id` is missing

**Files:**
- Modify: `src/pages/LinkInBioEditor.tsx`

- [ ] **Step 1: Add a defensive guard + toast on the missing-profile path**

In `src/pages/LinkInBioEditor.tsx`, locate the auto-save effect that writes to `creator_profiles` (around line 423):

```tsx
      if (activeProfile?.id) {
        const cpPayload = { ...profilePayload, ...creatorProfileOnlyPayload, ... };
        ...
      }
```

Add an `else` branch that surfaces the failure rather than silently dropping the price:

```tsx
      if (activeProfile?.id) {
        const cpPayload = {
          ...profilePayload,
          ...creatorProfileOnlyPayload,
          handle: undefined,
          username: debouncedData.handle,
          model_categories: debouncedData.model_categories,
        };
        const { error: cpError } = await supabase
          .from('creator_profiles')
          .update(cpPayload)
          .eq('id', activeProfile.id);
        if (cpError) {
          console.error('Error saving to creator_profiles', cpError);
          saveError = true;
        }
        await supabase
          .from('creator_profiles')
          .update({ show_agency_branding: debouncedData.show_agency_branding })
          .eq('id', activeProfile.id)
          .then(({ error }) => { if (error) console.warn('show_agency_branding column not available yet'); });
      } else if (
        debouncedData.fan_subscription_enabled !== undefined ||
        debouncedData.fan_subscription_price_cents !== undefined ||
        debouncedData.gender !== undefined
      ) {
        // creator_profiles-only fields can't be persisted without a creator_profile row.
        // Surface this so the creator knows their fan-sub price isn't being saved.
        console.warn('[LinkInBioEditor] No active creator profile — fan-sub fields cannot be saved.');
        saveError = true;
      }
```

(The toast for `saveError` is already raised by the existing tail of the auto-save; we just hook into the same path.)

- [ ] **Step 2: Investigate and surface if `activeProfile?.id` is null in normal use**

Run the app locally and load `/app/profile` as a creator. Open DevTools console. Look for the new warning. If it appears for an account that should have a `creator_profiles` row, the bug is upstream (ProfileContext failed to populate `activeProfile`). Capture findings in the commit message — but do not patch ProfileContext as part of this plan; that's out of scope.

- [ ] **Step 3: Verify it compiles**

Run:
```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LinkInBioEditor.tsx
git commit -m "fix(editor): surface fan-sub save failure when no active creator profile

The auto-save silently dropped fan_subscription_price_cents when
activeProfile.id was missing. Now logs a warning and triggers the
saveError toast so the creator knows their change wasn't persisted."
```

---

## Task 11: Final integration check

**Files:**
- No edits — purely verification.

- [ ] **Step 1: Repo-wide search for stale references**

Run each of these and confirm 0 matches:

```bash
grep -rn "is_feed_preview" src supabase/functions
```

Expected: 0 matches in code (migrations under `supabase/migrations/` may legitimately reference it — those are historical and stay).

```bash
grep -rn "isPreview\b" src
```

Expected: 0 matches in `.ts(x)` files.

- [ ] **Step 2: TypeScript + production build**

Run:
```bash
npm run build
```

Expected: completes with no errors.

- [ ] **Step 3: Run unit tests**

Run:
```bash
npm test
```

Expected: existing tests pass (no new tests were added by this plan; the touched UI components have no existing test coverage).

- [ ] **Step 4: Manual end-to-end walkthrough**

Reset local DB:
```bash
supabase db reset
```

Start the dev server:
```bash
npm run dev
```

As a creator:
1. Sign in as a creator with at least one creator_profile.
2. Upload a new asset in `/app/content` → it lands as "Hidden" with the new card switch labelled "Hidden".
3. Toggle the card switch to "In feed" → state persists on reload. The blur thumbnail is generated in the background (verify by seeing the row in `assets.feed_blur_path` becomes set within ~5s).
4. Visit `/app/home` → the new asset appears in the feed, **blurred** (subs-only by default).
5. Click the Public/Subs chip on the post → it flips to "Public" and the post re-renders unblurred. No reload required.
6. Visit `/app/profile` → Content section shows only in-feed assets. The Public/Subs switch on the same asset is in sync with `/app/home`. Drag-reorder works. Caption save on blur works.
7. Bulk-select two assets in `/app/content`, click "Add to feed" → both flip; blur thumbnails generate.
8. Bulk-select an in-feed asset, click "Remove from feed" → it disappears from `/app/home` and `/app/profile` Feed sections.
9. Open `/:handle` in incognito → only in-feed assets visible; subs-only ones are blurred with the locked CTA; public ones are unblurred.

As a fan (separate account):
10. Open the same `/:handle` → matches the incognito view.
11. Click Subscribe → SubscriptionPopup shows the **current** `fan_subscription_price_cents`. Try updating the creator's price in another tab and re-opening the popup: the new price displays without a refresh.
12. Complete the QuickPay flow in the sandbox if available; otherwise verify the form's `AmountTotal` field via DevTools network tab.
13. After subscription is active, return to `/:handle` → all in-feed assets unblurred.

- [ ] **Step 5: Commit a record of the manual walkthrough**

If steps 1-13 all pass, no further commit. If any fails, file a follow-up with a brief root-cause note before merging.

---

## Self-review summary

- **Spec coverage:**
  - Two-axis model: Tasks 1, 2, 3, 5, 7, 8.
  - Embed creator sees blur live: Task 8 step 4 (mobile) + step 5 (desktop).
  - Migration 191: Task 1.
  - ContentLibrary upload modal stripped: Task 2.
  - ContentLibrary in_feed switch: Task 4.
  - PublicContentSection drop "Set as free" + add public/subs toggle: Task 5.
  - PostVisibilityToggle drop is_feed_preview side-effect: Task 7.
  - SubscriptionPopup live price: Task 9.
  - LinkInBioEditor save guard: Task 10.
  - Validation plan: Task 11.
- **Type consistency:**
  - `LibraryAsset.in_feed` (Task 2), `PublicContent.in_feed` (Task 5), `FeedItem` drops `isPreview` (Task 8).
  - `handleToggleInFeed` (Task 3), `handleBulkInFeedChange` (Task 3), `handleToggleIsPublic` (Task 5).
  - `livePriceCents` state added in Task 9.
- **No placeholders:** Each step has the actual file path, the concrete diff, the exact command to run, and the expected result.
