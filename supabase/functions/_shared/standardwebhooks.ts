/**
 * Standard Webhooks HMAC-SHA256 signature verifier.
 *
 * Used by send-auth-email to verify the Supabase Auth "Send Email" hook call.
 * Spec: https://www.standardwebhooks.com/
 *
 * Supabase webhook secrets come in the form `v1,whsec_<base64>`. We strip the
 * prefix and base64-decode the remainder to get the raw HMAC key.
 */

const TOLERANCE_SECONDS = 5 * 60;
const enc = new TextEncoder();

function base64Decode(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Normalize a Supabase/Standard Webhooks secret string to its raw key bytes.
 * Accepts any of:
 *   - `v1,whsec_<base64>`  (Supabase format)
 *   - `whsec_<base64>`     (Standard Webhooks format)
 *   - `<base64>`           (raw base64)
 */
export function parseWebhookSecret(secret: string): Uint8Array {
  let key = secret.trim();
  if (key.startsWith("v1,")) key = key.slice(3);
  if (key.startsWith("whsec_")) key = key.slice(6);
  return base64Decode(key);
}

export interface VerifyParams {
  headers: Headers;
  rawBody: string;
  secret: string;
  /** Override `Date.now()` for testing. */
  nowMs?: number;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * Verify a Standard Webhooks payload. Throws WebhookVerificationError on any
 * failure (missing headers, stale timestamp, bad signature, malformed secret).
 * Returns void on success.
 */
export async function verifyStandardWebhook(params: VerifyParams): Promise<void> {
  const { headers, rawBody, secret } = params;
  const nowMs = params.nowMs ?? Date.now();

  const id = headers.get("webhook-id");
  const timestampStr = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");

  if (!id) throw new WebhookVerificationError("Missing webhook-id header");
  if (!timestampStr) {
    throw new WebhookVerificationError("Missing webhook-timestamp header");
  }
  if (!signatureHeader) {
    throw new WebhookVerificationError("Missing webhook-signature header");
  }

  const timestamp = Number.parseInt(timestampStr, 10);
  if (!Number.isFinite(timestamp)) {
    throw new WebhookVerificationError("Invalid webhook-timestamp");
  }

  const driftSec = Math.abs(nowMs / 1000 - timestamp);
  if (driftSec > TOLERANCE_SECONDS) {
    throw new WebhookVerificationError(
      `Webhook timestamp out of tolerance (drift=${driftSec.toFixed(0)}s)`,
    );
  }

  let keyBytes: Uint8Array;
  try {
    keyBytes = parseWebhookSecret(secret);
  } catch {
    throw new WebhookVerificationError("Malformed webhook secret");
  }

  const toSign = `${id}.${timestampStr}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(toSign));
  const expectedBytes = new Uint8Array(sigBuf);

  // Header may contain multiple space-separated signatures, each prefixed `v1,`
  const parts = signatureHeader.split(" ").filter(Boolean);
  for (const p of parts) {
    if (!p.startsWith("v1,")) continue;
    const providedB64 = p.slice(3);
    let providedBytes: Uint8Array;
    try {
      providedBytes = base64Decode(providedB64);
    } catch {
      continue; // skip malformed parts; next part might still match
    }
    if (constantTimeEqual(providedBytes, expectedBytes)) return;
  }

  throw new WebhookVerificationError("Invalid webhook signature");
}

// Re-export for consumers that want to format a signature (e.g., tests)
export async function _signForTest(
  id: string,
  timestampStr: string,
  rawBody: string,
  secret: string,
): Promise<string> {
  const keyBytes = parseWebhookSecret(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(`${id}.${timestampStr}.${rawBody}`),
  );
  return `v1,${base64Encode(new Uint8Array(sig))}`;
}
