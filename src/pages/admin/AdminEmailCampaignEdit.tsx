import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminCampaigns,
  type Campaign,
  type Segment,
  type SegmentRules,
} from "@/lib/adminCampaigns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import SegmentBuilder from "@/components/admin/SegmentBuilder";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Loader2, Save, Send, TestTube, Eye, Rocket } from "lucide-react";

interface FormState {
  name: string;
  subject: string;
  preheader: string;
  html_content: string;
  tag: string;
  segmentMode: "existing" | "inline";
  segment_id: string | null;
  inlineRules: SegmentRules;
  scheduled_at: string; // datetime-local format (empty = send now)
}

const DEFAULT_HTML = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>{{ preheader }}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;margin:0;padding:32px 16px;background:#f5f5f7;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">{{ preheader }}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background:#fff;border-radius:12px;">
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#1a1a1a;">Hello!</h1>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;">Write your email body here.</p>
          <p style="margin:0 0 16px 0;font-size:16px;line-height:24px;">
            <a href="https://exclu.at/app/dashboard" style="color:#7c3aed;">Open your dashboard</a>
          </p>
          <p style="margin:32px 0 0 0;font-size:13px;color:#6b6b75;">
            — The Exclu team
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#fafafa;border-top:1px solid #eaeaef;font-size:12px;color:#6b6b75;">
          Don't want these emails? <a href="{{ unsubscribe }}" style="color:#6b6b75;">Unsubscribe</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

function campaignToForm(c: Campaign | null): FormState {
  if (!c) {
    return {
      name: "",
      subject: "",
      preheader: "",
      html_content: DEFAULT_HTML,
      tag: "",
      segmentMode: "inline",
      segment_id: null,
      inlineRules: {},
      scheduled_at: "",
    };
  }
  return {
    name: c.name,
    subject: c.subject,
    preheader: c.preheader ?? "",
    html_content: c.html_content,
    tag: c.tag ?? "",
    segmentMode: c.segment_id ? "existing" : "inline",
    segment_id: c.segment_id,
    inlineRules: (c.resolved_rules ?? {}) as SegmentRules,
    scheduled_at: c.scheduled_at
      ? new Date(c.scheduled_at).toISOString().slice(0, 16)
      : "",
  };
}

