// supabase/functions/_shared/unsubscribe_token.ts
//
// Deno/Web Crypto counterpart to api/_shared/unsubscribeToken.ts.
//
// Used by future Phase 5 edge functions that send campaign emails: they
// sign a token per recipient and embed `/unsubscribe?t=<token>` in the
// email. Verification happens in the Vercel /api/unsubscribe handler.
//
// The secret (UNSUBSCRIBE_HMAC_SECRET) MUST be the same string on both
// sides (Supabase secret + Vercel env var). HMAC-SHA256 is symmetric so
// tokens generated here verify cleanly over there, and vice versa.

function bytesToBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return new Uint8Array(sig);
}

export async function signUnsubscribeToken(
  email: string,
  secret: string,
): Promise<string> {
  const e = email.trim().toLowerCase();
  const emailPart = bytesToBase64Url(new TextEncoder().encode(e));
  const sig = await hmacSha256(secret, e);
  return `${emailPart}.${bytesToBase64Url(sig)}`;
}

export function buildUnsubscribeUrl(
  token: string,
  baseUrl = "https://exclu.at",
): string {
  return `${baseUrl.replace(/\/$/, "")}/unsubscribe?t=${token}`;
}
