// supabase/functions/brevo-webhook/index.ts
//
// Phase 5 — Brevo transactional webhook receiver.
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
//     "date": "2026-04-16 14:00:00",
//     "tag": "campaign,<slug>",
//     ...
//   }
//
// Brevo may also POST a batch: { events: [...] } or a single object. We
// normalize both shapes.

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
    // Ignore non-terminal / info-only events
    case "deferred":
    case "request":
    case "opened_click_link":
    case "error":
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

async function processOne(ev: BrevoEvent): Promise<void> {
  const eventType = mapEvent(ev.event ?? "");
  if (!eventType) return;

  const messageId = (ev["message-id"] ?? ev.message_id ?? "").toString().trim();
  if (!messageId) return;

  const { error } = await admin.rpc("record_campaign_event", {
    p_brevo_message_id: messageId,
    p_event_type: eventType,
    p_meta: {
      brevo_event: ev.event,
      email: ev.email,
      date: ev.date,
      tag: ev.tag ?? ev.tags ?? null,
    },
  });
  if (error) {
    console.error("[brevo-webhook] rpc failed for event", ev.event, messageId, error);
  }
}

serve(async (req: Request) => {
  // 1. Accept GET for Brevo's "test URL" ping
  if (req.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  // 2. Shared-secret auth via query string
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

  // 3. Parse body (single event OR { events: [...] })
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
  for (const ev of events) {
    try {
      await processOne(ev);
      processed++;
    } catch (err) {
      console.error("[brevo-webhook] processOne threw", err);
    }
  }

  return new Response(JSON.stringify({ ok: true, received: events.length, processed }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});
