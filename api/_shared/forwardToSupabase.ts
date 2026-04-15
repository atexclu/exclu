/**
 * Server-side helper for api/check-signup-allowed.ts.
 *
 * Forwards a signup preflight request from the Vercel Function wrapper
 * to the Supabase edge function `check-signup-allowed`, attaching the
 * shared `x-internal-secret` header and preserving the original client
 * IP via a custom `x-client-ip` header. (NOT `x-forwarded-for` — that
 * header gets prepended by Cloudflare on the way into Supabase, which
 * pollutes the downstream `extractClientIp` call with our Vercel egress
 * IP. See the comment inside `forwardToSupabase` for the full history.)
 *
 * Kept in api/_shared/ (underscore prefix = excluded from Vercel Function
 * routing) so it can be imported by the real handler AND unit-tested
 * directly via Vitest with a mocked fetch. No Vercel runtime globals,
 * no request context — the function takes everything it needs as plain
 * arguments.
 */

export interface SupabaseForwardBody {
  email: string;
  device_fingerprint?: string;
  user_agent?: string;
}

export type SupabaseForwardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export interface ForwardOptions {
  /** Full URL of the Supabase edge function (e.g. https://<ref>.supabase.co/functions/v1/check-signup-allowed). */
  url: string;
  /** Shared secret, must match SIGNUP_CHECK_INTERNAL_SECRET set in the Supabase project secrets. */
  secret: string;
  /**
   * Real browser IP to forward to the Supabase edge function via the
   * custom `x-client-ip` header. Do NOT send this as `x-forwarded-for`
   * because Cloudflare prepends its own connecting IP to that chain
   * (see the PROD INCIDENT comment below).
   */
  clientIp?: string;
  /** Injectable fetch for testing. Defaults to the global `fetch` available in Vercel Node runtime. */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms. Defaults to 5000. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Call the Supabase edge function. Any network error, non-200 response,
 * or malformed JSON is treated as fail-closed — the client-facing result
 * is `{allowed: false, reason: "internal_error"}`. The Supabase function's
 * own `{allowed, reason}` response is passed through verbatim when it's
 * well-formed.
 */
export async function forwardToSupabase(
  body: SupabaseForwardBody,
  opts: ForwardOptions,
): Promise<SupabaseForwardResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-internal-secret": opts.secret,
  };
  if (opts.clientIp) {
    // PROD INCIDENT 2026-04-15: do NOT use `x-forwarded-for` here.
    // Cloudflare (in front of Supabase edge functions) PREPENDS its own
    // connecting-client IP (our Vercel egress IP) to the chain, so the
    // Supabase edge fn's `extractClientIp` — which takes `split(",")[0]`
    // — picks up the Vercel egress IP instead of the real browser IP.
    // Consequence: every signup from any user ends up keyed on the same
    // shared Vercel egress IP, the 5/hour IP rate limit becomes a
    // platform-wide cap, and real users get blocked after 5 total
    // signups anywhere.
    //
    // Fix: use a custom header `x-client-ip` that Cloudflare does NOT
    // prepend or touch. The Supabase edge fn reads this custom header
    // first (via its own extractor) and only falls back to
    // `x-forwarded-for` if `x-client-ip` is absent (e.g. direct caller
    // not going through the Vercel wrapper — which is blocked by the
    // shared secret gate anyway).
    headers["x-client-ip"] = opts.clientIp;
  }

  let res: Response;
  try {
    res = await doFetch(opts.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("[forwardToSupabase] fetch failed", err);
    return { allowed: false, reason: "internal_error" };
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!res.ok) {
    console.error(
      "[forwardToSupabase] non-ok response from Supabase edge fn",
      { status: res.status },
    );
    return { allowed: false, reason: "internal_error" };
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch (err) {
    console.error("[forwardToSupabase] malformed JSON response", err);
    return { allowed: false, reason: "internal_error" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { allowed: false, reason: "internal_error" };
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.allowed === true) {
    return { allowed: true };
  }
  if (obj.allowed === false && typeof obj.reason === "string") {
    return { allowed: false, reason: obj.reason };
  }
  return { allowed: false, reason: "internal_error" };
}
