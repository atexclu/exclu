/**
 * check-signup-allowed — request handler.
 *
 * Separated from index.ts so integration tests can import it directly
 * without triggering the top-level serve() call. See index.ts for the
 * full security rationale.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCorsHeaders,
  handleCors,
  jsonError,
  jsonOk,
} from "../_shared/cors.ts";
import { checkRateLimit, extractClientIp } from "../_shared/rate_limit.ts";
import {
  constantTimeStringEqual,
  extractEmailDomain,
  normalizeEmail,
  parseSignupBody,
  shouldBlockByCooldown,
} from "./signup_checks.ts";

export const CHECK_SIGNUP_CONFIG = {
  IP_LIMIT: 5,
  IP_WINDOW_SEC: 3600, // 1 hour
  FP_LIMIT: 3,
  FP_WINDOW_SEC: 86400, // 1 day
  COOLDOWN_SEC: 300, // 5 min
  RECENT_ATTEMPTS_LIMIT: 20,
  UNKNOWN_IP_DB: "0.0.0.0",
} as const;

type Outcome =
  | "allowed"
  | "blocked_rate"
  | "blocked_disposable"
  | "blocked_fingerprint"
  | "blocked_captcha"
  | "blocked_bot"
  | "failed_validation";

type Reason =
  | "invalid_email"
  | "disposable_email"
  | "too_many_signups_ip"
  | "too_many_signups_device"
  | "cooldown_active"
  | "internal_error";

export interface HandlerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SIGNUP_CHECK_INTERNAL_SECRET: string;
}

export function readEnv(): Partial<HandlerEnv> {
  return {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL") ?? undefined,
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? undefined,
    SIGNUP_CHECK_INTERNAL_SECRET: Deno.env.get("SIGNUP_CHECK_INTERNAL_SECRET") ?? undefined,
  };
}

export function ipForDb(raw: string): string {
  if (!raw || raw === "unknown") return CHECK_SIGNUP_CONFIG.UNKNOWN_IP_DB;
  if (!/^[0-9a-fA-F.:]+$/.test(raw)) return CHECK_SIGNUP_CONFIG.UNKNOWN_IP_DB;
  return raw;
}

function serviceClient(env: HandlerEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

async function logAttempt(
  svc: SupabaseClient,
  args: {
    email: string;
    ip: string;
    fingerprint?: string;
    userAgent?: string;
    outcome: Outcome;
    reason?: string;
  },
): Promise<void> {
  const { error } = await svc.from("signup_attempts").insert({
    email: normalizeEmail(args.email),
    ip: ipForDb(args.ip),
    device_fingerprint: args.fingerprint ?? null,
    user_agent: args.userAgent ?? null,
    outcome: args.outcome,
    block_reason: args.reason ?? null,
  });
  if (error) {
    console.error("signup_attempts insert failed", {
      outcome: args.outcome,
      reason: args.reason,
      error: error.message,
    });
  }
}

async function isDisposable(svc: SupabaseClient, domain: string): Promise<boolean> {
  const { data, error } = await svc
    .from("disposable_email_domains")
    .select("domain")
    .eq("domain", domain)
    .maybeSingle();
  if (error) {
    console.error("disposable lookup failed", { domain, error: error.message });
    throw new Error("disposable_lookup_failed");
  }
  return data !== null;
}

async function fetchRecentAttempts(
  svc: SupabaseClient,
  opts: { ip: string; fingerprint?: string; windowSeconds: number },
): Promise<Array<{ created_at: string; outcome: string }>> {
  const cutoff = new Date(Date.now() - opts.windowSeconds * 1000).toISOString();

  const ipQuery = svc
    .from("signup_attempts")
    .select("created_at, outcome")
    .eq("ip", ipForDb(opts.ip))
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(CHECK_SIGNUP_CONFIG.RECENT_ATTEMPTS_LIMIT);

  const fpQuery = opts.fingerprint
    ? svc
        .from("signup_attempts")
        .select("created_at, outcome")
        .eq("device_fingerprint", opts.fingerprint)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(CHECK_SIGNUP_CONFIG.RECENT_ATTEMPTS_LIMIT)
    : Promise.resolve({
        data: [] as Array<{ created_at: string; outcome: string }>,
        error: null,
      });

  const [ipRes, fpRes] = await Promise.all([ipQuery, fpQuery]);

  if (ipRes.error) {
    console.error("cooldown ip lookup failed", ipRes.error);
    throw new Error("cooldown_lookup_failed");
  }
  if (fpRes.error) {
    console.error("cooldown fp lookup failed", fpRes.error);
    throw new Error("cooldown_lookup_failed");
  }

  return [
    ...((ipRes.data as Array<{ created_at: string; outcome: string }> | null) ?? []),
    ...((fpRes.data as Array<{ created_at: string; outcome: string }> | null) ?? []),
  ];
}

/**
 * Main request handler. Pure-function entry point: takes a Request and the
 * env bag, returns a Response. No side effects at import time.
 */
