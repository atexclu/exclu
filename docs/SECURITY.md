# Exclu Security Overview

This document summarizes the main security measures currently implemented in the Exclu app.

> This file is descriptive documentation only; the authoritative behavior is in the code and Supabase configuration.

---

## 1. Authentication & Authorization

- **Auth provider**
  - Supabase Auth (email/password) for creators.
  - No account required for fans: they only interact with public resources and Stripe Checkout.

- **Row Level Security (RLS)**
  - All core tables in `public` have RLS enabled.
  - **profiles**
    - Owners (creators) can read/insert/update only their own row (`auth.uid() = id`).
    - Public can read only creator profiles with `is_creator = true` and a non-null `handle` (public profile pages).
  - **links**
    - Creators can read/manage only their own links (`creator_id = auth.uid()`).
    - Public/fans never query arbitrary links; they only access a single `slug` or published links for a given creator handle, filtered in the frontend.
  - **purchases** (see Supabase schema)
    - Access is limited so that:
      - Creators can see purchases for their own links.
      - Fans unlock content via `stripe_session_id` without seeing other users’ data.

- **Service role usage**
  - Edge Functions use `SERVICE_ROLE_KEY` **only on the backend** (Supabase Functions).
  - The frontend only has access to `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.

---

## 2. Stripe Integration & Payments

- **Checkout session creation**
  - `create-link-checkout-session` (Edge Function):
    - Validates the `slug` and loads the `links` row.
    - Ensures the link is `status = 'published'` with a valid `price_cents`.
    - Loads the creator’s `profiles` row and checks:
      - `stripe_account_id` is set.
      - `stripe_connect_status = 'complete'`.
    - Standardizes currency to **USD** and adds +5% processing fee for the fan.
    - Sets `application_fee_amount` based on the creator’s plan (10% commission on Free, 0% on Premium) plus the 5% fan fee.
    - Stores purchase metadata in Stripe Checkout (`link_id`, `creator_id`, `slug`, optional `buyerEmail`).

- **Webhook processing**
  - `stripe-webhook` (Edge Function):
    - Verifies the event with `stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET)`.
    - On `checkout.session.completed` with `mode = 'payment'` and `metadata.link_id`:
      - Ensures idempotence by checking for an existing `purchases.stripe_session_id`.
      - Inserts a `purchases` row with:
        - `link_id`, `creator_id`, `amount_cents`, `currency`, `stripe_session_id`, `status = 'succeeded'`.
        - `buyer_email` / `fan_email` from Stripe `customer_details.email` or explicit `buyerEmail` metadata.
      - Optionally sends a content access email via Brevo using the unlock URL.
    - On subscription events:
      - Updates `profiles.is_creator_subscribed` according to Stripe subscription status.
    - On `account.updated`:
      - Updates `profiles.stripe_connect_status` (`pending` / `restricted` / `complete`).

- **Webhook security**
  - Supabase `verify_jwt = false` for the webhook function; authentication is done via Stripe’s signature.
  - Requests without a valid signature are rejected with 400 and do **not** touch the database.

---

## 3. Edge Functions Exposed to the Frontend

The following Edge Functions are called from the browser:

- `create-link-checkout-session`
- `stripe-connect-onboard`
- `stripe-connect-status`
- `send-link-content-email`

### 3.1 CORS Restrictions

Previously, these functions allowed `Access-Control-Allow-Origin: *`.

Now:

- Each function computes an **allowed origin list** from:
  - `PUBLIC_SITE_URL` (normalized, no trailing slash).
  - Local dev origins: `http://localhost:8080`, `http://localhost:5173`.
- For each request:
  - If `Origin` header matches an entry, that origin is echoed back.
  - Otherwise, `PUBLIC_SITE_URL` is used, which blocks cross-site XHR from arbitrary domains.
- `OPTIONS` requests return `200 ok` with the same restricted CORS headers.

This preserves the existing flows (app in production + local dev) while preventing third-party websites from directly calling these functions via XHR.

### 3.2 Rate Limiting (Best Effort)

For `create-link-checkout-session`, `stripe-connect-onboard`, `stripe-connect-status`, and `send-link-content-email`:

- A lightweight **in-memory per-IP rate limiter** was added:
  - Window: 60 seconds.
  - Limits:
    - 20 requests / minute / IP for `create-link-checkout-session`, `stripe-connect-onboard`, `send-link-content-email`.
    - 60 requests / minute / IP for `stripe-connect-status` (creators may refresh status more often).
- Implementation details:
  - Uses a `Map<ip, { count, windowStart }>` in the Edge Function runtime.
  - On each request, increments the count; if above limit, returns HTTP 429.
  - This is **best effort** only: limits reset when the function instance is recycled, but it still mitigates basic automated abuse.

The functional behavior for normal users is unchanged; only aggressive repeated calls are throttled.

### 3.3 Input Validation

- **Emails (create-link-checkout-session, send-link-content-email)**
  - `buyerEmail` in the checkout session creator is now validated with a simple regex: `^[^\s@]+@[^\s@]+\.[^\s@]+$`.
    - If invalid, it is ignored (checkout still works, but no email is attached from this field).
  - `send-link-content-email` validates the final target email (`buyer_email` / `fan_email` or override) with the same regex:
    - If invalid, returns HTTP 400 (`Invalid email address`) and does not attempt to call Brevo.

