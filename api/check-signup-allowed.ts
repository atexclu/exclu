/**
 * check-signup-allowed — Vercel Function wrapper (Phase 2A STUB).
 *
 * This file is the public entry point that browsers call during signup
 * preflight:
 *
 *   client  →  POST /api/check-signup-allowed   (this file)
 *          ←   { allowed, reason? }
 *
 * Architecture: this Vercel Function is the only layer that can verify
 * Vercel BotID (which requires the Vercel runtime). It verifies BotID, then
 * forwards the request body to the Supabase edge function
 * `check-signup-allowed` with a shared-secret header. The Supabase edge fn
 * handles the database-backed checks (disposable list, rate limits,
 * cooldown, attempt logging).
 *
 * See docs/research/hoo-be-signup-flow.md for the full rationale and
 * security posture.
 *
 * =========================================================================
 * PHASE 2A STATUS: STUB — DO NOT RELY ON FOR PRODUCTION TRAFFIC YET.
 * =========================================================================
 *
 * This stub always returns `{ allowed: false, reason: "internal_error" }`
 * so that any accidental client call (e.g., if someone flips
 * VITE_SIGNUP_PREFLIGHT_ENABLED before Phase 2B ships) fails CLOSED instead
 * of silently letting signups through unverified.
 *
 * Phase 2B will replace the stub body with:
 *
 *   1. Import `@vercel/functions` (or the current BotID helper), verify the
 *      BotID token attached to the incoming request by the
 *      `@vercel/botid` client SDK. Fail-closed on any verification error.
 *   2. Read SIGNUP_CHECK_INTERNAL_SECRET from Vercel env vars and forward
 *      the request body to the Supabase edge function with header
 *      `x-internal-secret: $SIGNUP_CHECK_INTERNAL_SECRET`. Also forward the
 *      original client IP via `x-forwarded-for` so the Supabase edge fn's
 *      rate limiter keys on the real browser IP, not the Vercel egress IP.
 *   3. Parse the Supabase response and return it verbatim to the client.
 *   4. On any error (BotID failure, network issue, Supabase 5xx, missing
 *      env), return `{ allowed: false, reason: "internal_error" }` with a
 *      200 status so the client helper can humanize the reason.
 *
 * Phase 2B checklist:
 *   - Confirm @vercel/functions API shape via the `vercel:vercel-agent` or
 *     `vercel:nextjs` skill at implementation time.
 *   - Set VERCEL env var `SUPABASE_CHECK_SIGNUP_URL=https://qexnwezetjlbwltyccks.supabase.co/functions/v1/check-signup-allowed`.
 *   - Set VERCEL env var `SIGNUP_CHECK_INTERNAL_SECRET` to match the value
 *     in Supabase secrets (same string).
 *   - Run offensive tests (scripts/offensive/test-signup-hardening.ts)
 *     against LOCAL before flipping VITE_SIGNUP_PREFLIGHT_ENABLED=true.
 *   - Confirm the Vercel runtime is Node.js (not Edge Runtime) so request
 *     body parsing works as a normal body/json.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Reject non-POST early so no body is consumed.
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ allowed: false, reason: 'method_not_allowed' });
    return;
  }

  // Phase 2A: fail closed. Any client call reaches here because
  // VITE_SIGNUP_PREFLIGHT_ENABLED was flipped prematurely. Return a 200
  // with allowed=false so the client shows a generic error and doesn't
  // silently proceed.
  console.warn(
    '[check-signup-allowed] Phase 2A stub reached — preflight is not yet wired. ' +
      'Either VITE_SIGNUP_PREFLIGHT_ENABLED is set too early, or Phase 2B has ' +
      'not yet replaced this stub.',
  );
  res.status(200).json({
    allowed: false,
    reason: 'internal_error',
  });
}
