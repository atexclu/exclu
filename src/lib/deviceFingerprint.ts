/**
 * Client-side device fingerprinting + signup preflight helper.
 *
 * The preflight flow:
 *   client  →  POST /api/check-signup-allowed   (Vercel Function)
 *          ←   { allowed, reason? }
 *
 * The Vercel Function is responsible for Vercel BotID verification and
 * forwards the request to the Supabase edge function `check-signup-allowed`
 * with the shared secret header `x-internal-secret`. See
 * `docs/research/hoo-be-signup-flow.md` for the full architecture.
 *
 * This entire flow is gated behind the `VITE_SIGNUP_PREFLIGHT_ENABLED`
 * build-time flag so Phase 2A can ship the client code without activating
 * it. Phase 2B deploys the Vercel Function, sets the secret in Supabase,
 * and flips the flag to `"true"` in Vercel env vars — all in one session.
 * Until then, `preflightSignup` is a permissive no-op.
 */

import FingerprintJS from "@fingerprintjs/fingerprintjs";

export type PreflightReason =
  | "disposable_email"
  | "too_many_signups_ip"
  | "too_many_signups_device"
  | "cooldown_active"
  | "invalid_email"
  | "internal_error"
  | "bot_detected"
  | "network_error"
  | "unknown";

const KNOWN_PREFLIGHT_REASONS: ReadonlySet<PreflightReason> = new Set<PreflightReason>([
  "disposable_email",
  "too_many_signups_ip",
  "too_many_signups_device",
  "cooldown_active",
  "invalid_email",
  "internal_error",
  "bot_detected",
  "network_error",
  "unknown",
]);

function normalizeReason(raw: unknown): PreflightReason {
  if (typeof raw !== "string") return "unknown";
  return (KNOWN_PREFLIGHT_REASONS as ReadonlySet<string>).has(raw)
    ? (raw as PreflightReason)
    : "unknown";
}

export type PreflightResult =
  | { ok: true }
  | { ok: false; reason: PreflightReason };

function preflightEnabled(): boolean {
  return import.meta.env.VITE_SIGNUP_PREFLIGHT_ENABLED === "true";
}

let fingerprintCache: Promise<string> | null = null;

/**
 * Lazily loads FingerprintJS and returns the visitor ID. Subsequent calls
 * return the cached promise. FingerprintJS is ~100 kB gzipped and should
 * only load if preflight is actually enabled.
 */
export function getDeviceFingerprint(): Promise<string> {
  if (!fingerprintCache) {
    fingerprintCache = FingerprintJS.load()
      .then((fp) => fp.get())
      .then((r) => r.visitorId);
  }
  return fingerprintCache;
}

/**
 * Test-only helper to clear the module-level cache between test cases.
 * Not part of the runtime contract — do not call from application code.
 */
export function _resetFingerprintCacheForTests(): void {
  fingerprintCache = null;
}

/**
 * Human-readable error messages for each preflight block reason.
 * The preflight endpoint never reveals WHY a specific email/IP was blocked
 * beyond the reason category — this mapping is the only place where user-
 * visible copy lives.
 */
export function humanizeReason(reason: PreflightReason): string {
  const map: Record<PreflightReason, string> = {
    disposable_email: "Please use a real email address — disposable inboxes are not accepted.",
    too_many_signups_ip: "Too many signups from this network. Please try again in an hour.",
    too_many_signups_device: "Too many signups from this device. Please try again tomorrow.",
    cooldown_active: "Please wait a few minutes before creating another account.",
    invalid_email: "This email address is invalid.",
    internal_error: "Signup is temporarily unavailable. Please try again shortly.",
    bot_detected: "Automated signups are not allowed. If you're a human, please try again with JavaScript enabled.",
    network_error: "Could not reach the signup server. Check your connection and try again.",
    unknown: "Signup is temporarily unavailable. Please try again shortly.",
  };
  return map[reason] ?? map.unknown;
}

/**
 * Preflight a signup attempt. Returns `{ ok: true }` if the preflight
 * endpoint allows it (or if preflight is disabled via feature flag) and
 * `{ ok: false, reason }` otherwise.
 *
 * Failure modes:
 * - Preflight disabled: always returns `{ ok: true }`. Phase 2A ships with
 *   this state and the existing supabase.auth.signUp flow remains unchanged.
 * - Fingerprint generation fails: proceed without a fingerprint. The
 *   server-side IP rate limit + disposable check still apply.
 * - Network error reaching /api/check-signup-allowed: return
 *   `{ ok: false, reason: "network_error" }`. The UI must block the signup
 *   and show the humanized message — this is fail-closed client-side
 *   behavior that matches the server-side fail-closed defaults.
 * - Server returns non-200: treated as `internal_error`.
 * - Server returns `{ allowed: false, reason: X }`: returned as-is.
 */
export async function preflightSignup(email: string): Promise<PreflightResult> {
  if (!preflightEnabled()) {
    return { ok: true };
  }

  let fingerprint: string | undefined;
  try {
    fingerprint = await getDeviceFingerprint();
  } catch {
    // Degraded mode: no fingerprint. IP rate limit + disposable still apply.
    fingerprint = undefined;
  }

  let res: Response;
  try {
    res = await fetch("/api/check-signup-allowed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        device_fingerprint: fingerprint,
        user_agent: navigator.userAgent,
      }),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  if (!res.ok) {
    // 401 (secret mismatch), 500 (server config), etc. all bucket to
    // internal_error from the user's perspective.
    return { ok: false, reason: "internal_error" };
  }

  let body: { allowed?: boolean; reason?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, reason: "internal_error" };
  }

  if (body.allowed === true) return { ok: true };

  return { ok: false, reason: normalizeReason(body.reason) };
}