- **Authentication in stripe-connect-onboard / stripe-connect-status**
  - `stripe-connect-onboard` expects a valid Supabase access token in `x-supabase-auth`.
  - `stripe-connect-status` expects `Authorization: Bearer <token>`.
  - Both functions validate the token via Supabase Auth before accessing profiles.
  - Errors (`missing token`, `expired/invalid token`, `profile not found`, `unsupported country`) return clear 4xx errors.

---

## 4. File Uploads & Media Handling

Uploads currently happen in two main places:

- **CreateLink / EditLink**: uploading main media for a paid link.
- **ContentLibrary**: uploading assets into a personal media library.
- **Profile**: uploading an avatar (handled separately, see below).

### 4.1 Client-Side MIME Type & Size Filters

To reduce the risk of abuse and accidental huge uploads, the following front-end checks are applied before sending files to Supabase Storage:

- **Supported types**
  - Images: any `image/*` MIME type.
  - Videos: only `video/mp4`, `video/quicktime` (MOV), `video/webm`.
- **Maximum size**
  - 500 MB per file for link content and library assets.
- **Behavior when invalid**
  - Invalid or too-large files are **rejected on the client**:
    - The file input is reset.
    - Any existing preview URL is revoked and cleared.
    - A clear error message is shown via toast or inline error text.
  - For multi-file upload (ContentLibrary):
    - Valid files are accepted; invalid ones are skipped.
    - An inline message explains that some files were skipped because of type/size limits.

These checks do not change behavior for users uploading standard images or common video formats under 500 MB; they only block exotic MIME types or very large files.

### 4.2 Server-Side Storage

- All paid content and library assets are stored in the `paid-content` Supabase Storage bucket.
- Paths are namespaced by user and resource (e.g. `paid-content/<user_id>/<link_id>/original/content.<ext>`).
- Links to storage objects are never public; access is granted via **signed URLs** (see below).

---

## 5. Signed URLs & Content Access

- **Signed URLs**
  - For previews (library mosaics, link editing), signed URLs are generated with a **short TTL** (typically 1 hour).
  - For email delivery via `send-link-content-email`, signed URLs are generated with a **24-hour TTL** to give fans time to download their content.
- **Unlock flow (fans)**
  - Fans unlock content by completing a Stripe Checkout session.
  - The success URL encodes `session_id` and the link slug.
  - The frontend verifies `session_id` against the `purchases` table and, if valid, fetches signed URLs for the media.
  - Signed URLs are only ever used in controlled `<img>` / `<video>` / download anchors; no scripts are executed from user content.

Future hardening (not yet implemented, but considered for later):

- Replace direct signed URLs in the DOM by a proxy Edge Function (`file-proxy`) that:
  - Validates the purchase and `access_expires_at`.
  - Streams the file to the client without exposing the Storage URL.

---

## 6. Data Validation & Normalization

### 6.1 Handles & Titles

- **Handles (creator usernames)**
  - In onboarding and profile settings:
    - Handles are normalized client-side to `lowercase + [a-z0-9_]`.
    - A minimum length of 3 characters is enforced at onboarding.
    - Uniqueness is checked server-side (`profiles.handle` unique constraint) before saving.

- **Link titles**
  - On link creation and edition:
    - Titles are trimmed and sanitized to remove control characters (`U+0000–U+001F`, `U+007F`).
    - Empty titles after sanitization are rejected with a clear error message.
    - Slugs are derived from sanitized titles plus a random suffix.

### 6.2 External URLs & Social Links

- The profile `external_url` and social/platform links are captured during onboarding.
- On the client side, URLs are entered in `type="url"` fields and will be further validated/normalized to:
  - Only accept `http://` or `https://` schemes.
  - Trim whitespace.
  - Reject obviously malformed URLs before saving.
- Invalid URLs are rejected with a toast and are **not** saved to Supabase.

(If you are reading this and do not see the corresponding checks in `Onboarding.tsx` / `Profile.tsx`, they may still be in progress; the intent is to keep external URLs well-formed and limited to safe schemes.)

---

## 7. Frontend Rendering & XSS Mitigations

- The app is built with React; by default, React escapes text nodes before rendering.
- **No user-generated HTML** is injected via `dangerouslySetInnerHTML` for creator or fan content.
  - The only use of `dangerouslySetInnerHTML` in the codebase is inside the chart component (`ChartStyle`), where it injects a CSS string derived from a static chart config, not from user input.
- All media content from creators is rendered inside controlled tags:
  - `<img>` for images.
  - `<video>` for videos (with `controls` / `autoPlay` / `muted` as appropriate).
- There is no execution of arbitrary scripts from user content.

---

## 8. Cookies & Sessions

- Creator sessions are managed by Supabase Auth via JWT stored client-side (Supabase JS SDK).
- Protected routes in the SPA (`ProtectedRoute` component) check for an active session and redirect to `/auth` if missing.
- New creators without a handle are redirected to `/onboarding` to complete their profile before using the app.

---

## 9. Summary

- **Server-side protections**: RLS on core tables, service-role keys only in Edge Functions, strict Stripe webhook verification, constrained checkout/session logic, and rate-limited, CORS-restricted Edge Functions.
- **Client-side protections**: sanitized handles/titles, validated emails and URLs, file type/size limits, and safe rendering of media-only content.
- **Data access model**: creators see only their own data; fans see only public creator profiles and links that are explicitly published; purchases are tied to Stripe sessions.

This document should be kept up to date whenever new security-sensitive features are implemented or existing ones are significantly modified.
