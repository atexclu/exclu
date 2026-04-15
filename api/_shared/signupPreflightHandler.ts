/**
 * Testable core of the signup preflight Vercel Function.
 *
 * Factored out of `api/check-signup-allowed.ts` so unit tests can inject
 * a mock `checkBotId` and `forwardToSupabase` without touching the real
 * BotID runtime or the Supabase edge function. The top-level
 * `api/check-signup-allowed.ts` is a thin wrapper that binds the real
 * dependencies.
 *
 * Every error path is fail-closed — the client always sees HTTP 200 with
 * `{ allowed: false, reason: <code> }` so the human-facing message map
 * in `src/lib/deviceFingerprint.ts` can react consistently.
 */

// Types inlined to avoid a cross-file import that would force both Deno
// and Vite to agree on `.ts` extension resolution. The real function lives
// in `./forwardToSupabase.ts`; the handler only needs its structural shape.

interface SupabaseForwardBody {
  email: string;
  device_fingerprint?: string;
  user_agent?: string;
}

interface ForwardOptions {
  url: string;
  secret: string;
  clientIp?: string;
}

export type SupabaseForwardResult =
  | { allowed: true }
  | { allowed: false; reason: string };

type ForwardToSupabaseFn = (
  body: SupabaseForwardBody,
  opts: ForwardOptions,
) => Promise<SupabaseForwardResult>;

/**
 * Shape of `checkBotId()` from `botid/server`. Kept here as an opt-in
 * structural type so the helper does not depend on the runtime package.
 *
 * The real `checkBotId()` can return either:
 *   - a "verified" result with `isBot`/`isHuman`/`isVerifiedBot`/`bypassed`
 *   - or an intermediate "challenge-required" branch that carries only
 *     `responseHeaders` (no `isBot` key). This branch indicates the
 *     client never completed the BotID challenge — for a security gate,
 *     we MUST fail closed on it.
 */
export type CheckBotIdResult =
  | { isBot: boolean; isHuman?: boolean; isVerifiedBot?: boolean; bypassed?: boolean }
  | { responseHeaders?: unknown };

export type CheckBotIdFn = () => Promise<CheckBotIdResult>;

export interface SignupPreflightDeps {
  checkBotId: CheckBotIdFn;
  forwardToSupabase: ForwardToSupabaseFn;
}

export interface SignupPreflightEnv {
  /** SIGNUP_CHECK_INTERNAL_SECRET — must match the Supabase edge fn secret. */
  secret: string | undefined;
  /** Full URL of the Supabase edge function. */
  supabaseUrl: string;
}

type FailReason =
  | "bot_detected"
  | "invalid_email"
  | "internal_error"
  | string; // passthrough reasons from Supabase (disposable_email, etc.)

function failClosed(reason: FailReason): Response {
  return Response.json({ allowed: false, reason }, { status: 200 });
}

function ok(): Response {
  return Response.json({ allowed: true }, { status: 200 });
}

/**
 * Extract the trusted client IP. On Vercel, `x-vercel-forwarded-for` is
 * the preferred header — it is guaranteed to be set by Vercel's edge and
 * cannot be overwritten by a downstream proxy. `x-forwarded-for` is the
 * fallback (also overwritten by Vercel at ingress, but the vercel-specific
 * variant is the defensive choice per Vercel's request-headers docs).
 */
export function extractClientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    undefined
  );
}

/**
 * Main handler. Pure function — all side effects are injected via `deps`.
 */
export async function handleSignupPreflight(
  request: Request,
  env: SignupPreflightEnv,
  deps: SignupPreflightDeps,
): Promise<Response> {
  // 1. BotID check. Fails closed on ANY unexpected shape, not just
  //    `isBot === true`. Specifically, the challenge-required branch
  //    returns `{ responseHeaders }` with no `isBot` key — allowing it
  //    through would bypass BotID entirely.
  try {
    const verification = await deps.checkBotId();
    const hasIsBot =
      verification !== null &&
      typeof verification === "object" &&
      "isBot" in verification;
    if (!hasIsBot) {
      console.warn(
        "[check-signup-allowed] BotID result missing isBot — failing closed",
      );
      return failClosed("bot_detected");
    }
    if ((verification as { isBot: boolean }).isBot === true) {
      console.warn("[check-signup-allowed] BotID classified request as bot");
      return failClosed("bot_detected");
    }
  } catch (err) {
    console.error("[check-signup-allowed] checkBotId threw", err);
    return failClosed("bot_detected");
  }

  // 2. Parse + sanity check the body. Full validation happens in the
  //    Supabase edge fn; here we only reject the obviously wrong shapes
  //    so we don't waste a round-trip on empty bodies.
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return failClosed("invalid_email");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return failClosed("invalid_email");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return failClosed("invalid_email");
  }

  // 3. Env.
  if (!env.secret) {
    console.error(
      "[check-signup-allowed] SIGNUP_CHECK_INTERNAL_SECRET not configured in Vercel env",
    );
    return failClosed("internal_error");
  }

  // 4. Forward to Supabase, preserving the real client IP.
  const clientIp = extractClientIp(request);
  const deviceFingerprint =
    typeof body.device_fingerprint === "string"
      ? body.device_fingerprint
      : undefined;
  const userAgent =
    typeof body.user_agent === "string" ? body.user_agent : undefined;

  let result: SupabaseForwardResult;
  try {
    result = await deps.forwardToSupabase(
      { email, device_fingerprint: deviceFingerprint, user_agent: userAgent },
      { url: env.supabaseUrl, secret: env.secret, clientIp },
    );
  } catch (err) {
    console.error("[check-signup-allowed] forward threw", err);
    return failClosed("internal_error");
  }

  return result.allowed
    ? ok()
    : Response.json(
        { allowed: false, reason: result.reason },
        { status: 200 },
      );
}
