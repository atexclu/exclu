// supabase/functions/admin-manage-campaigns/index.ts
//
// Phase 5 — Admin-only campaign management.
//
// Actions:
//   list_segments                     → { segments: Segment[] }
//   upsert_segment { payload }        → { segment: Segment }
//   delete_segment { id }             → { ok: true }
//   preview_segment { rules }         → { count, sample: string[] }
//
//   list_campaigns                    → { campaigns: CampaignWithStats[] }
//   get_campaign { id }               → { campaign: Campaign, stats: Stats }
//   upsert_campaign { payload }       → { campaign: Campaign }
//   delete_campaign { id }            → { ok: true }
//   test_send { id, to }              → { ok: true, message_id? }  (single email via Brevo)
//   start_campaign { id, scheduled_at? } → enqueues sends into email_campaign_sends
//   cancel_campaign { id }            → flips status to cancelled; queued sends become skipped
//
//   list_recent_events { limit? }     → recent webhook events (for /admin/emails/logs)
//
// All actions require an authenticated admin (profiles.is_admin = true).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonError, jsonOk } from "../_shared/cors.ts";
import {
  renderCampaignHtml,
  sendTransactionalEmail,
} from "../_shared/campaign_send.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY")!;

const brevoApiKey = Deno.env.get("BREVO_API_KEY") ?? "";
const campaignSender = Deno.env.get("BREVO_CAMPAIGN_SENDER_EMAIL") ?? "";
const campaignSenderName = Deno.env.get("BREVO_CAMPAIGN_SENDER_NAME") ?? "Exclu";
const campaignReplyTo = Deno.env.get("BREVO_CAMPAIGN_REPLY_TO") ?? "";
const unsubSecret = Deno.env.get("UNSUBSCRIBE_HMAC_SECRET") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function verifyAdmin(token: string): Promise<{ userId: string } | null> {
  if (!token) return null;
  const authed = createClient(supabaseUrl, anonKey);
  const { data: { user } } = await authed.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_admin === true ? { userId: user.id } : null;
}

// ========================================================================
// Segment handlers
// ========================================================================

interface SegmentPayload {
  id?: string;
  name: string;
  description?: string | null;
  rules: Record<string, unknown>;
}

async function handleListSegments(cors: Record<string, string>): Promise<Response> {
  const { data, error } = await admin
    .from("email_campaign_segments")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return jsonError("segments_read_failed", 500, cors);
  return jsonOk({ segments: data ?? [] }, cors);
}

async function handleUpsertSegment(
  payload: SegmentPayload,
  userId: string,
  cors: Record<string, string>,
): Promise<Response> {
  const name = String(payload.name ?? "").trim();
  if (!name) return jsonError("segment_name_required", 400, cors);
  const rules = payload.rules && typeof payload.rules === "object" ? payload.rules : {};

  const row: Record<string, unknown> = {
    name,
    description: (payload.description ?? null) || null,
    rules,
    created_by: userId,
  };
  if (payload.id) {
    const { data, error } = await admin
      .from("email_campaign_segments")
      .update({ name, description: row.description, rules })
      .eq("id", payload.id)
      .select()
      .maybeSingle();
    if (error) return jsonError("segment_update_failed", 500, cors);
    return jsonOk({ segment: data }, cors);
  }
  const { data, error } = await admin
    .from("email_campaign_segments")
    .insert(row)
    .select()
    .maybeSingle();
  if (error) return jsonError("segment_insert_failed", 500, cors);
  return jsonOk({ segment: data }, cors);
}

async function handleDeleteSegment(id: string, cors: Record<string, string>): Promise<Response> {
  if (!id) return jsonError("id_required", 400, cors);
  const { error } = await admin.from("email_campaign_segments").delete().eq("id", id);
  if (error) return jsonError("segment_delete_failed", 500, cors);
  return jsonOk({ ok: true }, cors);
}

async function handlePreviewSegment(
  rules: Record<string, unknown>,
  cors: Record<string, string>,
): Promise<Response> {
  const { data, error } = await admin.rpc("resolve_campaign_segment", { p_rules: rules });
  if (error) {
    console.error("[admin-manage-campaigns] preview_segment rpc failed", error);
    return jsonError("segment_resolve_failed", 500, cors);
  }
  const rows = (data ?? []) as Array<{ email: string }>;
  return jsonOk({
    count: rows.length,
    sample: rows.slice(0, 10).map((r) => r.email),
  }, cors);
}

// ========================================================================
// Campaign handlers
// ========================================================================

interface CampaignPayload {
  id?: string;
  name: string;
  subject: string;
  preheader?: string | null;
  html_content: string;
  tag?: string | null;
  segment_id?: string | null;
  /** When segmentMode is "inline", the admin-side rules live in the
   *  campaign itself. Persisted to email_campaigns.resolved_rules so
   *  start_campaign + drain-campaign-sends consume the same object.
   */
  inline_rules?: Record<string, unknown> | null;
  scheduled_at?: string | null;
}