export default function AdminEmailCampaignEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id || id === "new";

  const [form, setForm] = useState<FormState>(campaignToForm(null));
  const [loaded, setLoaded] = useState<Campaign | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  // Load campaign
  const { data: getData, isLoading: loadingCampaign } = useQuery({
    queryKey: ["admin-campaign", id],
    queryFn: () => adminCampaigns.getCampaign(id!),
    enabled: !isNew,
  });

  useEffect(() => {
    if (getData?.campaign) {
      setForm(campaignToForm(getData.campaign));
      setLoaded(getData.campaign);
    }
  }, [getData?.campaign]);

  // Load segments for the picker
  const { data: segmentsData } = useQuery({
    queryKey: ["admin-segments"],
    queryFn: () => adminCampaigns.listSegments(),
  });
  const segments = segmentsData?.segments ?? [];

  const selectedSegment = useMemo(
    () => segments.find((s) => s.id === form.segment_id) ?? null,
    [segments, form.segment_id],
  );

  const effectiveRules: SegmentRules = form.segmentMode === "existing" && selectedSegment
    ? (selectedSegment.rules as SegmentRules)
    : form.inlineRules;

  const saveMutation = useMutation({
    mutationFn: () =>
      adminCampaigns.upsertCampaign({
        id: loaded?.id,
        name: form.name.trim(),
        subject: form.subject.trim(),
        preheader: form.preheader.trim() || null,
        html_content: form.html_content,
        tag: form.tag.trim() || null,
        segment_id: form.segmentMode === "existing" ? form.segment_id : null,
        scheduled_at: form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,
      }),
    onSuccess: ({ campaign }) => {
      toast.success(isNew ? "Campaign created" : "Campaign saved");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      if (isNew) {
        navigate(`/admin/emails/campaigns/${campaign.id}`, { replace: true });
      } else {
        qc.invalidateQueries({ queryKey: ["admin-campaign", id] });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: (scheduled_at: string | null) =>
      adminCampaigns.startCampaign(loaded!.id, scheduled_at),
    onSuccess: (res) => {
      if (res.scheduled) {
        toast.success("Campaign scheduled — sends start at the specified time.");
      } else {
        toast.success(
          `Campaign started — ${res.enqueued ?? 0} recipients enqueued (of ${res.total_recipients ?? 0} resolved).`,
        );
      }
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      qc.invalidateQueries({ queryKey: ["admin-campaign", id] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleTestSend = async () => {
    if (!loaded) {
      toast.error("Save the campaign before sending a test.");
      return;
    }
    const target = testEmail.trim();
    if (!target || !target.includes("@")) {
      toast.error("Enter a valid test email");
      return;
    }
    setTestSending(true);
    try {
      await adminCampaigns.testSend(loaded.id, target);
      toast.success(`Test email sent to ${target}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTestSending(false);
    }
  };

  if (!isNew && loadingCampaign) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading campaign…
      </div>
    );
  }

  const isEditable = !loaded || loaded.status === "draft" || loaded.status === "scheduled";
  const status = loaded?.status ?? "draft";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/emails/campaigns")}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold text-exclu-cloud truncate">
            {isNew ? "New campaign" : form.name || "(untitled)"}
          </h2>
          <Badge variant="outline" className="capitalize">
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewOpen(true)}
            disabled={!form.html_content}
          >
            <Eye className="w-4 h-4 mr-1.5" /> Preview
          </Button>
          <Button
            variant="hero"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!isEditable || saveMutation.isPending || !form.name || !form.subject}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {isNew ? "Create draft" : "Save"}
          </Button>
        </div>
      </div>

      {loaded?.last_error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-400">
          {loaded.last_error}
        </div>
      )}

      {/* Form sections */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: metadata + segment */}
        <div className="space-y-4">
          <Section title="Content">
            <div className="space-y-3">
              <Field label="Internal name" required>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Q2 creator onboarding v1"
                  disabled={!isEditable}
                />
              </Field>
              <Field label="Subject" required hint={`${form.subject.length}/150`}>
                <Input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Welcome to Exclu"
                  maxLength={150}
                  disabled={!isEditable}
                />
              </Field>
              <Field label="Preheader" hint={`${form.preheader.length}/200 — shown in inbox preview`}>
                <Input
                  value={form.preheader}
                  onChange={(e) => setForm({ ...form, preheader: e.target.value })}
                  placeholder="A quick note from Maria"
                  maxLength={200}
                  disabled={!isEditable}
                />
              </Field>
              <Field label="Tag" hint="Optional. Groups campaigns in stats. Becomes utm_campaign.">
                <Input
                  value={form.tag}
                  onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  placeholder="onboarding-q2"
                  disabled={!isEditable}
                />
              </Field>
            </div>
          </Section>

          <Section title="Audience">
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => setForm({ ...form, segmentMode: "inline" })}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    form.segmentMode === "inline"
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Inline rules
                </button>
                <button
                  type="button"
                  disabled={!isEditable}
                  onClick={() => setForm({ ...form, segmentMode: "existing" })}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                    form.segmentMode === "existing"
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-card border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  Saved segment
                </button>
              </div>

              {form.segmentMode === "existing" ? (
                <>
                  <select
                    value={form.segment_id ?? ""}
                    onChange={(e) => setForm({ ...form, segment_id: e.target.value || null })}
                    disabled={!isEditable}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">-- Pick a segment --</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {selectedSegment && (
                    <SegmentBuilder
                      value={selectedSegment.rules as SegmentRules}
                      onChange={() => {
                        /* read-only when using a saved segment */
                      }}
                      hidePreview={false}
                    />
                  )}
                  {segments.length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      No saved segments yet. Define inline rules or save one from this form (feature TBD).
                    </div>
                  )}
                </>
              ) : (
                <SegmentBuilder
                  value={form.inlineRules}
                  onChange={(rules) => setForm({ ...form, inlineRules: rules })}
                />
              )}
            </div>
          </Section>

          <Section title="Test send">
            <div className="flex gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1"
              />
              <Button
                onClick={handleTestSend}
                variant="outline"
                size="sm"
                disabled={testSending || !loaded}
              >
                {testSending ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <TestTube className="w-4 h-4 mr-1.5" />
                )}
                Test send
              </Button>
            </div>
            {!loaded && (
              <div className="text-[10px] text-muted-foreground mt-1.5">
                Save the campaign first to enable test send.
              </div>
            )}
          </Section>
        </div>

        {/* Right: HTML editor */}
        <div className="space-y-4">
          <Section title="HTML content">
            <Textarea
              value={form.html_content}
              onChange={(e) => setForm({ ...form, html_content: e.target.value })}
              disabled={!isEditable}
              className="font-mono text-xs min-h-[500px] bg-background"
              placeholder="<!DOCTYPE html>..."
            />
            <div className="text-[10px] text-muted-foreground mt-1.5 space-y-0.5">
              <div>Available placeholders:</div>
              <ul className="list-disc pl-5">
                <li><code>{"{{ unsubscribe }}"}</code> — required. Replaced by a per-recipient HMAC URL.</li>
                <li><code>{"{{ email }}"}</code> — recipient email address.</li>
                <li><code>{"{{ preheader }}"}</code> — preheader text set above.</li>
              </ul>
              <div>All absolute <code>http(s)</code> links get <code>utm_source=email&amp;utm_medium=campaign&amp;utm_campaign=&lt;tag-or-slug&gt;</code> appended automatically.</div>
            </div>
          </Section>
        </div>
      </div>

      {/* Send controls */}
      {loaded && isEditable && (
        <Section title="Send">
          <div className="space-y-3">
            <div className="flex gap-2 items-end">
              <Field
                label="Schedule (optional)"
                hint="Leave empty to start sending immediately. Times in local timezone."
                className="flex-1"
              >
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                  className="max-w-[260px]"
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="hero" disabled={startMutation.isPending}>
                    {startMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Rocket className="w-4 h-4 mr-1.5" />
                    )}
                    {form.scheduled_at ? "Schedule campaign" : "Send now"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {form.scheduled_at ? "Schedule this campaign?" : "Send this campaign to all matching contacts?"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Make sure you've saved any last changes. Once sending starts, the HTML and audience are locked in. Warmup cap applies (daily maximum based on domain age).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        startMutation.mutate(
                          form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
                        )
                      }
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {form.scheduled_at ? "Schedule" : "Send now"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </Section>
      )}

      {/* Preview modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Preview — {form.subject || "(no subject)"}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto border border-border rounded bg-white">
            <iframe
              srcDoc={form.html_content
                .replace(/\{\{\s*unsubscribe\s*\}\}/gi, "https://exclu.at/unsubscribe?t=PREVIEW_TOKEN")
                .replace(/\{\{\s*email\s*\}\}/gi, testEmail || "preview@exclu.at")
                .replace(/\{\{\s*preheader\s*\}\}/gi, form.preheader || "")}
              title="Email preview"
              className="w-full h-[70vh] border-0"
              sandbox=""
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-exclu-cloud mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-exclu-cloud">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
