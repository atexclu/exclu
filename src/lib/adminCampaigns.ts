import { supabase } from "@/lib/supabaseClient";

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-campaigns`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = (await res.json().catch(() => ({ error: "invalid_response" }))) as
    | T
    | { error: string };
  if (!res.ok) {
    const err = (json as { error?: string }).error ?? `request failed (${res.status})`;
    throw new Error(err);
  }
  return json as T;
}

// ═══════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════

export interface SegmentRules {
  role?: Array<"fan" | "creator" | "agency" | "chatter" | "unknown">;
  has_account?: boolean;
  last_seen_after?: string;   // ISO date
  first_source_in?: string[];
  email_contains?: string;
}

export interface Segment {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRules;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  html_content: string;
  tag: string | null;
  segment_id: string | null;
  resolved_rules: SegmentRules | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_recipients: number | null;
  brevo_campaign_id: number | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignStats {
  campaign_id: string;
  name: string;
  status: CampaignStatus;
  total_recipients: number | null;
  started_at: string | null;
  finished_at: string | null;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  unsubscribed_count: number;
  failed_count: number;
  queued_count: number;
}

export interface CampaignWithStats extends Campaign {
  stats: CampaignStats | null;
}

export interface CampaignEvent {
  id: string;
  event_type: string;
  occurred_at: string;
  meta: Record<string, unknown> | null;
  send: {
    id: string;
    email: string;
    campaign_id: string;
    status: string;
    campaign: { id: string; name: string } | null;
  } | null;
}

// ═══════════════════════════════════════════════════════════════════════
// Segments
// ═══════════════════════════════════════════════════════════════════════

export const adminCampaigns = {
  listSegments: () => call<{ segments: Segment[] }>({ action: "list_segments" }),

  upsertSegment: (payload: { id?: string; name: string; description?: string | null; rules: SegmentRules }) =>
    call<{ segment: Segment }>({ action: "upsert_segment", payload }),

  deleteSegment: (id: string) => call<{ ok: true }>({ action: "delete_segment", id }),

  previewSegment: (rules: SegmentRules) =>
    call<{ count: number; sample: string[] }>({ action: "preview_segment", rules }),

  // Campaigns
  listCampaigns: () => call<{ campaigns: CampaignWithStats[] }>({ action: "list_campaigns" }),

  getCampaign: (id: string) =>
    call<{ campaign: Campaign; stats: CampaignStats | null }>({ action: "get_campaign", id }),

  upsertCampaign: (payload: {
    id?: string;
    name: string;
    subject: string;
    preheader?: string | null;
    html_content: string;
    tag?: string | null;
    segment_id?: string | null;
    /** Inline rules snapshot. Ignored when segment_id is set. */
    inline_rules?: SegmentRules | null;
    scheduled_at?: string | null;
  }) => call<{ campaign: Campaign }>({ action: "upsert_campaign", payload }),

  deleteCampaign: (id: string) => call<{ ok: true }>({ action: "delete_campaign", id }),

  testSend: (id: string, to: string) =>
    call<{ ok: true; message_id?: string }>({ action: "test_send", id, to }),

  startCampaign: (id: string, scheduled_at?: string | null) =>
    call<{
      campaign: Campaign;
      scheduled?: boolean;
      enqueued?: number;
      total_recipients?: number;
    }>({ action: "start_campaign", id, scheduled_at: scheduled_at ?? null }),

  cancelCampaign: (id: string) => call<{ ok: true }>({ action: "cancel_campaign", id }),

  // Events / logs
  listRecentEvents: (limit = 100) =>
    call<{ events: CampaignEvent[] }>({ action: "list_recent_events", limit }),
};
