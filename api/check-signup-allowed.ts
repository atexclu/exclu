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
 * and `forwardToSupabase`, adapts between the legacy `@vercel/node`
 * `(req, res)` handler signature and the modern Web-API `Request/Response`
 * shape that the testable handler speaks, and reads env vars from
 * `process.env`.
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
 * Legacy handler signature — not the named `POST(request: Request)` style.
 * The rest of this project uses `@vercel/node` `(req, res)` handlers
 * (api/og-proxy.ts, api/sitemap.ts, etc.). Vercel auto-detects the runtime
 * from that pattern and does NOT route named method exports when the
 * legacy pattern is present elsewhere, which caused a 500
 * FUNCTION_INVOCATION_FAILED in the first Phase 2B deploy. We use the
 * legacy signature here and build a minimal Fetch API `Request` inside
 * the handler so the testable core can stay framework-agnostic.
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

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkBotId } from "botid/server";
// Vercel's build-time tsc uses node16/nodenext module resolution, which
// requires explicit `.js` extensions on relative ESM imports. The source
// files are `.ts`, but the emitted JS files will be `.js`, so the import
// path must reference the compiled file name. Without this, the build
// emits broken JS and the function crashes at runtime with
// FUNCTION_INVOCATION_FAILED. Our local tsconfigs use `bundler` resolution
// so the errors weren't caught locally — see the Phase 2B hotfix commits.
import { forwardToSupabase } from "./_shared/forwardToSupabase.js";
import { handleSignupPreflight } from "./_shared/signupPreflightHandler.js";

const DEFAULT_SUPABASE_URL =
  "https://qexnwezetjlbwltyccks.supabase.co/functions/v1/check-signup-allowed";

/**
 * Build a Fetch API `Request` from a legacy `VercelRequest` so the
 * testable handler can consume it without knowing about `@vercel/node`.
 * Preserves the body (as a JSON string — `req.body` is already parsed by
 * the Node runtime when the content-type is application/json) and the
 * headers we care about (content-type + forwarding chain).
 */
function buildFetchRequest(req: VercelRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else {
      headers.set(key, value);
    }
  }

  // `req.body` can be a parsed object, a string, or undefined depending on
  // content-type. Serialize back to JSON for the Fetch API Request body.
  let body: string | undefined;
  if (req.body === undefined || req.body === null) {
    body = undefined;
  } else if (typeof req.body === "string") {
    body = req.body;
  } else {
    body = JSON.stringify(req.body);
  }

  const url =
    (req.url && req.url.startsWith("http")
      ? req.url
      : `https://local.invalid${req.url ?? "/"}`);

  return new Request(url, {
    method: req.method ?? "POST",
    headers,
    body,
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const fetchRequest = buildFetchRequest(req);

  let response: Response;
  try {
    response = await handleSignupPreflight(
      fetchRequest,
      {
        secret: process.env.SIGNUP_CHECK_INTERNAL_SECRET,
        supabaseUrl:
          process.env.SUPABASE_CHECK_SIGNUP_URL ?? DEFAULT_SUPABASE_URL,
      },
      { checkBotId, forwardToSupabase },
    );
  } catch (err) {
    console.error("[check-signup-allowed] handler threw", err);
    res.status(200).json({ allowed: false, reason: "internal_error" });
    return;
  }

  // Bridge the Fetch Response back to the legacy VercelResponse.
  const payload = (await response.json()) as Record<string, unknown>;
  res.status(response.status).json(payload);
}