async function handleListCampaigns(cors: Record<string, string>): Promise<Response> {
  const [{ data: campaigns, error: cErr }, { data: stats, error: sErr }] = await Promise.all([
    admin.from("email_campaigns").select("*").order("created_at", { ascending: false }),
    admin.from("email_campaign_stats").select("*"),
  ]);
  if (cErr || sErr) return jsonError("campaigns_read_failed", 500, cors);
  const statsById = new Map<string, unknown>(
    (stats ?? []).map((r: { campaign_id: string }) => [r.campaign_id, r]),
  );
  const merged = (campaigns ?? []).map((c: { id: string }) => ({
    ...c,
    stats: statsById.get(c.id) ?? null,
  }));
  return jsonOk({ campaigns: merged }, cors);
}

async function handleGetCampaign(id: string, cors: Record<string, string>): Promise<Response> {
  if (!id) return jsonError("id_required", 400, cors);
  const [{ data: campaign, error }, { data: stats }] = await Promise.all([
    admin.from("email_campaigns").select("*").eq("id", id).maybeSingle(),
    admin.from("email_campaign_stats").select("*").eq("campaign_id", id).maybeSingle(),
  ]);
  if (error || !campaign) return jsonError("campaign_not_found", 404, cors);
  return jsonOk({ campaign, stats }, cors);
}

async function handleUpsertCampaign(
  payload: CampaignPayload,
  userId: string,
  cors: Record<string, string>,
): Promise<Response> {
  const name = String(payload.name ?? "").trim();
  const subject = String(payload.subject ?? "").trim();
  const html = String(payload.html_content ?? "").trim();
  if (!name) return jsonError("campaign_name_required", 400, cors);
  if (!subject) return jsonError("campaign_subject_required", 400, cors);
  if (!html) return jsonError("campaign_html_required", 400, cors);
  if (subject.length > 150) return jsonError("campaign_subject_too_long", 400, cors);
  if (payload.preheader && payload.preheader.length > 200) {
    return jsonError("campaign_preheader_too_long", 400, cors);
  }

  // Resolve which rules get persisted. If the admin picked a saved segment,
  // clear resolved_rules so start_campaign always reads the fresh segment
  // definition. If they typed inline rules, snapshot them onto the campaign
  // row so they survive edits to other segments + drive start/drain.
  const hasSegmentId = Boolean(payload.segment_id);
  const resolvedRules = hasSegmentId
    ? null
    : payload.inline_rules && typeof payload.inline_rules === "object"
      ? payload.inline_rules
      : {};

  const base: Record<string, unknown> = {
    name,
    subject,
    preheader: payload.preheader || null,
    html_content: html,
    tag: payload.tag || null,
    segment_id: payload.segment_id || null,
    resolved_rules: resolvedRules,
    scheduled_at: payload.scheduled_at || null,
  };

  if (payload.id) {
    const { data, error } = await admin
      .from("email_campaigns")
      .update(base)
      .eq("id", payload.id)
      .in("status", ["draft", "scheduled"])      // cannot edit sending/sent campaigns
      .select()
      .maybeSingle();
    if (error) {
      console.error("[admin-manage-campaigns] upsert update failed", error);
      return jsonError("campaign_update_failed", 500, cors);
    }
    if (!data) return jsonError("campaign_not_editable", 409, cors);
    return jsonOk({ campaign: data }, cors);
  }

  const { data, error } = await admin
    .from("email_campaigns")
    .insert({ ...base, created_by: userId, status: "draft" })
    .select()
    .maybeSingle();
  if (error) {
    console.error("[admin-manage-campaigns] upsert insert failed", error);
    return jsonError("campaign_insert_failed", 500, cors);
  }
  return jsonOk({ campaign: data }, cors);
}

async function handleDeleteCampaign(id: string, cors: Record<string, string>): Promise<Response> {
  if (!id) return jsonError("id_required", 400, cors);
  const { data: current } = await admin.from("email_campaigns").select("status").eq("id", id).maybeSingle();
  if (!current) return jsonError("campaign_not_found", 404, cors);
  if (current.status === "sending" || current.status === "sent") {
    return jsonError("cannot_delete_active_campaign", 409, cors);
  }
  const { error } = await admin.from("email_campaigns").delete().eq("id", id);
  if (error) return jsonError("campaign_delete_failed", 500, cors);
  return jsonOk({ ok: true }, cors);
}

