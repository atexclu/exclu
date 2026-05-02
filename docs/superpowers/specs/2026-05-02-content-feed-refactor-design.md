# Content & Feed Refactor — Design

**Date:** 2026-05-02
**Scope:** simplify creator-side content/feed model and fix the broken
public/subs visibility toggle. Bundle a fix for `fan_subscription_price_cents`
not propagating to the fan checkout.

## Problem

Today the creator-facing flow uses two overloaded columns on `assets`:

- `is_public` — meant "in feed" in some places, "unblurred for everyone" in
  others. The Content tab labels it "Public/Private" (= shown in feed or not),
  while the Home → Feed `PostVisibilityToggle` labels it "Public/Subs" (=
  unblurred or blurred). Same column, two contradictory UIs.
- `is_feed_preview` — the single asset that's exposed for free to non-subs.
  Set via a "Set as free" button in `PublicContentSection`, with a partial
  unique index ensuring at most one preview per profile.

The rendering logic in `CreatorPublic.tsx` filters the public feed to
`is_public = true` (line 555) and computes
`isUnlocked: embed || item.isPreview || item.isPublic || isSubscribed` (line
1466). Because every fetched asset has `is_public = true`, every fetched asset
is unlocked, so the blur path is never used and toggling the
`PostVisibilityToggle` either hides the post entirely (when flipping to
`is_public = false`) or does nothing visible. The label "Subs" is a lie.

The user wants two clearly separated axes:

- **In feed?** — set in the Content tab. Asset appears in the public profile
  feed at all.
- **Public / Subscribers-only?** — set in Home → Feed and Profile → Feed via a
  single toggle. When the post is in the feed, controls whether non-subs see
  it unblurred (public) or blurred (subs-only).

Default for new uploads: not in feed, subs-only. The creator opts in
explicitly.

A separate but related bug: changes to `fan_subscription_price_cents` made in
the editor don't always reach the fan checkout (the SubscriptionPopup keeps
showing the old price after a refresh-less change, and there are conditions
under which the auto-save fails silently).

## Two-axis model

| Concept | Column | Default (new row) | Set where |
|---|---|---|---|
| In feed? | `assets.in_feed` (BOOLEAN, NOT NULL) | `FALSE` | `/app/content` (ContentLibrary) |
| Public when shown? | `assets.is_public` (BOOLEAN, NOT NULL) | `FALSE` | `/app/home` feed and `/app/profile` → Feed |

For posts (zero-price links from the composer), only `is_public` applies —
posts are always in the feed by virtue of having been created via the
composer; removing them from the feed means deleting the post. Existing
`links.is_public` keeps its meaning and is the same toggle as on assets.

`assets.is_feed_preview` is removed.

## DB migration (`191_content_feed_refactor.sql`)

Single hard migration:

1. `ALTER TABLE assets ADD COLUMN in_feed BOOLEAN NOT NULL DEFAULT FALSE;`
2. Backfill: `UPDATE assets SET in_feed = TRUE WHERE is_public = TRUE OR
   is_feed_preview = TRUE;` — preserves what creators currently see (any asset
   that was visible in the public feed stays visible).
3. `assets.is_public` keeps its existing values, but its semantic is now
   "unblurred when shown". Currently-public assets stay unblurred — no
   surprise visual change for end-users.
4. Drop `is_feed_preview` index (`assets_one_feed_preview_idx` from migration
   147 / equivalent) and the `is_feed_preview` column.
5. Rewrite the assets RLS policy from migration 064 / 163: replace
   `USING (is_public = true AND deleted_at IS NULL)` with
   `USING (in_feed = true AND deleted_at IS NULL)`. Anyone can SELECT a row
   that's in the feed — that gives fans the blur path, mime, caption, and
   `is_public` flag. Full-res storage access stays gated client-side via
   conditional signed URLs.
6. Update `idx_assets_profile_public` (from migration 147 line 84) and any
   similar indexes to reference `in_feed` instead of `is_public`. Keep one
   composite `(profile_id, in_feed, created_at DESC)` for the feed query.

Migration is rollback-safe: re-add `is_feed_preview` as nullable, re-recreate
its unique partial index, swap RLS back to `is_public`.

## UI changes

### ContentLibrary (`src/pages/ContentLibrary.tsx`)

