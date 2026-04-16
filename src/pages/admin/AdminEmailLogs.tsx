import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminCampaigns, type CampaignEvent } from "@/lib/adminCampaigns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

function eventTone(eventType: string): string {
  switch (eventType) {
    case "delivered":
    case "opened":
    case "clicked":
      return "bg-emerald-500/15 text-emerald-400";
    case "bounced":
    case "complained":
    case "failed":
    case "blocked":
      return "bg-red-500/15 text-red-400";
    case "unsubscribed":
      return "bg-amber-500/15 text-amber-400";
    case "soft_bounced":
      return "bg-orange-500/15 text-orange-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AdminEmailLogs() {
  const [eventFilter, setEventFilter] = useState<string>("all");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-campaign-events"],
    queryFn: () => adminCampaigns.listRecentEvents(200),
    refetchInterval: 10_000,
  });

  const events = data?.events ?? [];
  const filtered = eventFilter === "all" ? events : events.filter((e) => e.event_type === eventFilter);

  const typeCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-exclu-cloud">Recent events</h2>
          <p className="text-xs text-muted-foreground">
            Last 200 Brevo webhook events across all campaigns. Live refresh every 10s.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        <FilterPill
          active={eventFilter === "all"}
          onClick={() => setEventFilter("all")}
          label={`All (${events.length})`}
        />
        {Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([t, count]) => (
            <FilterPill
              key={t}
              active={eventFilter === t}
              onClick={() => setEventFilter(t)}
              label={`${t} (${count})`}
              tone={eventTone(t)}
            />
          ))}
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {(error as Error).message}
        </div>
      )}

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading events…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded border border-border p-8 text-center text-sm text-muted-foreground">
          No events yet. Send a campaign to populate this feed.
        </div>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          {filtered.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: CampaignEvent }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors text-xs">
      <Badge className={`${eventTone(event.event_type)} text-[10px] w-24 justify-center`}>
        {event.event_type}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="font-mono truncate">{event.send?.email ?? "—"}</div>
        <div className="text-muted-foreground text-[10px] truncate">
          {event.send?.campaign?.name ?? "(unknown campaign)"}
        </div>
      </div>
      <div className="text-muted-foreground text-[10px] flex-shrink-0">
        {formatTime(event.occurred_at)}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${
        active
          ? tone || "bg-primary/20 border-primary text-primary"
          : "bg-card border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}