async function handleTestSend(
  id: string,
  toEmail: string,
  cors: Record<string, string>,
): Promise<Response> {
  if (!id) return jsonError("id_required", 400, cors);
  if (!toEmail || !toEmail.includes("@")) {
    return jsonError("bad_email", 400, cors);
  }
  if (!brevoApiKey || !campaignSender || !unsubSecret) {
    return jsonError("misconfigured", 500, cors);
  }

  const { data: campaign, error } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !campaign) return jsonError("campaign_not_found", 404, cors);

  const renderedHtml = await renderCampaignHtml({
    html: campaign.html_content,
    email: toEmail,
    campaignSlug: slugify(campaign.tag ?? campaign.name ?? "test"),
    preheader: campaign.preheader ?? null,
    unsubscribeSecret: unsubSecret,
  });

  const result = await sendTransactionalEmail({
    apiKey: brevoApiKey,
    senderEmail: campaignSender,
    senderName: campaignSenderName,
    replyToEmail: campaignReplyTo || undefined,
    to: { email: toEmail },
    subject: `[TEST] ${campaign.subject}`,
    htmlContent: renderedHtml,
    tags: ["test-send", slugify(campaign.tag ?? campaign.name ?? "test")],
  });

  if (!result.ok) {
    console.error("[admin-manage-campaigns] test_send failed", result);
    return jsonError(`brevo_${result.status}:${result.reason.slice(0, 120)}`, 502, cors);
  }

  return jsonOk({ ok: true, message_id: result.messageId }, cors);
}

async function handleStartCampaign(
  id: string,
  scheduledAt: string | null | undefined,
  cors: Record<string, string>,
): Promise<Response> {
  if (!id) return jsonError("id_required", 400, cors);

  const { data: campaign, error } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !campaign) return jsonError("campaign_not_found", 404, cors);
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    return jsonError("campaign_not_startable", 409, cors);
  }

  // Resolve segment rules. Priority:
  //   1. Saved segment referenced by segment_id → use its rules
  //   2. Inline rules snapshot on the campaign (resolved_rules)
  //   3. Empty object → targets EVERY opted-in contact (guarded below)
  let rules: Record<string, unknown> = {};
  if (campaign.segment_id) {
    const { data: segment } = await admin
      .from("email_campaign_segments")
      .select("rules")
      .eq("id", campaign.segment_id)
      .maybeSingle();
    if (segment?.rules) rules = segment.rules as Record<string, unknown>;
  } else if (campaign.resolved_rules) {
    rules = campaign.resolved_rules as Record<string, unknown>;
  }

  // SAFETY GUARD — refuse to start a campaign with NO filtering. An empty
  // rules object matches every opted-in contact on the platform, which is
  // almost never intended when you haven't explicitly picked a saved
  // "everyone" segment. Make the admin opt-in to a blast by creating a
  // named segment whose rules = {} and selecting it explicitly.
  const hasAnyFilter = Object.entries(rules).some(([_k, v]) => {
    if (v === null || v === undefined) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "string") return v.trim().length > 0;
    return true;   // booleans, numbers count as filters
  });
  if (!hasAnyFilter && !campaign.segment_id) {
    await admin
      .from("email_campaigns")
      .update({
        last_error: "start_blocked:empty_rules (set at least one filter or use a saved segment)",
      })
      .eq("id", id);
    return jsonError("empty_rules", 400, cors);
  }

  // If scheduled_at is in the future, just mark scheduled — don't enqueue yet.
  // The drain cron fn handles the scheduled → sending transition.
  const scheduled = scheduledAt ? new Date(scheduledAt) : null;
  const nowPlus30s = Date.now() + 30_000;
  if (scheduled && scheduled.getTime() > nowPlus30s) {
    const { data: updated, error: updErr } = await admin
      .from("email_campaigns")
      .update({
        status: "scheduled",
        scheduled_at: scheduled.toISOString(),
        resolved_rules: rules,
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (updErr) return jsonError("campaign_schedule_failed", 500, cors);
    return jsonOk({ campaign: updated, scheduled: true }, cors);
  }

  // Immediate start: resolve recipients + enqueue.
  const { data: resolved, error: resErr } = await admin.rpc("resolve_campaign_segment", {
    p_rules: rules,
  });
  if (resErr) {
    console.error("[admin-manage-campaigns] resolve failed", resErr);
    return jsonError("segment_resolve_failed", 500, cors);
  }
  const recipients = (resolved ?? []) as Array<{ email: string }>;
  if (recipients.length === 0) {
    await admin
      .from("email_campaigns")
      .update({
        status: "failed",
        last_error: "no_recipients_match_segment",
        resolved_rules: rules,
      })
      .eq("id", id);
    return jsonError("no_recipients", 400, cors);
  }

  // Flip status first so a crash during bulk insert leaves the campaign in sending state.
  await admin
    .from("email_campaigns")
    .update({
      status: "sending",
      started_at: new Date().toISOString(),
      scheduled_at: null,
      total_recipients: recipients.length,
      resolved_rules: rules,
      last_error: null,
    })
    .eq("id", id);

  // Bulk insert sends in chunks of 1000 (PostgREST limit + memory).
  const CHUNK = 1000;
  let insertedTotal = 0;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK).map((r) => ({
      campaign_id: id,
      email: r.email,
      status: "queued",
    }));
    const { error: insErr, count } = await admin
      .from("email_campaign_sends")
      .upsert(slice, { onConflict: "campaign_id,email", ignoreDuplicates: true, count: "exact" });
    if (insErr) {
      console.error("[admin-manage-campaigns] enqueue chunk failed", insErr);
      // Don't fail the whole start — some chunks may have succeeded.
      // Record the error on the campaign so admin sees it.
      await admin
        .from("email_campaigns")
        .update({ last_error: `enqueue_partial: ${insErr.message}` })
        .eq("id", id);
    } else {
      insertedTotal += count ?? slice.length;
    }
  }

  const { data: updated } = await admin
    .from("email_campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return jsonOk({
    campaign: updated,
    enqueued: insertedTotal,
    total_recipients: recipients.length,
  }, cors);
}

