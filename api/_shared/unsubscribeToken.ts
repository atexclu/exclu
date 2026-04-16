/**
 * Unsubscribe token — HMAC-SHA256 signed email.
 *
 * Format:  base64url(emailLowercase) "." base64url(hmacSha256(secret, emailLowercase))
 *
 * Tokens never expire — unsubscribe links must remain valid forever so
 * users can still opt out of email received years after we sent them.
 * Key rotation is a separate concern (add versioning when needed).
 */

import { createHmac } from "node:crypto";

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    s.length + ((4 - (s.length % 4)) % 4),
    "=",
  );
  return Buffer.from(padded, "base64");
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function signUnsubscribeToken(email: string, secret: string): string {
  const e = email.trim().toLowerCase();
  const emailPart = base64url(Buffer.from(e, "utf8"));
  const sig = createHmac("sha256", secret).update(e, "utf8").digest();
  return `${emailPart}.${base64url(sig)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
): { ok: true; email: string } | { ok: false; reason: string } {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing" };
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return { ok: false, reason: "malformed" };

  const emailPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let email: string;
  try {
    email = base64urlDecode(emailPart).toString("utf8").toLowerCase();
  } catch {
    return { ok: false, reason: "bad_email_encoding" };
  }
  if (!email || !email.includes("@")) return { ok: false, reason: "bad_email" };

  let sigGiven: Buffer;
  try {
    sigGiven = base64urlDecode(sigPart);
  } catch {
    return { ok: false, reason: "bad_sig_encoding" };
  }

  const sigExpected = createHmac("sha256", secret).update(email, "utf8").digest();
  if (!timingSafeEqual(sigGiven, sigExpected)) {
    return { ok: false, reason: "bad_signature" };
  }

  return { ok: true, email };
}
