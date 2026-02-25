# Guide for AI: Setting up Local Stripe Testing for Exclu

To be able to test and simulate Stripe payments locally (including checkout, webhooks, affiliate commissions, and content unlocking) without affecting the production data/customers, follow these precise steps. 

This sets up a hybrid environment: 
- Frontend (`npm run dev`) runs locally.
- Backend Edge Functions run locally via Supabase CLI (`npx supabase functions serve`).
- The database is the **production** Supabase database, allowing the use of real test users, links, and profiles.
- Stripe events are forwarded to the local Edge Functions using `stripe listen`.

## 1. Required Files and Environment Variables

You must maintain a separate `.env.test.local` file for running local Edge Functions. This file must contain the Stripe Test keys and the Supabase Service Role key.

**.env.test.local:**
```env
VITE_SUPABASE_URL=https://qexnwezetjlbwltyccks.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1...

# Stripe Test Keys
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (This will be dynamically replaced)

# Local redirection
PUBLIC_SITE_URL=http://localhost:8080
PROJECT_URL=https://qexnwezetjlbwltyccks.supabase.co
SERVICE_ROLE_KEY=YOUR_PRODUCTION_SERVICE_ROLE_KEY
```

**.env.local** (Used by the frontend `npm run dev`):
Make sure it has the **Stripe Test Publishable Key**.
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_mUrEGMrRGDGcQnAImiIcKXOmEXvIwQ2h
```

## 2. Infrastructure Modifications (Already Done)
To ensure the local frontend targets local Edge Functions instead of production Cloud functions, `src/lib/supabaseClient.ts` has been modified to override the custom `fetch` when running in `DEV` mode:
```typescript
const customFetch = (url: RequestInfo | URL, options?: RequestInit) => {
  const urlString = url instanceof URL ? url.toString() : url as string;
  if (import.meta.env.DEV && typeof urlString === 'string' && urlString.includes('/functions/v1/')) {
    const localUrl = urlString.replace(supabaseUrl ?? '', 'http://127.0.0.1:54321');
    return fetch(localUrl, options);
  }
  return fetch(url, options);
};
```
*Note: This modification uses `import.meta.env.DEV`, indicating it will not affect the production app.*

## 3. Step-by-Step Execution Guide

To simulate a purchase locally, open three separate terminal windows:

### Terminal 1: Run the Frontend
Run the Vite development server.
```bash
npm run dev
```

### Terminal 2: Connect Stripe to Local Webhook
Forward Stripe test events to the locally running Edge Functions.
```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```
**CRITICAL:** When you execute this command, Stripe CLI prints a webhook secret in the terminal.
*Example: `Your webhook signing secret is whsec_a5fa8060ced14...`*
You **MUST** copy this new secret and update `STRIPE_WEBHOOK_SECRET=...` inside `.env.test.local`.

### Terminal 3: Run Local Supabase Edge Functions
Once `.env.test.local` is updated with the correct `whsec_...` from Terminal 2, you must (re)start the Supabase edge functions.

```bash
# Provide the custom environment file and bypass JWT validation since the 
# frontend uses production user JWTs which won't pass local runtime signature verification.
npx supabase functions serve --env-file .env.test.local --no-verify-jwt
```

## 4. Run the Test
1. Go to `http://localhost:8080/l/{link-slug}`.
2. Click the unlock/buy button.
3. The Vite frontend invokes the local `create-link-checkout-session` function point at the `127.0.0.1:54321` port.
4. The local function uses `sk_test_...` and returns a Stripe Checkout Test URL.
5. In the checkout window, use Stripe's test card `4242 4242 4242 4242`.
6. Stripe processes the payment and sends events out. `stripe listen` catches the events and posts them to `http://localhost:54321/functions/v1/stripe-webhook`.
7. The local `stripe-webhook` function authenticates the `whsec_...` secret from `.env.test.local`, validates the event, inserts the purchase data using `SERVICE_ROLE_KEY` to the production Database, processes affiliates/bonuses, and completes successfully.
8. The frontend periodically polls the DB table, notices the purchase row created by the local webhook, and unblurs the content.

*Note: In the test environment, the image/content might not load visually due to local vs remote Storage path configurations (`http://127.0.0.1:54321/storage/...`), but the logic of unlocking the UI succeeds.*
