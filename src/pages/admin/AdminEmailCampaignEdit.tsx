import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useDebounce } from "use-debounce";
import { adminCampaigns, type Campaign, type SegmentRules } from "@/lib/adminCampaigns";
import {
  renderSimpleTemplate,
  parseSimpleContent,
  EMPTY_SIMPLE_CONTENT,
  type SimpleContent,
} from "@/lib/campaignTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import SegmentBuilder, { hasAnyFilterValue } from "@/components/admin/SegmentBuilder";
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
  ArrowLeft,
  Check,
  Loader2,
  Save,
  Send,
  TestTube,
  Rocket,
  Pencil,
  ChevronDown,
  Code2,
  Sparkles,
  Users,
  Mail,
  MonitorSmartphone,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════════════
// CTA preset destinations
// ═══════════════════════════════════════════════════════════════════════

const CTA_PRESETS: Array<{ key: string; label: string; url: string }> = [
  { key: "dashboard", label: "Creator dashboard", url: "https://exclu.at/app/dashboard" },
  { key: "profile", label: "Profile editor (Link-in-bio)", url: "https://exclu.at/app/profile" },
  { key: "links", label: "Paid links", url: "https://exclu.at/app/links" },
  { key: "content", label: "Content library", url: "https://exclu.at/app/content" },
  { key: "chat", label: "Chat inbox", url: "https://exclu.at/app/chat" },
  { key: "earnings", label: "Earnings / wallet", url: "https://exclu.at/app/earnings" },
  { key: "referral", label: "Referral dashboard", url: "https://exclu.at/app/referral" },
  { key: "settings", label: "Profile settings", url: "https://exclu.at/app/profile" },
  { key: "fan", label: "Fan dashboard", url: "https://exclu.at/fan" },
  { key: "signup", label: "Creator sign up", url: "https://exclu.at/auth?mode=signup" },
  { key: "help", label: "Help center", url: "https://exclu.at/help-center" },
  { key: "directory", label: "Directory", url: "https://exclu.at/directory" },
  { key: "blog", label: "Blog", url: "https://exclu.at/blog" },
  { key: "home", label: "Home page", url: "https://exclu.at/" },
];

function matchPresetKey(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const hit = CTA_PRESETS.find((p) => p.url === trimmed);
  return hit ? hit.key : null;
}

// ═══════════════════════════════════════════════════════════════════════
// Form state
// ═══════════════════════════════════════════════════════════════════════

type ContentMode = "simple" | "html";
type StepNumber = 1 | 2 | 3 | 4;
type ActiveStep = StepNumber | null;

interface FormState {
  name: string;
  subject: string;
  preheader: string;
  tag: string;
  rules: SegmentRules;
  contentMode: ContentMode;
  simpleContent: SimpleContent;
  htmlContent: string;
  scheduledAt: string;
}