export async function handleSignupCheck(
  req: Request,
  env: Partial<HandlerEnv>,
): Promise<Response> {
  const cors = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonError("method_not_allowed", 405, cors);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("check-signup-allowed: supabase env not configured");
    return jsonError("internal_error", 500, cors);
  }
  if (!env.SIGNUP_CHECK_INTERNAL_SECRET) {
    console.error("check-signup-allowed: SIGNUP_CHECK_INTERNAL_SECRET not configured");
    return jsonError("internal_error", 500, cors);
  }

  const provided = req.headers.get("x-internal-secret") ?? "";
  if (!constantTimeStringEqual(provided, env.SIGNUP_CHECK_INTERNAL_SECRET)) {
    console.error("check-signup-allowed: bad or missing x-internal-secret");
    return jsonError("unauthorized", 401, cors);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonOk(
      { allowed: false, reason: "invalid_email" satisfies Reason },
      cors,
    );
  }
  const parsed = parseSignupBody(rawBody);
  if (!parsed.ok) {
    return jsonOk(
      { allowed: false, reason: "invalid_email" satisfies Reason },
      cors,
    );
  }
  const body = parsed.value;
  // IP extraction — read the TRUSTED `x-client-ip` header set by our
  // Vercel Function wrapper FIRST. This header is a custom name that
  // Cloudflare (in front of Supabase edge runtime) does NOT touch.
  //
  // PROD INCIDENT 2026-04-15: we used to read `x-forwarded-for` here,
  // but Cloudflare prepends the connecting IP (Vercel's egress IP) to
  // the chain. `extractClientIp(req)` does `split(",")[0]` which picks
  // up the Vercel egress IP — effectively keying the IP rate limit on
  // a single shared platform IP. Real users hit `too_many_signups_ip`
  // after 5 total signups anywhere on the platform.
  //
  // The Vercel Function wrapper (api/_shared/forwardToSupabase.ts) now
  // sends the real browser IP as `x-client-ip`. We read that first and
  // fall back to `extractClientIp` only for direct callers (which are
  // blocked by the shared secret gate above anyway — this fallback
  // exists just for future-proofing in case some legitimate caller
  // skips the wrapper).
  const ip =
    req.headers.get("x-client-ip") ??
    extractClientIp(req);

  const fullEnv = env as HandlerEnv;
  const svc = serviceClient(fullEnv);

  const domain = extractEmailDomain(body.email);
  if (!domain) {
    await logAttempt(svc, {
      email: body.email,
      ip,
      fingerprint: body.device_fingerprint,
      userAgent: body.user_agent,
      outcome: "failed_validation",
      reason: "invalid_email",
    });
    return jsonOk(
      { allowed: false, reason: "invalid_email" satisfies Reason },
      cors,
    );
  }

  try {
    if (await isDisposable(svc, domain)) {
      await logAttempt(svc, {
        email: body.email,
        ip,
        fingerprint: body.device_fingerprint,
        userAgent: body.user_agent,
        outcome: "blocked_disposable",
      });
      return jsonOk(
        { allowed: false, reason: "disposable_email" satisfies Reason },
        cors,
      );
    }

    const ipLimit = await checkRateLimit(svc, {
      scope: "signup-ip",
      identifier: ip,
      limit: CHECK_SIGNUP_CONFIG.IP_LIMIT,
      windowSeconds: CHECK_SIGNUP_CONFIG.IP_WINDOW_SEC,
      failClosed: true,
    });
    if (!ipLimit.allowed) {
      await logAttempt(svc, {
        email: body.email,
        ip,
        fingerprint: body.device_fingerprint,
        userAgent: body.user_agent,
        outcome: "blocked_rate",
        reason: ipLimit.errored ? "ip_rpc_failed" : "ip_window_exhausted",
      });
      return jsonOk(
        { allowed: false, reason: "too_many_signups_ip" satisfies Reason },
        cors,
      );
    }

    if (body.device_fingerprint) {
      const fpLimit = await checkRateLimit(svc, {
        scope: "signup-fp",
        identifier: body.device_fingerprint,
        limit: CHECK_SIGNUP_CONFIG.FP_LIMIT,
        windowSeconds: CHECK_SIGNUP_CONFIG.FP_WINDOW_SEC,
        failClosed: true,
      });
      if (!fpLimit.allowed) {
        await logAttempt(svc, {
          email: body.email,
          ip,
          fingerprint: body.device_fingerprint,
          userAgent: body.user_agent,
          outcome: "blocked_fingerprint",
          reason: fpLimit.errored ? "fp_rpc_failed" : "fp_window_exhausted",
        });
        return jsonOk(
          { allowed: false, reason: "too_many_signups_device" satisfies Reason },
          cors,
        );
      }
    }

    const recent = await fetchRecentAttempts(svc, {
      ip,
      fingerprint: body.device_fingerprint,
      windowSeconds: CHECK_SIGNUP_CONFIG.COOLDOWN_SEC,
    });
    if (shouldBlockByCooldown(recent, Date.now(), CHECK_SIGNUP_CONFIG.COOLDOWN_SEC)) {
      await logAttempt(svc, {
        email: body.email,
        ip,
        fingerprint: body.device_fingerprint,
        userAgent: body.user_agent,
        outcome: "blocked_rate",
        reason: "cooldown_active",
      });
      return jsonOk(
        { allowed: false, reason: "cooldown_active" satisfies Reason },
        cors,
      );
    }

    await logAttempt(svc, {
      email: body.email,
      ip,
      fingerprint: body.device_fingerprint,
      userAgent: body.user_agent,
      outcome: "allowed",
    });
    return jsonOk({ allowed: true }, cors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("check-signup-allowed unhandled failure", msg);
    await logAttempt(svc, {
      email: body.email,
      ip,
      fingerprint: body.device_fingerprint,
      userAgent: body.user_agent,
      outcome: "failed_validation",
      reason: "internal_error",
    }).catch(() => {});
    return jsonOk(
      { allowed: false, reason: "internal_error" satisfies Reason },
      cors,
    );
  }
}
