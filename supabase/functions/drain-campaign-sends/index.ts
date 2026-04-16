// supabase/functions/drain-campaign-sends/index.ts
//
// Phase 5 — Queue drain for email_campaign_sends.
//
// Triggered every minute by api/cron/drain-campaigns.ts on Vercel.
// Authenticated via a shared secret header so only our cron can invoke it.
//
// Responsibilities:
//   1. Transition scheduled → sending (campaigns whose scheduled_at has passed)
//      and enqueue their recipients via resolve_campaign_segment
//   2. Pull up to BATCH_PER_TICK queued sends (respecting warmup cap)
//   3. For each: render HTML with HMAC unsub URL + UTM, POST to Brevo
//   4. Write back status (sent / failed) + brevo_message_id
//   5. Flip parent campaign to 'sent' when its queue is empty
//
// Never throws out of serve() — every error maps to a logged-and-moved-on
// per-send failure. Timebox: the Supabase edge runtime kills long invocations,
// so we hard-cap at BATCH_PER_TICK = 100 sends per invocation.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  renderCampaignHtml,
  sendTransactionalEmail,
  warmupCapForToday,
} from "../_shared/campaign_send.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
const senderEmail = Deno.env.get("BREVO_CAMPAIGN_SENDER_EMAIL") ?? "";
const senderName = Deno.env.get("BREVO_CAMPAIGN_SENDER_NAME") ?? "Exclu";
const replyTo = Deno.env.get("BREVO_CAMPAIGN_REPLY_TO") ?? "";
const unsubSecret = Deno.env.get("UNSUBSCRIBE_HMAC_SECRET") ?? "";
const warmupStart = Deno.env.get("EMAIL_WARMUP_START_DATE") ?? "";
const cronSecret = Deno.env.get("DRAIN_CAMPAIGNS_SECRET") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const BATCH_PER_TICK = 100;   // safety cap per invocation
const BREVO_RATE_SLEEP_MS = 100; // ≈10 emails/sec — well under Brevo's limit

