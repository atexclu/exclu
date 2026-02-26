# Guide: Testing Stripe Payments on Exclu

Two modes are available depending on what you want to test.

---

## Mode A — Full local dev (recommended for development)

Frontend + Edge Functions run locally. Stripe CLI forwards test events directly to your machine.
No Stripe Dashboard webhook involved.

### Setup

**`.env.test.local`** (for local Edge Functions):
```env
VITE_SUPABASE_URL=https://qexnwezetjlbwltyccks.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_STRIPE_LISTEN_OUTPUT
PUBLIC_SITE_URL=http://localhost:8080
PROJECT_URL=https://qexnwezetjlbwltyccks.supabase.co
SERVICE_ROLE_KEY=YOUR_PRODUCTION_SERVICE_ROLE_KEY
```

**`.env.local`** (for the Vite frontend):
```env
VITE_SUPABASE_URL=https://qexnwezetjlbwltyccks.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### How `supabaseClient.ts` routes requests locally

In `DEV` mode, all Edge Function calls are automatically redirected to `http://127.0.0.1:54321`:
```typescript
if (import.meta.env.DEV && urlString.includes('/functions/v1/')) {
  return fetch(urlString.replace(supabaseUrl, 'http://127.0.0.1:54321'), options);
}
```

### Run (3 terminals)

**Terminal 1 — Frontend:**
```bash
npm run dev
```

**Terminal 2 — Stripe CLI listener:**
```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```
⚠️ Copy the `whsec_...` printed here and paste it as `STRIPE_WEBHOOK_SECRET` in `.env.test.local`. Restart Terminal 3 after updating.

**Terminal 3 — Local Edge Functions:**
```bash
npx supabase functions serve --env-file .env.test.local --no-verify-jwt
```

### Test flow
1. Go to `http://localhost:8080/l/{link-slug}`
2. Click Buy — checkout uses `sk_test_...` → Stripe test page
3. Pay with card `4242 4242 4242 4242`
4. `stripe listen` catches the event → posts to local webhook → purchase inserted in DB
5. Frontend polls DB → content unlocks ✅

---

## Mode B — Frontend local, Edge Functions on production (current setup)

Frontend runs locally (`npm run dev`), but Edge Functions run on Supabase Cloud.
The Stripe Dashboard test webhook (`whsec_31ScFvT4MfPHd7n3kjK1ivZxIMDFVSAQ`) is configured
to point to `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/stripe-webhook`.

**This mode does NOT require any local terminal setup.** The production Edge Function handles
both live events (via `STRIPE_WEBHOOK_SECRET`) and test events (via `STRIPE_WEBHOOK_SECRET_TEST`).

### Stripe Dashboard webhooks configured:
| Mode | Endpoint | Secret env var |
|------|----------|---------------|
| Live | `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/stripe-webhook` | `STRIPE_WEBHOOK_SECRET` |
| Test | `https://qexnwezetjlbwltyccks.supabase.co/functions/v1/stripe-webhook` | `STRIPE_WEBHOOK_SECRET_TEST` |

The webhook function tries the live secret first, then falls back to the test secret automatically.

### Limitation
In this mode, `npm run dev` still routes Edge Function calls to `127.0.0.1:54321` (local).
**You must temporarily disable this** or use Mode A for a fully working local test.
Or simply test on the deployed production URL where the routing is not overridden.
