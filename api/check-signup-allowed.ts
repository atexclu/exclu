/**
 * check-signup-allowed — Vercel Function wrapper (Phase 2B, real impl).
 *
 * Public entry point called by the browser during signup preflight:
 *
 *   client  →  POST /api/check-signup-allowed   (this file)
 *          ←   { allowed, reason? }
 *
 * The actual pipeline (BotID check → body parse → forward to Supabase)
 * lives in `_shared/signupPreflightHandler.ts` so it can be unit-tested
 * with mocked dependencies. This file just binds the real `checkBotId`
 * and `forwardToSupabase` and reads env vars from `process.env`.
 *
 * =========================================================================
 * ⚠️  DO NOT add a vercel.json rewrite for `/api/check-signup-allowed`.
 * =========================================================================
 *
 * This file is a native Vercel Function — Vercel automatically routes POST
 * /api/check-signup-allowed to it. The `/api/ugp-*` entries in vercel.json
 * that forward to Supabase directly look superficially similar, but their
 * rewrites EXIST PRECISELY BECAUSE they bypass the Vercel runtime. Adding
 * a similar rewrite for `/api/check-signup-allowed` would send requests
 * straight to the Supabase edge function, bypassing Vercel BotID entirely
 * and defeating the whole purpose of this wrapper.
 *
 * If you need a new `/api/*` route that hits Supabase WITHOUT BotID, use
 * the ugp-* rewrite pattern. If you need a new route WITH BotID, add a
 * new native Vercel Function file under `api/` and add its path to the
 * `initBotId({ protect: [...] })` call in `src/main.tsx`.
 *
 * =========================================================================
 *
 * IMPORTANT: BotID actively runs JavaScript on the client and attaches
 * challenge headers to every protected request. A direct `curl` call
 * to this endpoint in production WILL be classified as a bot. The only
 * way to smoke-test this endpoint end-to-end from prod is via a real
 * browser session with `initBotId()` having run at page load time (see
 * `src/main.tsx`).
 *
 * The protected route MUST be declared in `initBotId({ protect: [...] })`
 * on the client — Vercel BotID uses that list to decide which requests
 * to attach challenge headers to. Mismatch → `checkBotId()` returns a
 * challenge-required branch (no isBot) → we fail closed.
 */

import { checkBotId } from "botid/server";
import { forwardToSupabase } from "./_shared/forwardToSupabase";
import { handleSignupPreflight } from "./_shared/signupPreflightHandler";

const DEFAULT_SUPABASE_URL =
  "https://qexnwezetjlbwltyccks.supabase.co/functions/v1/check-signup-allowed";

export async function POST(request: Request): Promise<Response> {
  return handleSignupPreflight(
    request,
    {
      secret: process.env.SIGNUP_CHECK_INTERNAL_SECRET,
      supabaseUrl:
        process.env.SUPABASE_CHECK_SIGNUP_URL ?? DEFAULT_SUPABASE_URL,
    },
    { checkBotId, forwardToSupabase },
  );
}
