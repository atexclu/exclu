import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import { adminCampaigns, type SegmentRules } from "@/lib/adminCampaigns";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";

const ROLES = ["fan", "creator", "agency", "chatter"] as const;
const SOURCES = [
  "signup",
  "link_purchase",
  "tip",
  "gift",
  "custom_request",
  "settings",
  "backfill_signup",
  "backfill_link_purchase",
  "backfill_tip",
  "backfill_custom_request",
] as const;

interface Props {
  value: SegmentRules;
  onChange: (rules: SegmentRules) => void;
  /** If true, hides the live-preview count (used when rules are inline-edited on a campaign with no segment yet). */
  hidePreview?: boolean;
}

export default function SegmentBuilder({ value, onChange, hidePreview }: Props) {
  const [debouncedRules] = useDebounce(value, 400);

  const preview = useQuery({
    queryKey: ["segment-preview", debouncedRules],
    queryFn: () => adminCampaigns.previewSegment(debouncedRules),
    enabled: !hidePreview,
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });

  const toggleInArray = (arr: string[] | undefined, item: string): string[] => {
    const cur = arr ?? [];
    return cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
  };

  const patch = (partial: Partial<SegmentRules>) => onChange({ ...value, ...partial });

  return (
    <div className="space-y-4">
      {/* Role filter */}
      <div>
        <div className="text-xs font-medium text-exclu-cloud mb-1.5">Roles</div>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((r) => {
            const active = value.role?.includes(r) ?? false;
            return (
              <button
                key={r}
                type="button"
                onClick={() =>
                  patch({
                    role: (toggleInArray(value.role, r) as SegmentRules["role"]) ?? undefined,
                  })
                }
                className={`px-3 py-1 rounded-full text-xs border transition-colors capitalize ${
                  active
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {r}
              </button>
            );
          })}
          {value.role && value.role.length > 0 && (
            <button
              type="button"
              onClick={() => patch({ role: undefined })}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Account flag */}
      <div>
        <div className="text-xs font-medium text-exclu-cloud mb-1.5">Account</div>
        <div className="flex gap-1.5">
          <FilterPill
            active={value.has_account === undefined}
            onClick={() => patch({ has_account: undefined })}
            label="Any"
          />
          <FilterPill
            active={value.has_account === true}
            onClick={() => patch({ has_account: true })}
            label="Has account"
          />
          <FilterPill
            active={value.has_account === false}
            onClick={() => patch({ has_account: false })}
            label="Email only (no account)"
          />
        </div>
      </div>

      {/* Last seen */}
      <div>
        <div className="text-xs font-medium text-exclu-cloud mb-1.5">Last seen after</div>
        <Input
          type="date"
          value={value.last_seen_after?.slice(0, 10) ?? ""}
          onChange={(e) =>
            patch({ last_seen_after: e.target.value ? e.target.value : undefined })
          }
          className="h-9 bg-card max-w-[180px]"
        />
      </div>

      {/* First source */}
      <div>
        <div className="text-xs font-medium text-exclu-cloud mb-1.5">First source</div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map((s) => {
            const active = value.first_source_in?.includes(s) ?? false;
            return (
              <button
                key={s}
                type="button"
                onClick={() => patch({ first_source_in: toggleInArray(value.first_source_in, s) })}
                className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                  active
                    ? "bg-primary/20 border-primary text-primary"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s.replace(/^backfill_/, "backfill→").replace(/_/g, " ")}
              </button>
            );
          })}
          {value.first_source_in && value.first_source_in.length > 0 && (
            <button
              type="button"
              onClick={() => patch({ first_source_in: undefined })}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Email contains */}
      <div>
        <div className="text-xs font-medium text-exclu-cloud mb-1.5">Email contains</div>
        <Input
          placeholder="e.g. gmail.com"
          value={value.email_contains ?? ""}
          onChange={(e) => patch({ email_contains: e.target.value || undefined })}
          className="h-9 bg-card max-w-[300px]"
        />
      </div>

      {/* Live preview */}
      {!hidePreview && (
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span>Matching contacts</span>
            {preview.isFetching && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-exclu-cloud">
              {preview.data?.count.toLocaleString() ?? "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              opted-in contacts match these rules
            </span>
          </div>
          {preview.data && preview.data.sample.length > 0 && (
            <div className="mt-2 space-y-0.5">
              <div className="text-[10px] text-muted-foreground">Sample:</div>
              <div className="flex flex-wrap gap-1">
                {preview.data.sample.map((email) => (
                  <Badge key={email} variant="outline" className="text-[10px] font-mono">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {preview.error && (
            <div className="text-xs text-red-400 mt-2">{(preview.error as Error).message}</div>
          )}
        </div>
      )}
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
      type="button"
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
        active
          ? "bg-primary/20 border-primary text-primary"
          : "bg-card border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}
