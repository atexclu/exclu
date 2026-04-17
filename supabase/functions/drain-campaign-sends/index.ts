// supabase/functions/drain-campaign-sends/index.ts
//
// Phase 5 + Phase 6 — Queue drain for email_campaign_sends.
//
// Triggered every minute by api/cron/drain-campaigns.ts on Vercel.
// Authenticated via a shared secret header so only our cron can invoke it.
//
// Pipeline (executed in order, on every tick):
//   0. Reclaim rows stuck in 'sending' longer than STUCK_SENDING_MINUTES
//      (crash-recovery for the window between CAS and post-Brevo update).
//   1. Process pending webhook events (brevo-webhook inserts to pending
//      when a send row isn't found; drain retries the match here).
//   2. Promote scheduled campaigns whose scheduled_at is in the past and
//      enqueue their recipients via resolve_campaign_segment.
//   3. Pull up to BATCH_PER_TICK eligible sends (status=queued OR
//      retrying with next_retry_at<=now) respecting warmup cap.
//   4. For each: render HTML, build headers, POST Brevo. On success →
//      status='sent' + brevo_message_id. On 429/5xx → schedule retry
//      with backoff. On 4xx non-retriable → status='failed'.
//   5. Close out campaigns whose queue is empty → status='sent'.
//
// Never throws out of serve() — every error maps to a logged-and-moved-on
// per-send failure. Timebox: the Supabase edge runtime kills long
// invocations, so we hard-cap at BATCH_PER_TICK = 100 sends per invocation.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildCampaignHeaders,
  renderCampaignHtml,
  sendTransactionalEmail,
  slugifyForUtm,
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

const BATCH_PER_TICK = 100;          // safety cap per invocation
const BREVO_RATE_SLEEP_MS = 100;     // ≈10 emails/sec — well under Brevo's limit
const STUCK_SENDING_MINUTES = 10;    // older 'sending' rows are reclaimed
const PENDING_EVENTS_MAX_AGE_HOURS = 24;
const PENDING_EVENTS_BATCH = 500;
const MAX_RETRIES = 3;               // 4 total delivery attempts per row

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ========================================================================
// Step 0 — reclaim rows stuck in 'sending'
// ========================================================================
async function reclaimStuckSending(): Promise<number> {
  const { data, error } = await admin.rpc("reclaim_stuck_campaign_sends", {
    p_timeout_minutes: STUCK_SENDING_MINUTES,
  });
  if (error) {
    console.error("[drain] reclaim_stuck_campaign_sends failed", error);
    return 0;
  }
  return (data as number) ?? 0;
}

// ========================================================================
// Step 1 — process pending webhook events
// ========================================================================
async function processPendingEvents(): Promise<{ promoted: number; orphaned: number; scanned: number }> {
  const { data, error } = await admin.rpc("process_pending_campaign_events", {
    p_max_age_hours: PENDING_EVENTS_MAX_AGE_HOURS,
    p_batch_size: PENDING_EVENTS_BATCH,
  });
  if (error) {
    console.error("[drain] process_pending_campaign_events failed", error);
    return { promoted: 0, orphaned: 0, scanned: 0 };
  }
  // RPC returns a table (one row); supabase-js surfaces an array.
  const row = Array.isArray(data) ? data[0] : data;
  return {
    promoted: row?.promoted ?? 0,
    orphaned: row?.orphaned ?? 0,
    scanned: row?.scanned ?? 0,
  };
}

