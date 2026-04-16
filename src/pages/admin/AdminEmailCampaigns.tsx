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
import { Loader2, Plus, Trash2, Send, Ban, Eye } from "lucide-react";

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

function formatRate(num: number, denom: number | null | undefined): string {
  if (!denom || denom === 0) return "—";
  return `${((num / denom) * 100).toFixed(1)}%`;
}

export default function AdminEmailCampaigns() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-campaigns"],
    queryFn: () => adminCampaigns.listCampaigns(),
    refetchInterval: 15_000,       // live refresh sending campaigns
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-exclu-cloud">Campaigns</h2>
          <p className="text-xs text-muted-foreground">
            Bulk emails sent via Brevo transactional API. Every recipient gets a per-user HMAC unsubscribe link.
          </p>
        </div>
        <Button onClick={() => navigate("/admin/emails/campaigns/new")} variant="hero" size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          New campaign
        </Button>
      </div>

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
        <div className="rounded border border-border p-10 text-center text-sm text-muted-foreground">
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
        <div className="space-y-2">
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              onEdit={() => navigate(`/admin/emails/campaigns/${c.id}`)}
              onDelete={() => {
                setDeletingId(c.id);
                deleteMutation.mutate(c.id, {
                  onSettled: () => setDeletingId(null),
                });
              }}
              onCancel={() => {
                setCancellingId(c.id);
                cancelMutation.mutate(c.id, {
                  onSettled: () => setCancellingId(null),
                });
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

interface RowProps {
  campaign: CampaignWithStats;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  deleting: boolean;
  cancelling: boolean;
}

function CampaignRow({ campaign, onEdit, onDelete, onCancel, deleting, cancelling }: RowProps) {
  const s = campaign.stats;
  const total = campaign.total_recipients ?? 0;
  const canDelete = campaign.status === "draft" || campaign.status === "scheduled" ||
    campaign.status === "cancelled" || campaign.status === "failed";
  const canCancel = campaign.status === "scheduled" || campaign.status === "sending" ||
    campaign.status === "draft";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onEdit}
              className="text-sm font-semibold text-exclu-cloud hover:text-primary truncate"
            >
              {campaign.name}
            </button>
            {statusBadge(campaign.status)}
            {campaign.tag && (
              <Badge variant="outline" className="text-[10px]">
                #{campaign.tag}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {campaign.subject}
          </div>
          {campaign.last_error && (
            <div className="text-xs text-red-400 mt-1 truncate" title={campaign.last_error}>
              ⚠ {campaign.last_error}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            onClick={onEdit}
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            title="Edit"
          >
            <Eye className="w-4 h-4" />
          </Button>
          {canCancel && (
            <Button
              onClick={onCancel}
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-amber-400 hover:text-amber-300"
              disabled={cancelling}
              title="Cancel"
            >
              {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-red-400 hover:text-red-300"
                  title="Delete"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {campaign.name} will be permanently removed along with all its queued sends and events. This cannot be undone.
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
      </div>

      {/* Stats row */}
      {(campaign.status === "sending" || campaign.status === "sent" || (s && (s.sent_count > 0 || s.failed_count > 0))) && s && (
        <div className="flex flex-wrap gap-2 text-[11px] pt-2 border-t border-border/40">
          <Stat label="Recipients" value={total.toLocaleString()} />
          <Stat label="Sent" value={s.sent_count.toLocaleString()} />
          <Stat label="Queued" value={s.queued_count.toLocaleString()} />
          <Stat label="Delivered" value={`${s.delivered_count.toLocaleString()} (${formatRate(s.delivered_count, s.sent_count)})`} />
          <Stat label="Opens" value={`${s.opened_count.toLocaleString()} (${formatRate(s.opened_count, s.delivered_count)})`} />
          <Stat label="Clicks" value={`${s.clicked_count.toLocaleString()} (${formatRate(s.clicked_count, s.delivered_count)})`} />
          <Stat
            label="Bounced"
            value={`${s.bounced_count.toLocaleString()} (${formatRate(s.bounced_count, s.sent_count)})`}
            tone={s.bounced_count / Math.max(1, s.sent_count) > 0.05 ? "danger" : "neutral"}
          />
          <Stat
            label="Complaints"
            value={s.complained_count.toLocaleString()}
            tone={s.complained_count > 0 ? "danger" : "neutral"}
          />
          <Stat label="Unsubs" value={s.unsubscribed_count.toLocaleString()} />
          {s.failed_count > 0 && <Stat label="Failed" value={s.failed_count.toLocaleString()} tone="danger" />}
        </div>
      )}

      {/* Footer meta */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground pt-2 border-t border-border/40">
        <span>Created: {formatDate(campaign.created_at)}</span>
        {campaign.scheduled_at && campaign.status === "scheduled" && (
          <span>
            <Send className="inline w-3 h-3 mr-1" /> Scheduled for {formatDate(campaign.scheduled_at)}
          </span>
        )}
        {campaign.started_at && <span>Started: {formatDate(campaign.started_at)}</span>}
        {campaign.finished_at && <span>Finished: {formatDate(campaign.finished_at)}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "neutral" }) {
  return (
    <span
      className={`rounded px-2 py-0.5 border ${
        tone === "danger"
          ? "border-red-500/40 bg-red-500/10 text-red-400"
          : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      <span className="opacity-70">{label}:</span> <strong className="text-exclu-cloud">{value}</strong>
    </span>
  );
}
