import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminCampaigns, type CampaignEvent } from "@/lib/adminCampaigns";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useSubnavRightSlot } from "@/pages/AdminEmails";

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

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-campaign-events"],
    queryFn: () => adminCampaigns.listRecentEvents(200),
    refetchInterval: 10_000,
  });

  const events = data?.events ?? [];
  const filtered =
    eventFilter === "all" ? events : events.filter((e) => e.event_type === eventFilter);

  const typeCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] ?? 0) + 1;
    return acc;
  }, {});

  // Inject filter pills into the parent subnav row (right-aligned) via context.
  const filterPills = useMemo(
    () => (
      <div className="flex gap-1 rounded-xl bg-muted/30 p-1 overflow-x-auto scrollbar-none">
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
            />
          ))}
      </div>
    ),
    [events.length, typeCounts, eventFilter],
  );
  useSubnavRightSlot(filterPills);

  return (
    <div className="space-y-4">
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
        <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 p-8 text-center text-sm text-muted-foreground">
          No events yet. Send a campaign to populate this feed.
        </div>
      ) : (
        <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
          {filtered.map((event, i) => (
            <EventRow key={event.id} event={event} isLast={i === filtered.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event, isLast }: { event: CampaignEvent; isLast?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-exclu-arsenic/30 transition-colors duration-200 text-xs ${
        isLast ? "" : "border-b border-exclu-arsenic/30"
      }`}
    >
      <Badge className={`${eventTone(event.event_type)} text-[10px] w-24 justify-center`}>
        {event.event_type}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="font-mono truncate text-exclu-cloud">{event.send?.email ?? "—"}</div>
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
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
