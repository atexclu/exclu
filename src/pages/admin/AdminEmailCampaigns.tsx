import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  adminCampaigns,
  type CampaignStatus,
  type CampaignWithStats,
} from "@/lib/adminCampaigns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Trash2,
  Send,
  Ban,
  Users,
  CheckCircle2,
  MailOpen,
  MousePointerClick,
  AlertTriangle,
  ShieldAlert,
  UserMinus,
  Clock,
} from "lucide-react";

function statusBadge(status: CampaignStatus) {
  const map: Record<CampaignStatus, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    scheduled: { label: "Scheduled", className: "bg-blue-500/15 text-blue-400" },
    sending: { label: "Sending…", className: "bg-amber-500/15 text-amber-400 animate-pulse" },
    sent: { label: "Sent", className: "bg-emerald-500/15 text-emerald-400" },
    cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
    failed: { label: "Failed", className: "bg-red-500/15 text-red-400" },
  };
  const { label, className } = map[status];
  return <Badge className={`text-[10px] ${className}`}>{label}</Badge>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rate(num: number, denom: number | null | undefined): number | null {
  if (!denom || denom === 0) return null;
  return (num / denom) * 100;
}

export default function AdminEmailCampaigns() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => adminCampaigns.listCampaigns(),
    refetchInterval: 15_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminCampaigns.deleteCampaign(id),
    onSuccess: () => {
      toast.success("Campaign deleted");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminCampaigns.cancelCampaign(id),
    onSuccess: () => {
      toast.success("Campaign cancelled");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const campaigns = data?.campaigns ?? [];

  return (
    <div className="space-y-3">
      {isLoading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading campaigns…
        </div>
      ) : error ? (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 p-10 text-center text-sm text-muted-foreground">
          No campaigns yet.{" "}
          <button
            onClick={() => navigate("/admin/emails/campaigns/new")}
            className="text-primary hover:underline"
          >
            Create the first one
          </button>
          .
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onEdit={() => navigate(`/admin/emails/campaigns/${c.id}`)}
              onDelete={() => {
                setDeletingId(c.id);
                deleteMutation.mutate(c.id, { onSettled: () => setDeletingId(null) });
              }}
              onCancel={() => {
                setCancellingId(c.id);
                cancelMutation.mutate(c.id, { onSettled: () => setCancellingId(null) });
              }}
              deleting={deletingId === c.id}
              cancelling={cancellingId === c.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  campaign: CampaignWithStats;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  deleting: boolean;
  cancelling: boolean;
}

function CampaignCard({ campaign, onEdit, onDelete, onCancel, deleting, cancelling }: CardProps) {
  const s = campaign.stats;
  const total = campaign.total_recipients ?? 0;
  const canDelete =
    campaign.status === "draft" ||
    campaign.status === "scheduled" ||
    campaign.status === "cancelled" ||
    campaign.status === "failed";
  const canCancel =
    campaign.status === "scheduled" ||
    campaign.status === "sending" ||
    campaign.status === "draft";

  const showStats =
    s && (campaign.status === "sending" || campaign.status === "sent" ||
      s.sent_count > 0 || s.failed_count > 0);

  return (
    <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden transition-colors duration-200 hover:border-exclu-arsenic">
      {/* Header — clickable opens editor, action buttons stop propagation */}
      <button
        type="button"
        onClick={onEdit}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-3 hover:bg-exclu-arsenic/20 transition-colors duration-200"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-exclu-cloud truncate">
              {campaign.name}
            </span>
            {statusBadge(campaign.status)}
            {campaign.tag && (
              <Badge variant="outline" className="text-[10px]">
                #{campaign.tag}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {campaign.subject}
          </div>
          {campaign.last_error && (
            <div
              className="text-xs text-red-400 mt-1 truncate"
              title={campaign.last_error}
            >
              ⚠ {campaign.last_error}
            </div>
          )}
        </div>
        <div
          className="flex items-center gap-1 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {canCancel && (
            <Button
              onClick={onCancel}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
              disabled={cancelling}
              title="Cancel"
            >
              {cancelling ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Ban className="w-4 h-4" />
              )}
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  title="Delete"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {campaign.name} will be permanently removed along with all its
                    queued sends and events. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-red-500 hover:bg-red-600 text-white"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </button>

      {/* Metrics grid */}
      {showStats && s && (
        <div className="border-t border-exclu-arsenic/40 px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <MetricTile Icon={Users} label="Recipients" value={total.toLocaleString()} />
            <MetricTile
              Icon={Send}
              label="Sent"
              value={s.sent_count.toLocaleString()}
              subValue={
                s.queued_count > 0
                  ? `${s.queued_count.toLocaleString()} queued`
                  : undefined
              }
            />
            <MetricTile
              Icon={CheckCircle2}
              label="Delivered"
              value={s.delivered_count.toLocaleString()}
              percent={rate(s.delivered_count, s.sent_count)}
              tone="good"
            />
            <MetricTile
              Icon={MailOpen}
              label="Opens"
              value={s.opened_count.toLocaleString()}
              percent={rate(s.opened_count, s.delivered_count)}
              tone="good"
            />
            <MetricTile
              Icon={MousePointerClick}
              label="Clicks"
              value={s.clicked_count.toLocaleString()}
              percent={rate(s.clicked_count, s.delivered_count)}
              tone="good"
            />
            <MetricTile
              Icon={AlertTriangle}
              label="Bounced"
              value={s.bounced_count.toLocaleString()}
              percent={rate(s.bounced_count, s.sent_count)}
              tone={
                s.sent_count > 0 && s.bounced_count / s.sent_count > 0.05
                  ? "bad"
                  : "warn"
              }
              emphasizeValue={
                s.sent_count > 0 && s.bounced_count / s.sent_count > 0.05
                  ? "bad"
                  : undefined
              }
            />
            {s.complained_count > 0 && (
              <MetricTile
                Icon={ShieldAlert}
                label="Complaints"
                value={s.complained_count.toLocaleString()}
                emphasizeValue="bad"
              />
            )}
            {s.unsubscribed_count > 0 && (
              <MetricTile
                Icon={UserMinus}
                label="Unsubs"
                value={s.unsubscribed_count.toLocaleString()}
              />
            )}
            {s.failed_count > 0 && (
              <MetricTile
                Icon={AlertTriangle}
                label="Failed"
                value={s.failed_count.toLocaleString()}
                emphasizeValue="bad"
              />
            )}
          </div>
        </div>
      )}

      {/* Footer meta */}
      <div className="border-t border-exclu-arsenic/40 px-5 py-2.5 bg-exclu-phantom/5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" /> Created {formatDate(campaign.created_at)}
        </span>
        {campaign.scheduled_at && campaign.status === "scheduled" && (
          <span className="inline-flex items-center gap-1">
            <Send className="w-3 h-3" /> Scheduled {formatDate(campaign.scheduled_at)}
          </span>
        )}
        {campaign.started_at && <span>Started {formatDate(campaign.started_at)}</span>}
        {campaign.finished_at && <span>Finished {formatDate(campaign.finished_at)}</span>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MetricTile — minimal SaaS-style card: neutral icon, big number,
// single semantic-colored progress bar. Color is used sparingly (only
// on the bar + bad-case values) so the grid stays calm and scannable.
// ═══════════════════════════════════════════════════════════════════════

type BarTone = "neutral" | "good" | "warn" | "bad";

const BAR_CLASS: Record<BarTone, string> = {
  neutral: "bg-foreground/25",
  good: "bg-emerald-500/70",
  warn: "bg-amber-500/70",
  bad: "bg-red-500/70",
};

function MetricTile({
  Icon,
  label,
  value,
  subValue,
  percent,
  tone = "neutral",
  emphasizeValue,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  percent?: number | null;
  tone?: BarTone;
  emphasizeValue?: "warn" | "bad";
}) {
  const pct = typeof percent === "number" && Number.isFinite(percent) ? percent : null;
  const valueColor =
    emphasizeValue === "bad"
      ? "text-red-400"
      : emphasizeValue === "warn"
        ? "text-amber-400"
        : "text-exclu-cloud";

  return (
    <div className="rounded-xl bg-exclu-ink/40 px-3.5 py-3 min-w-0 border border-transparent hover:border-exclu-arsenic/50 transition-colors duration-200">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/60 flex-shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium truncate">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={`text-xl font-semibold tabular-nums truncate ${valueColor}`}>
          {value}
        </span>
        {pct !== null && (
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
      {subValue && (
        <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{subValue}</div>
      )}
      {pct !== null && (
        <div className="mt-2 h-1 rounded-full bg-foreground/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${BAR_CLASS[tone]}`}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}