- Strip the upload modal: drop the "Show in my feed" switch and the feed
  caption textarea. Upload writes `in_feed = false, is_public = false`.
- Replace `is_public` references with `in_feed` (state, fetch, optimistic
  update, bulk action).
- Filter pills become **All / In feed / Not in feed**.
- Bulk action buttons: rename **Make public / Make private** to **Add to feed
  / Remove from feed**, write `in_feed`.
- Per-card hover overlay (or always-visible compact pill, bottom-right of
  thumbnail): a small `In feed` switch that flips `assets.in_feed`.
  Optimistic, with rollback on error. Uses the existing aurora-tinted Switch
  component.
- Stop generating the blur thumbnail eagerly in the upload step. Move the
  blur-generation pipeline so it runs the first time a creator marks an asset
  `in_feed = true` (we need a blur for any in-feed asset, since `is_public`
  may be false). The existing `ensureBlurForAsset` in `PublicContentSection`
  handles the fallback path.
- The feed caption is no longer set in this page. Existing `feed_caption`
  values are preserved — the editor (Profile → Feed) is now the only place to
  set or change the caption.

### Profile → Feed (`src/components/linkinbio/sections/PublicContentSection.tsx`)

- Fetch only `assets WHERE in_feed = TRUE` (creator's own row by RLS).
  Re-fetch when the creator returns to this section (already does).
- Remove the per-card `is_public` switch labelled "In feed / Hidden" — that
  switch lives in the Content tab now.
- Remove the **Set as free / Free preview** button entirely.
- Add a single per-card `is_public` toggle: aurora-tinted Switch with a
  Globe/Lock icon and a label `Public` / `Subs only`. Optimistic, rollback on
  error. Same write semantics as the Home → Feed toggle (writes
  `assets.is_public`).
- Stats block at the top: drop the "Free preview" tile. Keep "In feed" and
  add "Public" + "Subs only" counts.
- Caption textarea behaviour unchanged (still per-card, on blur write).
- Drag handle, ordering, content_order persistence unchanged.
- Trigger `ensureBlurForAsset` when an asset enters the feed without a blur
  path (now also on `in_feed → true`, not just `is_public → true`). The blur
  is needed regardless of `is_public` because subs-only assets show the blur
  to non-subs.
- Empty state: if the creator has no in-feed assets, show the existing CTA to
  go to the Content library.

### Home → Feed (`src/components/feed/PostVisibilityToggle.tsx`)

- Component contract unchanged — still takes `kind`, `postId`, `isPublic`,
  `onChange`, `gradientStops`. Still writes `is_public`.
- Drop the `is_feed_preview = false` side-effect on assets when flipping to
  subs-only (lines 64-65) — that column is gone.
- Copy: keep "Public" / "Subs" labels (matches the design discussion).

### Feed rendering (`src/pages/CreatorPublic.tsx`)

This is the actual fix.

1. **Fetch:** swap `assetsQuery.eq('is_public', true)` (line 555) for
   `assetsQuery.eq('in_feed', true)` so both public and subs-only feed assets
   are loaded, in both `embed` and public modes. Drop the
   `is_feed_preview`-based ordering (line 552). Order is the existing
   `content_order` then `created_at desc`.
2. **Locked logic:** change `isUnlocked` (lines 1466 and 1984) to
   `item.isPublic || isSubscribed`. **Embed (creator preview) no longer
   force-unlocks**: the creator sees their feed exactly as a non-subscriber
   would. When they flip the toggle to public the post immediately re-renders
   unblurred; flipping back makes it blurred. This is the visual confirmation
   the creator needs.
3. **Lazy full-res signing** (line 728): condition becomes
   `item.isPublic || isSubscribed`. Don't sign or attach full-res URLs to
   subs-only posts when the viewer is a non-subscriber (creator included on
   their own feed preview — they can still verify the post by toggling
   public temporarily, or by visiting `/app/content` to view the source asset
   in full).
4. **Feed item shape:** drop `isPreview` from `FeedItem` and from the asset
   mapping (lines 651, 675-682). Sort exclusively by `content_order` then
   `created_at`.
5. **`setItemVisibility`** (line 154-161): unchanged — already does
   optimistic local + rebuild from underlying state. Keep it as-is, it now
   drives the visual flip directly because `isUnlocked` reads `isPublic`.
6. **Empty state**: if `feedItems` is empty and the viewer is a fan, show the
   existing locked card. If embed and empty, show the composer trigger.

### CreatePostDialog (`src/components/feed/CreatePostDialog.tsx`)

- Keep the existing Public / Subscribers selector with `subscribers` as the
  default (line 66). Writes `links.is_public = (visibility === 'public')`.
- No changes to the asset picker (the dialog reads from the full library
  including `in_feed = false` assets — that's fine, attaching them to a post
  doesn't change their `in_feed` flag).

## Fan subscription price bug

Two distinct fixes:

### Fix 1 — modal shows live price

`SubscriptionPopup` receives `priceCents` as a static prop derived from the
profile snapshot loaded by `CreatorPublic`. If the creator changes the price
in another tab and the fan opens the popup without reloading, the modal shows
the old price even though the checkout function reads the fresh value.

Change: when the popup opens, re-fetch
`creator_profiles.fan_subscription_price_cents` with a single SELECT keyed by
`creator_profile_id` and use the returned value for both the displayed amount
and the button label. The static prop becomes the loading-state placeholder.

### Fix 2 — auto-save reliably persists the new price

Inspect `LinkInBioEditor.tsx` auto-save (lines 377-460):

- The price field lives on `creator_profiles` only (per CLAUDE.md). The
  auto-save writes to `creator_profiles` only when `activeProfile?.id` is
  set.
- For accounts without a `creator_profiles` row, the price is silently
  dropped.

Verify the actual failure path by:

1. Reproducing in dev: log in as a creator, change the price, observe the
   network tab and the `creator_profiles` row.
2. Check whether `activeProfile.id` is reliably set when the FanSubscription
   section is rendered.
3. Check RLS on `creator_profiles` for the UPDATE path — service-role bypass
   is the EF, but the editor uses the user JWT.

Likely fix: ensure the editor either (a) always has an `activeProfile.id`
when the FanSubscription section is rendered (defensive guard, no save
without it; show a "Set up your profile first" hint) or (b) writes both
`creator_profiles` and a fallback location, but per CLAUDE.md the column is
only on creator_profiles, so (a) is the right answer. Add a clear toast on
save failure.

## Out of scope

- Paid links (`links.price_cents > 0`) — Links tab visibility logic stays.
  This refactor only touches assets and zero-price posts.
- The wishlist tab.
- The blur generation pipeline itself (existing `ensureBlurForAsset` is
  reused; we just trigger it on a different condition).

## Validation plan

1. Migrate locally (`supabase db reset`), confirm:
   - Existing currently-public assets are `in_feed = TRUE, is_public = TRUE`.
   - Existing private assets are `in_feed = FALSE, is_public = FALSE`.
   - `is_feed_preview` column is gone, related index dropped.
2. Manual test as a creator (`/app/content` + `/app/home` + `/app/profile`):
   - Upload a new asset → not in feed, not public.
   - Flip "In feed" on the Content card → asset appears in `/app/home` feed
     with the lock/blur view (because subs-only by default).
   - Flip the Public/Subs toggle on the Home → Feed post → post becomes
     unblurred. Flip back → blurred again. Creator sees the visual flip.
   - Open the same post on `/:handle` as an anonymous visitor → matches the
     creator preview.
   - Flip "In feed" off → post disappears from Home → Feed and `/:handle`.
3. As a fan, subscribe → all in-feed assets unblurred regardless of
   `is_public`.
4. Edit `fan_subscription_price_cents` → verify the new price both in the
   `creator_profiles` row and in the SubscriptionPopup of a freshly-loaded
   public profile. Verify the QuickPay form's `AmountTotal` field uses the
   new price.

## Files touched

- New: `supabase/migrations/191_content_feed_refactor.sql`
- Modified: `src/pages/ContentLibrary.tsx`
- Modified: `src/components/linkinbio/sections/PublicContentSection.tsx`
- Modified: `src/components/feed/PostVisibilityToggle.tsx`
- Modified: `src/pages/CreatorPublic.tsx`
- Modified: `src/components/feed/SubscriptionPopup.tsx`
- Investigated, possibly modified: `src/pages/LinkInBioEditor.tsx`
- No change: `src/components/feed/CreatePostDialog.tsx`,
  `src/components/feed/FeedPost.tsx` (already renders blur when locked)
