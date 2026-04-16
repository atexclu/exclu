/**
 * /api/cron/drain-campaigns — Vercel cron job, every minute.
 *
 * Configured via `crons` in vercel.json. Vercel only invokes cron paths
 * from its internal dispatcher — it signs the request with a bearer
 * token we verify against CRON_SECRET. We then forward to the
 * Supabase `drain-campaign-sends` edge function which does the real work
 * (promote scheduled, pull queued, send via Brevo, close finished).
 *
 * The Supabase fn has its own shared-secret gate (DRAIN_CAMPAIGNS_SECRET)
 * so even if this Vercel endpoint was exposed accidentally, it can only
 * trigger a drain if both secrets match.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

const DEFAULT_DRAIN_URL =
  "https://qexnwezetjlbwltyccks.supabase.co/functions/v1/drain-campaign-sends";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // Vercel cron signs its own invocations with CRON_SECRET via the
  // Authorization header. Reject anything else.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers["authorization"] ?? "";
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const drainSecret = process.env.DRAIN_CAMPAIGNS_SECRET;
  const drainUrl = process.env.DRAIN_CAMPAIGN_SENDS_URL ?? DEFAULT_DRAIN_URL;
  if (!drainSecret) {
    res.status(500).json({ error: "missing_drain_secret" });
    return;
  }

  let body = "{}";
  try {
    const resp = await fetch(drainUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drain-secret": drainSecret,
      },
      body: "{}",
    });
    body = await resp.text();
    res.status(resp.status).send(body);
  } catch (err) {
    console.error("[cron/drain-campaigns] fetch failed", err);
    res.status(502).json({ error: "drain_fetch_failed", detail: (err as Error).message });
  }
}
