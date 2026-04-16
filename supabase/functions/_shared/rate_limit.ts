import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitOptions {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  subKey?: string;
  /**
   * When the `rate_limit_check` RPC errors, should we block the caller
   * (`failClosed: true`) or let it through (`failClosed: false`)?
   *
   * Default is **fail open** (`false`) for backward compatibility with
   * non-security callers like campaign-send throttling — where a transient
   * DB error blocking all sends would be worse than letting a burst through.
   *
   * Security boundaries (signup, auth preflight, anything gating account
   * creation) MUST pass `failClosed: true`. The caller is responsible for
   * making that choice explicit.
   */
  failClosed?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  key: string;
  errored: boolean;
}

export function buildBucketKey(
  opts: Pick<RateLimitOptions, "scope" | "identifier" | "subKey"> & { scope: string },
): string {
  const parts = [opts.scope];
  if (opts.identifier.includes("@")) parts.push(opts.identifier);
  else parts.push(`ip:${opts.identifier}`);
  if (opts.subKey) parts.push(opts.subKey);
  return parts.join(":");
}

export async function checkRateLimit(
  supabase: SupabaseClient,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = buildBucketKey(opts);
  const { data, error } = await supabase.rpc("rate_limit_check", {
    p_key: key,
    p_limit: opts.limit,
    p_window_seconds: opts.windowSeconds,
  });
  if (error) {
    console.error("rate_limit_check RPC failed", { key, error });
    const failClosed = opts.failClosed === true;
    return { allowed: !failClosed, key, errored: true };
  }
  return { allowed: data === true, key, errored: false };
}

/**
 * Extract the client IP from a Request.
 *
 * Works correctly for edge functions called DIRECTLY from the browser:
 *   browser → Cloudflare (Supabase CDN) → edge fn
 * Cloudflare prepends the browser IP to `x-forwarded-for`, so
 * `split(",")[0]` returns the real browser IP.
 *
 * ⚠️  DOES NOT WORK for edge functions proxied through a Vercel Function:
 *   browser → Cloudflare (Vercel) → Vercel Fn → Cloudflare (Supabase) → edge fn
 * In that chain Cloudflare prepends the Vercel egress IP (not the browser IP)
 * to `x-forwarded-for`, so this helper would return the shared Vercel egress
 * IP for every user. That's what caused the 2026-04-15 prod incident where
 * `check-signup-allowed` mis-keyed its rate limit on the Vercel egress IP
 * and blocked real users across the platform after 5 total signups.
 *
 * Fix for Vercel-fronted functions: have the Vercel Function forward the
 * real browser IP via a CUSTOM header (we use `x-client-ip`) that Cloudflare
 * does not touch, and read that header in the edge fn BEFORE falling back
 * to this helper. See `supabase/functions/check-signup-allowed/handler.ts`
 * for the pattern. Current audit (2026-04-16): `check-signup-allowed` is
 * the only edge fn with a Vercel wrapper, so all other callers of this
 * helper are safe.
 */
export function extractClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip")
    ?? req.headers.get("x-real-ip")
    ?? "unknown";
}

export function serviceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