// ========================================================================
// Step 2 — promote scheduled campaigns whose scheduled_at has passed
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
    let rules: Record<string, unknown> = (c.resolved_rules as Record<string, unknown>) ?? {};
    if (!c.resolved_rules && c.segment_id) {
      const { data: seg } = await admin
        .from("email_campaign_segments")
        .select("rules")
        .eq("id", c.segment_id)
        .maybeSingle();
      rules = (seg?.rules as Record<string, unknown>) ?? {};
    }

    // Mirror start_campaign guard: refuse to promote a scheduled campaign
    // with no filters AND no linked segment.
    const hasAnyFilter = Object.entries(rules).some(([, v]) => {
      if (v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "string") return v.trim().length > 0;
      return true;
    });
    if (!hasAnyFilter && !c.segment_id) {
      console.error("[drain] refusing to promote scheduled campaign with empty rules", c.id);
      await admin
        .from("email_campaigns")
        .update({ status: "failed", last_error: "promote_blocked:empty_rules" })
        .eq("id", c.id);
      continue;
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
// Step 3 — drain queued + due-retry sends
// ========================================================================

interface DrainResult {
  cap: number;
  sent_today: number;
  room: number;
  attempted: number;
  succeeded: number;
  failed: number;
  retry_scheduled: number;
}

async function drain(): Promise<DrainResult> {
  const cap = warmupStart ? warmupCapForToday(warmupStart) : 5000;
  const { data: todayCount } = await admin.rpc("count_campaign_sends_today");
  const sentToday = (todayCount as number) ?? 0;
  const room = Math.max(0, cap - sentToday);
  const batch = Math.min(room, BATCH_PER_TICK);

  if (batch === 0) {
    return { cap, sent_today: sentToday, room, attempted: 0, succeeded: 0, failed: 0, retry_scheduled: 0 };
  }

  // Pick up queued rows AND retrying rows whose next_retry_at <= now().
  // Supabase .or() lets us express that with a single query so the LIMIT
  // applies to the merged stream, ordered by created_at.
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await admin
    .from("email_campaign_sends")
    .select(`
      id, email, campaign_id, idempotency_key, retry_count, status,
      campaign:email_campaigns (id, subject, html_content, preheader, tag, name, status)
    `)
    .or(`status.eq.queued,and(status.eq.retrying,next_retry_at.lte.${nowIso})`)
    .order("created_at", { ascending: true })
    .limit(batch);

  if (error) {
    console.error("[drain] fetch failed", error);
    return { cap, sent_today: sentToday, room, attempted: 0, succeeded: 0, failed: 0, retry_scheduled: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let retryScheduled = 0;

  // supabase-js types nested relationship selects as an array regardless of
  // cardinality. At runtime, a to-one relation arrives as either an object
  // or null. Cast through unknown to silence the array-vs-object mismatch.
  const sends = (rows ?? []) as unknown as Array<{
    id: string;
    email: string;
    campaign_id: string;
    idempotency_key: string;
    retry_count: number;
    status: string;
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

  // Atomic claim: queued|retrying → sending + sending_started_at stamp.
  // A parallel drain invocation cannot double-claim because the predicate
  // requires status in ('queued','retrying').
  const ids = sends.map((s) => s.id);
  if (ids.length > 0) {
    await admin
      .from("email_campaign_sends")
      .update({ status: "sending", sending_started_at: nowIso })
      .in("id", ids)
      .in("status", ["queued", "retrying"]);
  }

  for (const row of sends) {
    if (!row.campaign || row.campaign.status === "cancelled") {
      await admin
        .from("email_campaign_sends")
        .update({ status: "skipped", error: "campaign_cancelled", sending_started_at: null })
        .eq("id", row.id);
      continue;
    }

    const slug = slugifyForUtm(row.campaign.tag ?? row.campaign.name);
    const rendered = await renderCampaignHtml({
      html: row.campaign.html_content,
      email: row.email,
      campaignSlug: slug,
      preheader: row.campaign.preheader,
      unsubscribeSecret: unsubSecret,
    });

    const headers = {
      ...buildCampaignHeaders({
        idempotencyKey: row.idempotency_key,
        campaignId: row.campaign.id,
        campaignSlug: slug,
        unsubscribeUrl: rendered.unsubscribeUrl,
        pool: "marketing",
      }),
    };

    const result = await sendTransactionalEmail({
      apiKey: brevoApiKey,
      senderEmail,
      senderName,
      replyToEmail: replyTo || undefined,
      to: { email: row.email },
      subject: row.campaign.subject,
      htmlContent: rendered.html,
      tags: ["campaign", slug],
      headers,
    });

    if (result.ok) {
      succeeded++;
      await admin
        .from("email_campaign_sends")
        .update({
          status: "sent",
          brevo_message_id: result.messageId,
          sent_at: new Date().toISOString(),
          sending_started_at: null,
          error: null,
        })
        .eq("id", row.id);
    } else if (result.retryable) {
      // Schedule an RPC-driven backoff retry. On max_retries exhausted
      // the RPC flips status to 'failed' internally.
      const { data: retryStatus } = await admin.rpc("schedule_campaign_send_retry", {
        p_send_id: row.id,
        p_error: `brevo_${result.status}:${result.reason}`.slice(0, 400),
        p_max_retries: MAX_RETRIES,
      });
      if (retryStatus === "failed") failed++;
      else retryScheduled++;
    } else {
      failed++;
      await admin
        .from("email_campaign_sends")
        .update({
          status: "failed",
          error: result.reason.slice(0, 400),
          sending_started_at: null,
        })
        .eq("id", row.id);
    }

    await sleep(BREVO_RATE_SLEEP_MS);
  }

  return {
    cap,
    sent_today: sentToday,
    room,
    attempted: sends.length,
    succeeded,
    failed,
    retry_scheduled: retryScheduled,
  };
}

// ========================================================================
// Step 5 — close out campaigns whose queue is empty
// ========================================================================
async function closeFinishedCampaigns(): Promise<number> {
  const { data: inFlight } = await admin
    .from("email_campaigns")
    .select("id")
    .eq("status", "sending");

  let closed = 0;
  for (const c of inFlight ?? []) {
    // A campaign is "done" only when nothing is queued, retrying, or
    // mid-flight anymore. We intentionally IGNORE 'failed' / 'skipped' /
    // 'sent' here — those are terminal states that should not block close.
    const { count } = await admin
      .from("email_campaign_sends")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .in("status", ["queued", "retrying", "sending"]);
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
    const reclaimed = await reclaimStuckSending();
    const pending = await processPendingEvents();
    const promoted = await promoteScheduled();
    const drainRes = await drain();
    const closed = await closeFinishedCampaigns();

    return new Response(
      JSON.stringify({
        ok: true,
        reclaimed,
        pending,
        promoted,
        closed,
        ...drainRes,
      }),
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
