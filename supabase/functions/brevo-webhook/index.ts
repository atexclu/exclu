// supabase/functions/brevo-webhook/index.ts
//
// Phase 5 + Phase 6 — Brevo transactional webhook receiver.
//
// Brevo POSTs event payloads to a URL we configure in their dashboard:
//   https://<project>.supabase.co/functions/v1/brevo-webhook?secret=<BREVO_WEBHOOK_SECRET>
//
// Brevo doesn't sign webhooks — we authenticate via a shared secret in
// the query string. That's standard practice for Brevo integrations.
//
// Event payload shape (transactional):
//   {
//     "event": "delivered" | "opened" | "click" | "hard_bounce" | "soft_bounce"
//            | "blocked" | "spam" | "unsubscribed" | "invalid_email" | ...,
//     "email": "user@example.com",
//     "message-id": "<abc@smtp-relay.brevo.com>",   // matches our brevo_message_id
//     "date": "2026-04-16 14:00:00",                // provider timestamp (UTC)
//     "tag": "campaign,<slug>",
//     ...
//   }
//
// Brevo may also POST a batch: { events: [...] } or a single object. We
// normalize both shapes and forward each into record_campaign_event,
// which will either (a) match a send row and apply the event, or (b)
// park the event in email_campaign_events_pending for drain retry.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("BREVO_WEBHOOK_SECRET") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

function mapEvent(brevoEvent: string): string | null {
  switch (brevoEvent) {
    case "delivered":
      return "delivered";
    case "opened":
    case "unique_opened":
      return "opened";
    case "click":
    case "unique_click":
      return "clicked";
    case "hard_bounce":
      return "bounced";
    case "soft_bounce":
      return "soft_bounced";
    case "blocked":
      return "blocked";
    case "spam":
    case "complaint":
      return "complained";
    case "unsubscribed":
      return "unsubscribed";
    case "invalid_email":
      return "failed";
    default:
      return null;
  }
}

interface BrevoEvent {
  event: string;
  email?: string;
  "message-id"?: string;
  message_id?: string;
  date?: string;
  tag?: string;
  tags?: string[];
  [k: string]: unknown;
}

/**
 * Normalize Brevo's "date" field to an ISO timestamp usable as a dedup key.
 * Brevo sends "2026-04-16 14:00:00" (UTC, no offset). Date.parse accepts it
 * on Chrome/Deno but returns NaN on Safari for older strings — so we patch
 * by replacing the space with 'T' and appending 'Z' when needed.
 */
function normalizeBrevoDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  if (!cleaned) return null;
  let isoCandidate = cleaned;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(cleaned)) {
    isoCandidate = cleaned.replace(" ", "T") + "Z";
  }
  const t = Date.parse(isoCandidate);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/**
 * Return true only if the webhook event belongs to a real campaign send
 * we track in email_campaign_sends. Filters out:
 *   - Transactional emails (auth, link_content, tip…) — no "campaign" tag.
 *   - Test sends from the admin UI — tagged "test-send", not "campaign".
 *   - Brevo's own lifecycle events with no tag at all.
 *
 * Without this filter, record_campaign_event parks every transactional
 * webhook event in email_campaign_events_pending as a phantom race —
 * they'd never resolve and just pile up until the 24h orphan cutoff.
 */
function isCampaignEvent(ev: BrevoEvent): boolean {
  const raw = ev.tag ?? ev.tags;
  if (raw == null) return false;
  const asArray = Array.isArray(raw)
    ? raw.map((t) => String(t).toLowerCase())
    : String(raw).toLowerCase().split(",").map((t) => t.trim());
  return asArray.includes("campaign");
}

async function processOne(ev: BrevoEvent): Promise<"ok" | "skipped" | "error"> {
  const eventType = mapEvent(ev.event ?? "");
  if (!eventType) return "skipped";

  const messageId = (ev["message-id"] ?? ev.message_id ?? "").toString().trim();
  if (!messageId) return "skipped";

  // Gate: only campaign-tagged events become DB writes. Everything else
  // (transactional, test-sends) is acknowledged to Brevo but discarded.
  if (!isCampaignEvent(ev)) return "skipped";

  const occurredAtIso = normalizeBrevoDate(ev.date);

  const { error } = await admin.rpc("record_campaign_event", {
    p_brevo_message_id: messageId,
    p_event_type: eventType,
    p_meta: {
      brevo_event: ev.event,
      email: ev.email,
      date: ev.date,
      occurred_at: occurredAtIso,     // threaded through for pending dedup key
      tag: ev.tag ?? ev.tags ?? null,
    },
  });
  if (error) {
    console.error("[brevo-webhook] rpc failed for event", ev.event, messageId, error);
    return "error";
  }
  return "ok";
}

serve(async (req: Request) => {
  // 1. GET for Brevo's "test URL" ping.
  if (req.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  // 2. Shared-secret auth via query string.
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? url.searchParams.get("s") ?? "";
  if (!webhookSecret || secret !== webhookSecret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  // 3. Parse body (single event OR { events: [...] }).
  let payload: BrevoEvent | { events: BrevoEvent[] };
  try {
    payload = (await req.json()) as BrevoEvent | { events: BrevoEvent[] };
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const events: BrevoEvent[] = Array.isArray((payload as { events?: BrevoEvent[] }).events)
    ? (payload as { events: BrevoEvent[] }).events
    : [payload as BrevoEvent];

  let processed = 0;
  let skipped = 0;
  let errored = 0;
  for (const ev of events) {
    try {
      const outcome = await processOne(ev);
      if (outcome === "ok") processed++;
      else if (outcome === "skipped") skipped++;
      else errored++;
    } catch (err) {
      errored++;
      console.error("[brevo-webhook] processOne threw", err);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, received: events.length, processed, skipped, errored }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
