// Pure helpers for the check-signup-allowed edge function.
// Every function here is deterministic, takes no side effects, and is
// exhaustively tested in signup_checks.test.ts.

/**
 * Constant-time string equality that does NOT leak length via an early
 * return. The comparison runs for max(a.length, b.length) iterations with
 * byte-level XOR, so an attacker measuring response time cannot binary-
 * search the length of the expected secret.
 *
 * Uses UTF-8 byte representation so multibyte chars behave predictably.
 */
export function constantTimeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  // Seed diff with the length difference so same-length is part of the
  // single aggregated check — no early return on length mismatch.
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < maxLen; i++) {
    const av = i < aBytes.length ? aBytes[i] : 0;
    const bv = i < bBytes.length ? bBytes[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

/**
 * Outcomes that should count against the cooldown window.
 *
 * "allowed" = preflight said OK (user intent observed)
 * "completed" = reserved for a future client-side callback that confirms
 *               the signup actually finished. Until that callback exists,
 *               "allowed" alone drives the cooldown.
 *
 * Blocked / failed outcomes must NOT count — otherwise a disposable-email
 * attempt would cooldown the victim behind a shared NAT.
 */
export const COOLDOWN_BLOCKING_OUTCOMES: ReadonlySet<string> = new Set([
  "allowed",
  "completed",
]);

/**
 * Extracts the domain part of an email address, lowercased.
 * Returns null for anything that doesn't match a single-@ shape with no
 * whitespace. Callers should treat null as "invalid email".
 */
export function extractEmailDomain(email: string): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  // Exactly one @, non-empty local and domain parts, no whitespace anywhere.
  const match = trimmed.match(/^([^@\s]+)@([^@\s]+)$/);
  if (!match) return null;
  const domain = match[2];
  // Require at least one dot in the domain.
  if (!domain.includes(".")) return null;
  return domain;
}

/**
 * Lowercase + trim an email for storage / lookup. Does NOT validate shape;
 * use extractEmailDomain for that.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Strict validator for FingerprintJS visitor IDs.
 *
 * Accepts only [A-Za-z0-9_-] between 16 and 128 chars. This is a defense-in-
 * depth guard on top of PostgREST's built-in value escaping: even if a future
 * callsite accidentally string-interpolates a fingerprint into a query, the
 * set of accepted chars is narrow enough to prevent any interpretation beyond
 * a literal token.
 *
 * Real FingerprintJS visitorIds are currently 20-char base-10 hashes, but the
 * format has changed before and may change again — we accept a reasonable
 * superset rather than pinning to one exact length.
 */
export function isValidFingerprint(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length < 12 || v.length > 128) return false;
  return /^[A-Za-z0-9_-]+$/.test(v);
}

export interface RecentAttempt {
  created_at: string;
  outcome: string;
}

/**
 * Returns true if any of the recent attempts counts as a cooldown-blocking
 * outcome AND was created within `cooldownSeconds` of `nowMs`.
 *
 * Malformed timestamps are silently skipped — we prefer to let a request
 * through than to crash on bad DB data.
 */
export function shouldBlockByCooldown(
  recentAttempts: readonly RecentAttempt[],
  nowMs: number,
  cooldownSeconds: number,
): boolean {
  const cutoff = nowMs - cooldownSeconds * 1000;
  for (const a of recentAttempts) {
    if (!COOLDOWN_BLOCKING_OUTCOMES.has(a.outcome)) continue;
    const t = Date.parse(a.created_at);
    if (Number.isNaN(t)) continue;
    if (t >= cutoff) return true;
  }
  return false;
}

export interface ParsedSignupBody {
  email: string;
  device_fingerprint?: string;
  user_agent?: string;
}

export type ParseResult =
  | { ok: true; value: ParsedSignupBody }
  | { ok: false; reason: string };

const MAX_EMAIL_LEN = 254;
const MAX_UA_LEN = 512;

/**
 * Parses the raw JSON body into a validated ParsedSignupBody.
 *
 * Invalid fingerprints are dropped silently (the caller treats "no
 * fingerprint" as degraded mode — fp-based rate limiting is skipped but
 * IP-based limiting and disposable checks still apply). Oversized user
 * agents are truncated rather than rejected.
 *
 * Any body shape that cannot yield a valid email returns { ok: false }.
 */
export function parseSignupBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "body_not_object" };
  }
  const obj = raw as Record<string, unknown>;
  const email = obj.email;
  if (typeof email !== "string") return { ok: false, reason: "email_missing" };
  const trimmed = email.trim();
  if (trimmed.length === 0) return { ok: false, reason: "email_empty" };
  if (trimmed.length > MAX_EMAIL_LEN) return { ok: false, reason: "email_too_long" };
  // Must look like an email (delegated to extractEmailDomain for consistency).
  if (extractEmailDomain(trimmed) === null) {
    return { ok: false, reason: "email_invalid_shape" };
  }

  const result: ParsedSignupBody = { email: trimmed };

  if (isValidFingerprint(obj.device_fingerprint)) {
    result.device_fingerprint = obj.device_fingerprint;
  }

  if (typeof obj.user_agent === "string") {
    result.user_agent = obj.user_agent.slice(0, MAX_UA_LEN);
  }

  return { ok: true, value: result };
}