function campaignToForm(c: Campaign | null): FormState {
  if (!c) {
    return {
      name: "",
      subject: "",
      preheader: "",
      tag: "",
      rules: {},
      contentMode: "simple",
      simpleContent: { ...EMPTY_SIMPLE_CONTENT },
      htmlContent: renderSimpleTemplate(EMPTY_SIMPLE_CONTENT, ""),
      scheduledAt: "",
    };
  }
  const parsed = parseSimpleContent(c.html_content);
  return {
    name: c.name,
    subject: c.subject,
    preheader: c.preheader ?? "",
    tag: c.tag ?? "",
    rules: (c.resolved_rules ?? {}) as SegmentRules,
    contentMode: parsed ? "simple" : "html",
    simpleContent: parsed ?? { ...EMPTY_SIMPLE_CONTENT },
    htmlContent: c.html_content,
    scheduledAt: c.scheduled_at ? new Date(c.scheduled_at).toISOString().slice(0, 16) : "",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════

export default function AdminEmailCampaignEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isNew = !id || id === "new";

  const [form, setForm] = useState<FormState>(campaignToForm(null));
  const [loaded, setLoaded] = useState<Campaign | null>(null);
  // On /new → start at step 1. On /:id → null = all sections collapsed,
  // admin clicks a step card to re-open it.
  const [currentStep, setCurrentStep] = useState<ActiveStep>(isNew ? 1 : null);
  const [completedSteps, setCompletedSteps] = useState<Set<StepNumber>>(new Set());
  const stepRefs = useRef<Record<StepNumber, HTMLDivElement | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
  });

  // Live sync simple → HTML
  useEffect(() => {
    if (form.contentMode === "simple") {
      setForm((prev) => ({
        ...prev,
        htmlContent: renderSimpleTemplate(prev.simpleContent, prev.preheader),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.simpleContent, form.preheader, form.contentMode]);

  // Load existing campaign
  const { data: getData, isLoading: loadingCampaign } = useQuery({
    queryKey: ["admin-campaign", id],
    queryFn: () => adminCampaigns.getCampaign(id!),
    enabled: !isNew,
  });
  useEffect(() => {
    if (getData?.campaign) {
      setForm(campaignToForm(getData.campaign));
      setLoaded(getData.campaign);
      setCompletedSteps(new Set([1, 2, 3, 4]));
      // Do NOT auto-open step 1 — all sections stay collapsed on first
      // load of an existing campaign. Admin clicks to re-open.
      setCurrentStep(null);
    }
  }, [getData?.campaign]);

  // Validation per step
  const step1Valid = form.name.trim().length > 0 && form.subject.trim().length > 0;
  const step2Valid = hasAnyFilterValue(form.rules);
  const step3Valid =
    form.htmlContent.trim().length > 0 &&
    (form.contentMode === "html" || form.simpleContent.headline.trim().length > 0);

  // Save mutation — invoked both by auto-save and manual save
  const [lastSavedKey, setLastSavedKey] = useState<string>("");
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const saveMutation = useMutation({
    mutationFn: () =>
      adminCampaigns.upsertCampaign({
        id: loaded?.id,
        name: form.name.trim(),
        subject: form.subject.trim(),
        preheader: form.preheader.trim() || null,
        html_content: form.htmlContent,
        tag: form.tag.trim() || null,
        segment_id: null,
        inline_rules: form.rules,
        scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
      }),
    onSuccess: ({ campaign }) => {
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      if (isNew && !loaded) {
        navigate(`/admin/emails/campaigns/${campaign.id}`, { replace: true });
      } else {
        qc.invalidateQueries({ queryKey: ["admin-campaign", id] });
      }
      setLoaded(campaign);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Auto-save: debounce 1.5s after any change while step 1 is valid.
  const [debouncedForm] = useDebounce(form, 1500);
  const debouncedKey = JSON.stringify({
    n: debouncedForm.name,
    s: debouncedForm.subject,
    p: debouncedForm.preheader,
    t: debouncedForm.tag,
    r: debouncedForm.rules,
    h: debouncedForm.htmlContent,
    sa: debouncedForm.scheduledAt,
  });
  useEffect(() => {
    if (!step1Valid) return;
    if (saveMutation.isPending) return;
    if (debouncedKey === lastSavedKey) return;
    setIsAutoSaving(true);
    saveMutation.mutate(undefined, {
      onSettled: () => {
        setLastSavedKey(debouncedKey);
        setIsAutoSaving(false);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, step1Valid]);

  // Navigation
  const goToStep = useCallback((step: StepNumber) => {
    setCurrentStep(step);
    setTimeout(() => {
      stepRefs.current[step]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  const completeAndAdvance = useCallback(
    (step: StepNumber) => {
      setCompletedSteps((prev) => new Set([...prev, step]));
      if (step < 4) goToStep((step + 1) as StepNumber);
    },
    [goToStep],
  );

  const startMutation = useMutation({
    mutationFn: (scheduledAt: string | null) =>
      adminCampaigns.startCampaign(loaded!.id, scheduledAt),
    onSuccess: (res) => {
      if (res.scheduled) {
        toast.success("Campaign scheduled — sending will start at the chosen time.");
      } else {
        toast.success(`Campaign launched — ${res.enqueued ?? 0} recipients queued.`);
      }
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      qc.invalidateQueries({ queryKey: ["admin-campaign", id] });
      setTimeout(() => navigate("/admin/emails/campaigns"), 400);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canLaunch = Boolean(loaded && step1Valid && step2Valid && step3Valid);
  const isEditable = !loaded || loaded.status === "draft" || loaded.status === "scheduled";

  if (!isNew && loadingCampaign) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading campaign…
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/admin/emails/campaigns")}
          className="flex-shrink-0 -ml-2"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground truncate">
              {isNew && !loaded ? "New campaign" : form.name || "Untitled campaign"}
            </h2>
            {loaded && (
              <Badge variant="outline" className="capitalize text-[10px] flex-shrink-0">
                {loaded.status}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <SaveIndicator
              isAutoSaving={isAutoSaving}
              saved={Boolean(loaded) && lastSavedKey === debouncedKey}
            />
          </div>
        </div>
      </div>

      {loaded?.last_error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          {loaded.last_error}
        </div>
      )}

      <StepCard
        stepRef={(el) => (stepRefs.current[1] = el)}
        number={1}
        title="Campaign info"
        subtitle="What recipients see in their inbox before opening"
        icon={<Sparkles className="w-5 h-5" />}
        isActive={currentStep === 1}
        isCompleted={completedSteps.has(1)}
        isEditable={isEditable}
        onEdit={() => goToStep(1)}
        summary={
          completedSteps.has(1) ? (
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground truncate">{form.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                <span className="font-medium text-foreground">Subject:</span> {form.subject}
              </div>
              {form.preheader && (
                <div className="text-xs text-muted-foreground truncate">
                  <span className="font-medium text-foreground">Preview:</span> {form.preheader}
                </div>
              )}
            </div>
          ) : null
        }
      >
        <StepBasics
          form={form}
          setForm={setForm}
          canContinue={step1Valid}
          onContinue={() => completeAndAdvance(1)}
        />
      </StepCard>

      <StepCard
        stepRef={(el) => (stepRefs.current[2] = el)}
        number={2}
        title="Audience"
        subtitle="Who receives this campaign"
        icon={<Users className="w-5 h-5" />}
        isActive={currentStep === 2}
        isCompleted={completedSteps.has(2)}
        isLocked={!completedSteps.has(1) && (currentStep ?? 0) < 2}
        isEditable={isEditable}
        onEdit={() => goToStep(2)}
        summary={completedSteps.has(2) ? <AudienceSummary rules={form.rules} /> : null}
      >
        <StepAudience
          rules={form.rules}
          setRules={(rules) => setForm((f) => ({ ...f, rules }))}
          canContinue={step2Valid}
          onContinue={() => completeAndAdvance(2)}
        />
      </StepCard>

      <StepCard
        stepRef={(el) => (stepRefs.current[3] = el)}
        number={3}
        title="Email content"
        subtitle="Write your message — preview updates live"
        icon={<Mail className="w-5 h-5" />}
        isActive={currentStep === 3}
        isCompleted={completedSteps.has(3)}
        isLocked={!completedSteps.has(2) && (currentStep ?? 0) < 3}
        isEditable={isEditable}
        onEdit={() => goToStep(3)}
        summary={completedSteps.has(3) ? <ContentSummary form={form} /> : null}
      >
        <StepContent
          form={form}
          setForm={setForm}
          canContinue={step3Valid}
          onContinue={() => completeAndAdvance(3)}
        />
      </StepCard>

      <StepCard
        stepRef={(el) => (stepRefs.current[4] = el)}
        number={4}
        title="Send"
        subtitle="Last step — choose when the email goes out"
        icon={<Rocket className="w-5 h-5" />}
        isActive={currentStep === 4}
        isCompleted={completedSteps.has(4)}
        isLocked={!completedSteps.has(3) && (currentStep ?? 0) < 4}
        isEditable={isEditable}
        onEdit={() => goToStep(4)}
        summary={null}
      >
        <StepSend
          form={form}
          setForm={setForm}
          loaded={loaded}
          canLaunch={canLaunch}
          startMutation={startMutation}
          isEditable={isEditable}
          isSaved={Boolean(loaded)}
        />
      </StepCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Save indicator
// ═══════════════════════════════════════════════════════════════════════

function SaveIndicator({ isAutoSaving, saved }: { isAutoSaving: boolean; saved: boolean }) {
  if (isAutoSaving) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (saved) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
        <Check className="w-3 h-3" />
        Saved
      </span>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Step card
// ═══════════════════════════════════════════════════════════════════════

interface StepCardProps {
  stepRef: (el: HTMLDivElement | null) => void;
  number: StepNumber;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  isActive: boolean;
  isCompleted: boolean;
  isLocked?: boolean;
  isEditable?: boolean;
  onEdit: () => void;
  summary: React.ReactNode;
  children: React.ReactNode;
}

function StepCard({
  stepRef,
  number,
  title,
  subtitle,
  icon,
  isActive,
  isCompleted,
  isLocked,
  isEditable = true,
  onEdit,
  summary,
  children,
}: StepCardProps) {
  const showSummary = isCompleted && !isActive;
  return (
    <motion.div
      ref={stepRef}
      layout
      transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
      className={`rounded-xl border bg-card overflow-hidden ${
        isActive
          ? "border-primary/50 shadow-lg shadow-primary/5"
          : isCompleted
            ? "border-border"
            : "border-border/60"
      } ${isLocked ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-border/60">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isCompleted
              ? "bg-emerald-500/15 text-emerald-500"
              : isActive
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {isCompleted ? <Check className="w-5 h-5" /> : icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground tracking-wider">
              STEP {number}
            </span>
            {isCompleted && !isActive && (
              <Badge className="bg-emerald-500/15 text-emerald-500 text-[9px] border-0 h-4 px-1.5">
                OK
              </Badge>
            )}
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
            {title}
          </h3>
          {isActive && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {showSummary && isEditable && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="flex-shrink-0">
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {isActive ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="p-4 sm:p-6">{children}</div>
          </motion.div>
        ) : summary ? (
          <motion.div
            key="summary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 sm:px-5 py-3 bg-muted/30">{summary}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Step 1 — Basics
// ═══════════════════════════════════════════════════════════════════════

function StepBasics({
  form,
  setForm,
  canContinue,
  onContinue,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-5">
      <Field label="Internal name" hint="Just for you — not shown in the email" required>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Onboarding nudge — April"
          className="h-11"
        />
      </Field>

      <Field
        label="Email subject"
        hint="The first thing recipients see in their inbox"
        required
        meta={`${form.subject.length}/150`}
      >
        <Input
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          placeholder="e.g. We have something to show you"
          maxLength={150}
          className="h-11"
        />
      </Field>

      <Field
        label="Preview text (preheader)"
        hint="Small snippet visible in the inbox list after the subject. Optional but highly recommended."
        meta={`${form.preheader.length}/200`}
      >
        <Input
          value={form.preheader}
          onChange={(e) => setForm((f) => ({ ...f, preheader: e.target.value }))}
          placeholder="e.g. 3 tips to optimize your profile in 5 minutes"
          maxLength={200}
          className="h-11"
        />
      </Field>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
        />
        Advanced options
      </button>

      <AnimatePresence initial={false}>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Field
              label="Tag (stats grouping)"
              hint="Used for UTM + grouping campaigns in stats. e.g. onboarding, nudge, newsletter."
            >
              <Input
                value={form.tag}
                onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                placeholder="onboarding"
                className="h-11 max-w-[300px]"
              />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-end pt-3">
        <Button variant="hero" size="lg" onClick={onContinue} disabled={!canContinue}>
          Continue
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Step 2 — Audience
// ═══════════════════════════════════════════════════════════════════════

function StepAudience({
  rules,
  setRules,
  canContinue,
  onContinue,
}: {
  rules: SegmentRules;
  setRules: (rules: SegmentRules) => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <SegmentBuilder value={rules} onChange={setRules} />

      <div className="flex justify-end pt-3">
        <Button variant="hero" size="lg" onClick={onContinue} disabled={!canContinue}>
          Continue
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function AudienceSummary({ rules }: { rules: SegmentRules }) {
  const parts: string[] = [];
  if (rules.role && rules.role.length > 0) parts.push(`Type: ${rules.role.join(", ")}`);
  if (typeof rules.has_account === "boolean")
    parts.push(rules.has_account ? "With Exclu account" : "Email only (no account)");
  if (rules.last_seen_after) parts.push(`Active after ${rules.last_seen_after.slice(0, 10)}`);
  if (rules.email_contains) parts.push(`Email contains "${rules.email_contains}"`);
  return (
    <div className="text-xs text-muted-foreground">
      {parts.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {parts.map((p) => (
            <Badge key={p} variant="outline" className="text-[10px]">
              {p}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-amber-500">No filter set</span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Step 3 — Content
// ═══════════════════════════════════════════════════════════════════════

function StepContent({
  form,
  setForm,
  canContinue,
  onContinue,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const toggleMode = () => {
    if (form.contentMode === "simple") {
      setForm((f) => ({ ...f, contentMode: "html" }));
    } else {
      const parsed = parseSimpleContent(form.htmlContent);
      if (parsed) {
        setForm((f) => ({
          ...f,
          contentMode: "simple",
          simpleContent: parsed,
          htmlContent: renderSimpleTemplate(parsed, f.preheader),
        }));
      } else {
        const ok = confirm(
          "Your HTML has been edited manually. Switching back to simple mode will overwrite those changes. Continue?",
        );
        if (ok) {
          setForm((f) => ({
            ...f,
            contentMode: "simple",
            simpleContent: { ...EMPTY_SIMPLE_CONTENT },
            htmlContent: renderSimpleTemplate(EMPTY_SIMPLE_CONTENT, f.preheader),
          }));
        }
      }
    }
  };

  const patchSimple = (partial: Partial<SimpleContent>) => {
    setForm((f) => ({ ...f, simpleContent: { ...f.simpleContent, ...partial } }));
  };

  const patchCta = (partial: Partial<{ text: string; url: string }>) => {
    setForm((f) => ({
      ...f,
      simpleContent: {
        ...f.simpleContent,
        cta: { ...(f.simpleContent.cta ?? { text: "", url: "" }), ...partial },
      },
    }));
  };

  return (
    <div className="space-y-5">
      {/* Mode toggle */}
      <div className="flex items-center rounded-lg border border-border bg-muted/20 p-1">
        <button
          type="button"
          onClick={() => form.contentMode !== "simple" && toggleMode()}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            form.contentMode === "simple"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Simple
        </button>
        <button
          type="button"
          onClick={() => form.contentMode !== "html" && toggleMode()}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
            form.contentMode === "html"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code2 className="w-4 h-4" />
          HTML advanced
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Left: editor */}
        <div className="space-y-4 min-w-0">
          {form.contentMode === "simple" ? (
            <>
              <Field label="Main heading" required>
                <Input
                  value={form.simpleContent.headline}
                  onChange={(e) => patchSimple({ headline: e.target.value })}
                  placeholder="Hi Maria 👋"
                  className="h-11 text-base"
                />
              </Field>

              <Field label="Message" hint="Double line break creates a new paragraph">
                <Textarea
                  value={form.simpleContent.intro}
                  onChange={(e) => patchSimple({ intro: e.target.value })}
                  placeholder={
                    "We just shipped a new feature we wanted to show you…\n\nIt lets you speed up your profile setup in one click."
                  }
                  className="min-h-[120px] text-sm resize-y"
                />
              </Field>

              <Field label="Call-to-action button" hint="Optional — leave empty if you don't want one">
                <CtaEditor
                  text={form.simpleContent.cta?.text ?? ""}
                  url={form.simpleContent.cta?.url ?? ""}
                  onTextChange={(t) => patchCta({ text: t })}
                  onUrlChange={(u) => patchCta({ url: u })}
                />
              </Field>

              <Field label="Closing" hint="Optional — text after the button">
                <Textarea
                  value={form.simpleContent.outro}
                  onChange={(e) => patchSimple({ outro: e.target.value })}
                  placeholder={"If you have any questions, just reply — I read everything."}
                  className="min-h-[80px] text-sm resize-y"
                />
              </Field>

              <Field label="Signature">
                <Textarea
                  value={form.simpleContent.signature}
                  onChange={(e) => patchSimple({ signature: e.target.value })}
                  placeholder="— Maria, Exclu team"
                  className="min-h-[60px] text-sm resize-y"
                />
              </Field>
            </>
          ) : (
            <Field
              label="Full HTML"
              hint="Placeholders {{ unsubscribe }}, {{ email }}, {{ preheader }} are replaced at send time. Absolute links get UTM params appended automatically."
            >
              <Textarea
                value={form.htmlContent}
                onChange={(e) => setForm((f) => ({ ...f, htmlContent: e.target.value }))}
                className="font-mono text-[11px] min-h-[500px] bg-background leading-relaxed"
                placeholder="<!DOCTYPE html>..."
              />
            </Field>
          )}
        </div>

        {/* Right: live preview */}
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MonitorSmartphone className="w-3.5 h-3.5" />
            Live preview
          </div>
          <div className="rounded-lg border border-border bg-white overflow-hidden lg:sticky lg:top-4">
            <iframe
              srcDoc={form.htmlContent
                .replace(/<!--\s*EXCLU_BLOCKS:[\s\S]*?-->/, "")
                .replace(/\{\{\s*unsubscribe\s*\}\}/gi, "https://exclu.at/unsubscribe?t=PREVIEW")
                .replace(/\{\{\s*email\s*\}\}/gi, "preview@exclu.at")
                .replace(/\{\{\s*preheader\s*\}\}/gi, form.preheader || "")}
              title="Preview"
              className="w-full h-[calc(100vh-240px)] min-h-[500px] max-h-[720px] border-0"
              sandbox=""
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3">
        <Button variant="hero" size="lg" onClick={onContinue} disabled={!canContinue}>
          Continue
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function ContentSummary({ form }: { form: FormState }) {
  const preview =
    form.contentMode === "simple"
      ? form.simpleContent.headline || "(no heading)"
      : "Custom HTML";
  return (
    <div className="text-xs text-muted-foreground truncate">
      <span className="text-foreground font-medium">{preview}</span>
      {form.contentMode === "simple" && form.simpleContent.intro && (
        <>
          {" "}
          · {form.simpleContent.intro.slice(0, 80)}
          {form.simpleContent.intro.length > 80 && "…"}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CTA Editor — smart destination dropdown + fallback custom URL
// ═══════════════════════════════════════════════════════════════════════

function CtaEditor({
  text,
  url,
  onTextChange,
  onUrlChange,
}: {
  text: string;
  url: string;
  onTextChange: (v: string) => void;
  onUrlChange: (v: string) => void;
}) {
  const matchedKey = matchPresetKey(url);
  // Show preset picker if URL is empty OR matches a known preset.
  // Show raw input if URL is custom (not in presets).
  const [forceCustom, setForceCustom] = useState(false);
  const isUsingPreset = !forceCustom && (url.trim() === "" || matchedKey !== null);

  // If user clears the URL while in custom mode, auto-reset to preset picker
  useEffect(() => {
    if (forceCustom && url.trim() === "") {
      setForceCustom(false);
    }
  }, [url, forceCustom]);

  return (
    <div className="space-y-2">
      <Input
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Open my dashboard"
        className="h-11"
      />

      {isUsingPreset ? (
        <div className="flex items-center gap-2">
          <select
            value={matchedKey ?? ""}
            onChange={(e) => {
              const preset = CTA_PRESETS.find((p) => p.key === e.target.value);
              if (preset) onUrlChange(preset.url);
              else onUrlChange("");
            }}
            className="h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">-- Where does this button go? --</option>
            {CTA_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setForceCustom(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline whitespace-nowrap"
          >
            Custom URL
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://…"
            className="h-11 font-mono text-xs flex-1"
            autoFocus
          />
          <button
            type="button"
            onClick={() => {
              setForceCustom(false);
              onUrlChange("");
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline whitespace-nowrap"
          >
            Use preset
          </button>
        </div>
      )}

      {url && !isUsingPreset && (
        <p className="text-[10px] text-muted-foreground">
          Using a custom URL. Clear the field to pick a preset destination again.
        </p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Step 4 — Send
// ═══════════════════════════════════════════════════════════════════════

function StepSend({
  form,
  setForm,
  loaded,
  canLaunch,
  startMutation,
  isEditable,
  isSaved,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  loaded: Campaign | null;
  canLaunch: boolean;
  startMutation: { isPending: boolean; mutate: (scheduledAt: string | null) => void };
  isEditable: boolean;
  isSaved: boolean;
}) {
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const handleTestSend = async () => {
    if (!loaded) {
      toast.error("Fill the campaign info first — we'll auto-save before sending a test.");
      return;
    }
    const t = testEmail.trim();
    if (!t || !t.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    setTestSending(true);
    try {
      await adminCampaigns.testSend(loaded.id, t);
      toast.success(`Test sent to ${t}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTestSending(false);
    }
  };

  const scheduled = form.scheduledAt ? new Date(form.scheduledAt) : null;
  const isFuture = scheduled ? scheduled.getTime() > Date.now() + 30_000 : false;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TestTube className="w-4 h-4 text-primary" />
          Test send
        </div>
        <div className="text-xs text-muted-foreground">
          Send the final version to your address to double-check how it looks in your inbox.
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-10 flex-1"
          />
          <Button
            onClick={handleTestSend}
            variant="outline"
            disabled={testSending || !isSaved}
            className="sm:flex-shrink-0"
          >
            {testSending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1.5" />
            )}
            Send test
          </Button>
        </div>
      </div>

      <Field
        label="Schedule send"
        hint="Leave empty to send right away. Times are in your local timezone."
      >
        <Input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
          className="h-11 max-w-[280px]"
        />
      </Field>

      <div className="rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Warmup quota:</strong> the platform is in its warmup
        window. Daily sending is capped — if your campaign exceeds the quota it resumes the next
        day automatically.
      </div>

      {/* Bottom action row: draft on the left, launch on the right, same height */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-3">
        <Button
          variant="outline"
          size="lg"
          disabled
          className="sm:w-auto w-full cursor-default opacity-80"
        >
          <Save className="w-4 h-4 mr-1.5" />
          Saved as draft
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="hero"
              size="lg"
              disabled={!canLaunch || startMutation.isPending || !isEditable}
              className="sm:w-auto w-full"
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4 mr-1.5" />
              )}
              {isFuture ? "Schedule send" : "Send now"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isFuture ? "Schedule this campaign?" : "Send this campaign now?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Once started, the content and audience are locked. Warmup quota applies — the
                campaign may resume the next day if today's cap is reached.
                {isFuture && scheduled && <> Sending will start on {scheduled.toLocaleString()}.</>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  startMutation.mutate(
                    form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
                  )
                }
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isFuture ? "Schedule" : "Launch send"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Shared Field
// ═══════════════════════════════════════════════════════════════════════

function Field({
  label,
  hint,
  required,
  meta,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {meta && <span className="text-[10px] text-muted-foreground">{meta}</span>}
      </div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}
