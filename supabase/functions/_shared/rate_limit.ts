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
