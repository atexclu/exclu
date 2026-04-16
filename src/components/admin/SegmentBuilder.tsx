import { useMemo } from "react";
import { useDebounce } from "use-debounce";
import { useQuery } from "@tanstack/react-query";
import { adminCampaigns, type SegmentRules } from "@/lib/adminCampaigns";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserCircle2, Palette, Building2, MessageSquare, AtSign, Calendar } from "lucide-react";

const ROLES: Array<{ key: "fan" | "creator" | "agency" | "chatter"; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { key: "fan", label: "Fans", Icon: UserCircle2 },
  { key: "creator", label: "Creators", Icon: Palette },
  { key: "agency", label: "Agences", Icon: Building2 },
  { key: "chatter", label: "Chatters", Icon: MessageSquare },
];

interface Props {
  value: SegmentRules;
  onChange: (rules: SegmentRules) => void;
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

  const hasAnyFilter = useMemo(() => hasAnyFilterValue(value), [value]);

  return (
    <div className="space-y-5">
      <Field label="Type de contact" hint="Laisse vide pour inclure tous les types">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLES.map(({ key, label, Icon }) => {
            const active = value.role?.includes(key) ?? false;
            return (
              <button
                key={key}
                type="button"
                onClick={() =>
                  patch({
                    role: toggleInArray(value.role, key) as SegmentRules["role"],
                  })
                }
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  active
                    ? "bg-primary/15 border-primary text-primary shadow-sm"
                    : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Compte Exclu" hint="Certains contacts n'ont pas de compte — ils ont juste laissé leur email lors d'un achat">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={value.has_account === undefined} onClick={() => patch({ has_account: undefined })} label="Tous" />
          <FilterChip active={value.has_account === true} onClick={() => patch({ has_account: true })} label="Avec compte" />
          <FilterChip active={value.has_account === false} onClick={() => patch({ has_account: false })} label="Email seul" />
        </div>
      </Field>

      <Field label="Actif depuis" hint="N'inclure que les contacts actifs après cette date">
        <div className="flex items-center gap-2 max-w-[320px]">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            type="date"
            value={value.last_seen_after?.slice(0, 10) ?? ""}
            onChange={(e) => patch({ last_seen_after: e.target.value ? e.target.value : undefined })}
            className="h-10 flex-1"
          />
          {value.last_seen_after && (
            <button type="button" onClick={() => patch({ last_seen_after: undefined })} className="text-xs text-muted-foreground hover:text-foreground underline">
              effacer
            </button>
          )}
        </div>
      </Field>

      <Field label="Email contient" hint="Ex: gmail.com — utile pour cibler un domaine ou ton propre email en test">
        <div className="flex items-center gap-2 max-w-[400px]">
          <AtSign className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            placeholder="exemple.com"
            value={value.email_contains ?? ""}
            onChange={(e) => patch({ email_contains: e.target.value || undefined })}
            className="h-10 flex-1"
          />
        </div>
      </Field>

      {!hidePreview && (
        <div className={`rounded-xl border p-4 transition-colors ${hasAnyFilter ? "border-primary/30 bg-primary/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${hasAnyFilter ? "bg-primary/15 text-primary" : "bg-amber-500/15 text-amber-500"}`}>
                <Users className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Contacts ciblés</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-foreground">
                    {preview.isFetching && !preview.data ? <Loader2 className="w-5 h-5 animate-spin inline" /> : (preview.data?.count.toLocaleString() ?? "—")}
                  </span>
                  {preview.isFetching && preview.data && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                </div>
              </div>
            </div>
            {!hasAnyFilter && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 max-w-[220px] text-right leading-tight">
                Aucun filtre — ajoute-en au moins un avant de continuer.
              </div>
            )}
          </div>
          {preview.data && preview.data.sample.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="text-[10px] text-muted-foreground mb-1.5">Aperçu (10 premiers) :</div>
              <div className="flex flex-wrap gap-1">
                {preview.data.sample.map((email) => (
                  <Badge key={email} variant="outline" className="text-[10px] font-mono">
                    {email}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {preview.error && <div className="text-xs text-red-400 mt-2">{(preview.error as Error).message}</div>}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-3">
        <label className="text-sm font-medium text-foreground">{label}</label>
        {hint && <span className="text-[10px] text-muted-foreground hidden sm:inline text-right">{hint}</span>}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground mb-2 sm:hidden">{hint}</div>}
      {children}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm border transition-all ${active ? "bg-primary/15 border-primary text-primary shadow-sm" : "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
    >
      {label}
    </button>
  );
}

export function hasAnyFilterValue(rules: SegmentRules): boolean {
  return Boolean(
    (rules.role && rules.role.length > 0) ||
      typeof rules.has_account === "boolean" ||
      (rules.last_seen_after && rules.last_seen_after.length > 0) ||
      (rules.email_contains && rules.email_contains.trim().length > 0) ||
      (rules.first_source_in && rules.first_source_in.length > 0),
  );
}