function slugify(s: string): string {
  return (s || "campaign").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ========================================================================
// Step 1 — promote scheduled campaigns whose scheduled_at has passed
// ========================================================================
async function promoteScheduled(): Promise<number> {
  const { data: due } = await admin
    .from("email_campaigns")
    .select("id, segment_id, resolved_rules")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(5);

  let promoted = 0;
  for (const c of due ?? []) {
    // Resolve rules (prefer inline snapshot, fall back to segment lookup)
    let rules: Record<string, unknown> = (c.resolved_rules as Record<string, unknown>) ?? {};
    if (!c.resolved_rules && c.segment_id) {
      const { data: seg } = await admin
        .from("email_campaign_segments")
        .select("rules")
        .eq("id", c.segment_id)
        .maybeSingle();
      rules = (seg?.rules as Record<string, unknown>) ?? {};
    }

    const { data: recipients, error: resErr } = await admin.rpc("resolve_campaign_segment", {
      p_rules: rules,
    });
    if (resErr) {
      console.error("[drain] resolve failed for campaign", c.id, resErr);
      await admin
        .from("email_campaigns")
        .update({ status: "failed", last_error: `resolve_failed:${resErr.message}` })
        .eq("id", c.id);
      continue;
    }
    const rcpts = (recipients ?? []) as Array<{ email: string }>;
    if (rcpts.length === 0) {
      await admin
        .from("email_campaigns")
        .update({ status: "failed", last_error: "no_recipients" })
        .eq("id", c.id);
      continue;
    }

    // Flip to sending first so a crash during insert leaves a recoverable state
    await admin
      .from("email_campaigns")
      .update({
        status: "sending",
        started_at: new Date().toISOString(),
        total_recipients: rcpts.length,
        resolved_rules: rules,
      })
      .eq("id", c.id);

    const CHUNK = 1000;
    for (let i = 0; i < rcpts.length; i += CHUNK) {
      const slice = rcpts.slice(i, i + CHUNK).map((r) => ({
        campaign_id: c.id,
        email: r.email,
        status: "queued",
      }));
      await admin
        .from("email_campaign_sends")
        .upsert(slice, { onConflict: "campaign_id,email", ignoreDuplicates: true });
    }
    promoted++;
  }
  return promoted;
}

// ========================================================================
// Step 2 — drain queued sends
// ========================================================================

interface DrainResult {
  cap: number;
  sent_today: number;
  room: number;
  attempted: number;
  ok: number;
  failed: number;
  retryable: number;
}

async function drain(): Promise<DrainResult> {
  const cap = warmupStart ? warmupCapForToday(warmupStart) : 5000;
  const { data: todayCount } = await admin.rpc("count_campaign_sends_today");
  const sentToday = (todayCount as number) ?? 0;
  const room = Math.max(0, cap - sentToday);
  const batch = Math.min(room, BATCH_PER_TICK);

  if (batch === 0) {
    return { cap, sent_today: sentToday, room, attempted: 0, ok: 0, failed: 0, retryable: 0 };
  }

  // Pull a batch of queued sends. Join campaign to avoid N+1.
  const { data: rows, error } = await admin
    .from("email_campaign_sends")
    .select(`
      id, email, campaign_id,
      campaign:email_campaigns (id, subject, html_content, preheader, tag, name, status)
    `)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(batch);

  if (error) {
    console.error("[drain] fetch failed", error);
    return { cap, sent_today: sentToday, room, attempted: 0, ok: 0, failed: 0, retryable: 0 };
  }

  let ok = 0;
  let failed = 0;
  let retryable = 0;
  const sends = (rows ?? []) as Array<{
    id: string;
    email: string;
    campaign_id: string;
    campaign: {
      id: string;
      subject: string;
      html_content: string;
      preheader: string | null;
      tag: string | null;
      name: string;
      status: string;
    } | null;
  }>;

  // Claim all rows as 'sending' upfront so a parallel invocation doesn't double-send.
  const ids = sends.map((s) => s.id);
  if (ids.length > 0) {
    await admin.from("email_campaign_sends").update({ status: "sending" }).in("id", ids).eq("status", "queued");
  }

  for (const row of sends) {
    if (!row.campaign || row.campaign.status === "cancelled") {
      await admin
        .from("email_campaign_sends")
        .update({ status: "skipped", error: "campaign_cancelled" })
        .eq("id", row.id);
      continue;
    }

    const slug = slugify(row.campaign.tag ?? row.campaign.name);
    const renderedHtml = await renderCampaignHtml({
      html: row.campaign.html_content,
      email: row.email,
      campaignSlug: slug,
      preheader: row.campaign.preheader,
      unsubscribeSecret: unsubSecret,
    });

    const result = await sendTransactionalEmail({
      apiKey: brevoApiKey,
      senderEmail,
      senderName,
      replyToEmail: replyTo || undefined,
      to: { email: row.email },
      subject: row.campaign.subject,
      htmlContent: renderedHtml,
      tags: ["campaign", slug],
      headers: {
        "List-Unsubscribe": `<${"https://exclu.at"}/unsubscribe?t=placeholder>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (result.ok) {
      ok++;
      await admin
        .from("email_campaign_sends")
        .update({
          status: "sent",
          brevo_message_id: result.messageId,
          sent_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", row.id);
    } else if (result.retryable) {
      retryable++;
      // Put it back in queue for the next tick
      await admin
        .from("email_campaign_sends")
        .update({ status: "queued", error: `retryable:${result.reason.slice(0, 200)}` })
        .eq("id", row.id);
    } else {
      failed++;
      await admin
        .from("email_campaign_sends")
        .update({ status: "failed", error: result.reason.slice(0, 400) })
        .eq("id", row.id);
    }

    await sleep(BREVO_RATE_SLEEP_MS);
  }

  return { cap, sent_today: sentToday, room, attempted: sends.length, ok, failed, retryable };
}

// ========================================================================
// Step 3 — mark sending campaigns as sent when their queue is empty
// ========================================================================
async function closeFinishedCampaigns(): Promise<number> {
  const { data: inFlight } = await admin
    .from("email_campaigns")
    .select("id")
    .eq("status", "sending");

  let closed = 0;
  for (const c of inFlight ?? []) {
    const { count } = await admin
      .from("email_campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .in("status", ["queued", "sending"]);
    if ((count ?? 0) === 0) {
      await admin
        .from("email_campaigns")
        .update({ status: "sent", finished_at: new Date().toISOString() })
        .eq("id", c.id);
      closed++;
    }
  }
  return closed;
}

// ========================================================================
// Router
// ========================================================================

serve(async (req: Request) => {
  // Auth: shared secret header, NOT a user JWT. This fn is meant to be
  // hit only by the Vercel cron (api/cron/drain-campaigns.ts).
  const providedSecret = req.headers.get("x-drain-secret") ?? "";
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (!brevoApiKey || !senderEmail || !unsubSecret) {
    return new Response(JSON.stringify({ error: "misconfigured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const promoted = await promoteScheduled();
    const drainRes = await drain();
    const closed = await closeFinishedCampaigns();

    return new Response(
      JSON.stringify({ ok: true, promoted, closed, ...drainRes }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    console.error("[drain] unhandled", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
