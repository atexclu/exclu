/**
 * /api/unsubscribe — one-click marketing opt-out via HMAC-signed token.
 *
 * The unsubscribe link in every Exclu marketing email points to
 * /unsubscribe?t=<token> (the React page at src/pages/Unsubscribe.tsx).
 * The page mounts and POSTs { token } to this function. We verify the
 * HMAC, call Supabase with the service role to flip mailing_contacts,
 * and return { ok, email }. No auth session required.
 *
 * Uses the legacy @vercel/node signature to stay consistent with the
 * other api/* handlers and avoid the Vercel dual-pattern issue that hit
 * Phase 2B (see api/check-signup-allowed.ts for the context).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifyUnsubscribeToken } from "./_shared/unsubscribeToken.js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  "https://qexnwezetjlbwltyccks.supabase.co";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, reason: "method_not_allowed" });
    return;
  }

  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) {
    console.error("[unsubscribe] missing env: UNSUBSCRIBE_HMAC_SECRET or SUPABASE_SERVICE_ROLE_KEY");
    res.status(500).json({ ok: false, reason: "misconfigured" });
    return;
  }

  const body = (req.body && typeof req.body === "object" ? req.body : {}) as {
    token?: unknown;
  };
  const token = typeof body.token === "string" ? body.token : "";

  const verdict = verifyUnsubscribeToken(token, secret);
  if (!verdict.ok) {
    res.status(400).json({ ok: false, reason: verdict.reason });
    return;
  }

  const { email } = verdict;

  // Call Supabase REST with service role to flip the row. Service role
  // bypasses RLS; the table has no insert/update/delete policy so only
  // service_role can mutate it. We use an RPC-like upsert via POST on
  // the table: first try UPDATE, fall back to INSERT if the contact
  // doesn't exist yet (edge case: user never transacted + never signed up).
  const now = new Date().toISOString();
  const restUrl = `${SUPABASE_URL}/rest/v1/mailing_contacts`;

  // Attempt UPDATE using PATCH with email filter.
  const patchRes = await fetch(`${restUrl}?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({
      marketing_opted_in: false,
      marketing_opted_out_at: now,
      updated_at: now,
    }),
  });

  let rows: Array<{ email: string }> = [];
  if (patchRes.ok) {
    rows = (await patchRes.json()) as Array<{ email: string }>;
  } else {
    const txt = await patchRes.text().catch(() => "");
    console.error("[unsubscribe] PATCH failed", patchRes.status, txt);
    res.status(502).json({ ok: false, reason: "update_failed" });
    return;
  }

  // If no row matched, insert one so the opt-out is recorded.
  if (rows.length === 0) {
    const insertRes = await fetch(restUrl, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        prefer: "return=representation,resolution=ignore-duplicates",
      },
      body: JSON.stringify({
        email,
        role: "fan",
        first_source: "unsubscribe",
        last_source: "unsubscribe",
        marketing_opted_in: false,
        marketing_opted_out_at: now,
      }),
    });
    if (!insertRes.ok) {
      const txt = await insertRes.text().catch(() => "");
      console.error("[unsubscribe] INSERT failed", insertRes.status, txt);
      res.status(502).json({ ok: false, reason: "insert_failed" });
      return;
    }
  }

  // Audit log entry.
  await fetch(`${SUPABASE_URL}/rest/v1/mailing_contact_events`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      email,
      source: "unsubscribe",
      source_ref: "email_link",
    }),
  }).catch((err) => {
    console.warn("[unsubscribe] event log failed (non-fatal)", err);
  });

  res.status(200).json({ ok: true, email });
}
