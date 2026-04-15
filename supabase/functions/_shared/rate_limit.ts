import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitOptions {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  subKey?: string;
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
): Promise<{ allowed: boolean; key: string }> {
  const key = buildBucketKey(opts);
  const { data, error } = await supabase.rpc("rate_limit_check", {
    p_key: key,
    p_limit: opts.limit,
    p_window_seconds: opts.windowSeconds,
  });
  if (error) {
    console.error("rate_limit_check RPC failed", error);
    return { allowed: true, key }; // fail open
  }
  return { allowed: data === true, key };
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