async function handleCancelCampaign(id: string, cors: Record<string, string>): Promise<Response> {
  if (!id) return jsonError("id_required", 400, cors);
  // Flip campaign → cancelled and mark all still-queued sends as skipped.
  const { error: upErr } = await admin
    .from("email_campaigns")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "scheduled", "sending"]);
  if (upErr) return jsonError("campaign_cancel_failed", 500, cors);

  await admin
    .from("email_campaign_sends")
    .update({ status: "skipped" })
    .eq("campaign_id", id)
    .eq("status", "queued");

  return jsonOk({ ok: true }, cors);
}

async function handleListRecentEvents(
  limit: number,
  cors: Record<string, string>,
): Promise<Response> {
  const lim = Math.max(10, Math.min(500, limit || 100));
  const { data, error } = await admin
    .from("email_campaign_events")
    .select(`
      id, event_type, occurred_at, meta,
      send:email_campaign_sends (
        id, email, campaign_id, status,
        campaign:email_campaigns ( id, name )
      )
    `)
    .order("occurred_at", { ascending: false })
    .limit(lim);
  if (error) return jsonError("events_read_failed", 500, cors);
  return jsonOk({ events: data ?? [] }, cors);
}

// ========================================================================
// Helpers
// ========================================================================

function slugify(s: string): string {
  return (s || "campaign").toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64);
}

// ========================================================================
// Router
// ========================================================================

serve(async (req: Request) => {
  const cors = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonError("method_not_allowed", 405, cors);
  }

  const token = (req.headers.get("authorization") ?? req.headers.get("x-supabase-auth") ?? "")
    .replace(/^Bearer\s+/i, "").trim();
  const adminCtx = await verifyAdmin(token);
  if (!adminCtx) return jsonError("forbidden", 403, cors);

  let body: { action?: string; [k: string]: unknown };
  try {
    body = (await req.json()) as { action?: string };
  } catch {
    return jsonError("invalid_body", 400, cors);
  }

  const action = String(body.action ?? "");
  try {
    switch (action) {
      // Segments
      case "list_segments":
        return handleListSegments(cors);
      case "upsert_segment":
        return handleUpsertSegment(body.payload as SegmentPayload, adminCtx.userId, cors);
      case "delete_segment":
        return handleDeleteSegment(String(body.id ?? ""), cors);
      case "preview_segment":
        return handlePreviewSegment((body.rules as Record<string, unknown>) ?? {}, cors);

      // Campaigns
      case "list_campaigns":
        return handleListCampaigns(cors);
      case "get_campaign":
        return handleGetCampaign(String(body.id ?? ""), cors);
      case "upsert_campaign":
        return handleUpsertCampaign(body.payload as CampaignPayload, adminCtx.userId, cors);
      case "delete_campaign":
        return handleDeleteCampaign(String(body.id ?? ""), cors);
      case "test_send":
        return handleTestSend(String(body.id ?? ""), String(body.to ?? ""), cors);
      case "start_campaign":
        return handleStartCampaign(
          String(body.id ?? ""),
          (body.scheduled_at as string) || null,
          cors,
        );
      case "cancel_campaign":
        return handleCancelCampaign(String(body.id ?? ""), cors);

      // Events / logs
      case "list_recent_events":
        return handleListRecentEvents(Number(body.limit) || 100, cors);

      default:
        return jsonError("unknown_action", 400, cors);
    }
  } catch (err) {
    console.error("[admin-manage-campaigns] unhandled", err);
    return jsonError("internal", 500, cors);
  }
});
