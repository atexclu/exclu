/**
 * Server-side helper for api/check-signup-allowed.ts.
 *
 * Forwards a signup preflight request from the Vercel Function wrapper
 * to the Supabase edge function `check-signup-allowed`, attaching the
 * shared `x-internal-secret` header and preserving the original client
 * IP via `x-forwarded-for`.
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
  /** x-forwarded-for header value to forward (preserves the real browser IP for rate limiting). */
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
    headers["x-forwarded-for"] = opts.clientIp;
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
