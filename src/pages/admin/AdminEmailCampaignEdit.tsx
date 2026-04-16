import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
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
// Form state
// ═══════════════════════════════════════════════════════════════════════

type ContentMode = "simple" | "html";
type StepNumber = 1 | 2 | 3 | 4;

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
  const [currentStep, setCurrentStep] = useState<StepNumber>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<StepNumber>>(new Set());
  const stepRefs = useRef<Record<StepNumber, HTMLDivElement | null>>({
    1: null,
    2: null,
    3: null,
    4: null,
  });

  // Live-sync simple → HTML whenever simple content or preheader changes (simple mode only).
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
      const parsed = campaignToForm(getData.campaign);
      setForm(parsed);
      setLoaded(getData.campaign);
      setCompletedSteps(new Set([1, 2, 3, 4]));
      setCurrentStep(1);
    }
  }, [getData?.campaign]);

  // Validation per step
  const step1Valid = form.name.trim().length > 0 && form.subject.trim().length > 0;
  const step2Valid = hasAnyFilterValue(form.rules);
  const step3Valid =
    form.htmlContent.trim().length > 0 &&
    (form.contentMode === "html" || form.simpleContent.headline.trim().length > 0);

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

  // Save / mutations
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
      toast.success(isNew ? "Brouillon créé" : "Enregistré");
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      if (isNew) {
        navigate(`/admin/emails/campaigns/${campaign.id}`, { replace: true });
      } else {
        qc.invalidateQueries({ queryKey: ["admin-campaign", id] });
        setLoaded(campaign);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: (scheduledAt: string | null) =>
      adminCampaigns.startCampaign(loaded!.id, scheduledAt),
    onSuccess: (res) => {
      if (res.scheduled) {
        toast.success("Campagne programmée — l'envoi démarrera à l'heure choisie.");
      } else {
        toast.success(
          `Campagne lancée — ${res.enqueued ?? 0} destinataires en file d'attente.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["admin-campaigns"] });
      qc.invalidateQueries({ queryKey: ["admin-campaign", id] });
      setTimeout(() => navigate("/admin/emails/campaigns"), 400);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canSave = step1Valid;
  const canLaunch = Boolean(loaded && step1Valid && step2Valid && step3Valid);
  const isEditable = !loaded || loaded.status === "draft" || loaded.status === "scheduled";

  if (!isNew && loadingCampaign) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Chargement de la campagne…
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
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
          <h2 className="text-xl sm:text-2xl font-bold text-foreground truncate">
            {isNew ? "Nouvelle campagne" : form.name || "Campagne sans titre"}
          </h2>
          {loaded && (
            <Badge variant="outline" className="capitalize mt-0.5 text-[10px]">
              {loaded.status}
            </Badge>
          )}
        </div>
        {isEditable && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            className="flex-shrink-0"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            <span className="hidden sm:inline">Enregistrer</span>
          </Button>
        )}
      </div>

      {loaded?.last_error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          {loaded.last_error}
        </div>
      )}

      <ProgressIndicator
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
      />

      <StepCard
        stepRef={(el) => (stepRefs.current[1] = el)}
        number={1}
        title="Infos de la campagne"
        subtitle="Ce que voient les destinataires avant d'ouvrir l'email"
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
                <span className="font-medium text-foreground">Objet :</span> {form.subject}
              </div>
              {form.preheader && (
                <div className="text-xs text-muted-foreground truncate">
                  <span className="font-medium text-foreground">Aperçu :</span> {form.preheader}
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
        subtitle="Qui va recevoir cette campagne"
        icon={<Users className="w-5 h-5" />}
        isActive={currentStep === 2}
        isCompleted={completedSteps.has(2)}
        isLocked={!completedSteps.has(1) && currentStep < 2}
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
        title="Contenu de l'email"
        subtitle="Rédige ton message, l'aperçu se met à jour en direct"
        icon={<Mail className="w-5 h-5" />}
        isActive={currentStep === 3}
        isCompleted={completedSteps.has(3)}
        isLocked={!completedSteps.has(2) && currentStep < 3}
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
        title="Envoi"
        subtitle="Dernière étape — choisir quand l'email part"
        icon={<Rocket className="w-5 h-5" />}
        isActive={currentStep === 4}
        isCompleted={completedSteps.has(4)}
        isLocked={!completedSteps.has(3) && currentStep < 4}
        isEditable={isEditable}
        onEdit={() => goToStep(4)}
        summary={null}
      >
        <StepSend
          form={form}
          setForm={setForm}
          loaded={loaded}
          canLaunch={canLaunch}
          saveMutation={saveMutation}
          startMutation={startMutation}
          isEditable={isEditable}
          onSaveFirst={() => saveMutation.mutate()}
        />
      </StepCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Progress indicator
// ═══════════════════════════════════════════════════════════════════════

const STEP_LABELS: Record<StepNumber, string> = {
  1: "Infos",
  2: "Audience",
  3: "Contenu",
  4: "Envoi",
};

function ProgressIndicator({
  currentStep,
  completedSteps,
  onStepClick,
}: {
  currentStep: StepNumber;
  completedSteps: Set<StepNumber>;
  onStepClick: (step: StepNumber) => void;
}) {
  const steps: StepNumber[] = [1, 2, 3, 4];
  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-1 sm:gap-2">
        {steps.map((step, idx) => {
          const done = completedSteps.has(step);
          const active = currentStep === step;
          const clickable = done || active;
          return (
            <div key={step} className="flex items-center flex-1 min-w-0">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(step)}
                className={`flex items-center gap-2 min-w-0 group transition-colors ${
                  clickable ? "cursor-pointer" : "cursor-not-allowed"
                }`}
              >
                <motion.div
                  layout
                  initial={false}
                  animate={{ scale: active ? 1.05 : 1 }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-colors ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : active
                        ? "bg-primary/15 border-2 border-primary text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : step}
                </motion.div>
                <span
                  className={`text-xs sm:text-sm font-medium truncate hidden sm:block ${
                    done || active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {STEP_LABELS[step]}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-px mx-2 sm:mx-3 transition-colors ${
                    completedSteps.has(step) ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Step card container
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
              ÉTAPE {number}
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
            Modifier
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
      <Field
        label="Nom interne"
        hint="Juste pour toi — n'apparaît pas dans l'email"
        required
      >
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ex: Relance onboarding — avril"
          className="h-11"
        />
      </Field>

      <Field
        label="Objet de l'email"
        hint="Le premier truc que voient les destinataires dans leur boîte"
        required
        meta={`${form.subject.length}/150`}
      >
        <Input
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          placeholder="Ex: On a quelque chose à te montrer"
          maxLength={150}
          className="h-11"
        />
      </Field>

      <Field
        label="Texte d'aperçu (preheader)"
        hint="Petit extrait visible dans la liste des emails, après l'objet. Optionnel mais très recommandé."
        meta={`${form.preheader.length}/200`}
      >
        <Input
          value={form.preheader}
          onChange={(e) => setForm((f) => ({ ...f, preheader: e.target.value }))}
          placeholder="Ex: 3 conseils pour optimiser ton profil en 5 minutes"
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
        Options avancées
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
              label="Tag (regroupement stats)"
              hint="Utilisé pour UTM + regrouper les campagnes dans les statistiques. Ex: onboarding, relance, newsletter."
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
          Continuer
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
      <div className="rounded-lg bg-muted/30 border border-border/60 p-3 text-xs text-muted-foreground leading-relaxed">
        Choisis qui va recevoir la campagne.{" "}
        <strong className="text-foreground">Ajoute au moins un filtre</strong> — c'est obligatoire
        pour éviter d'envoyer à tous les contacts par accident. Seuls les contacts{" "}
        <strong className="text-foreground">opt-in marketing</strong> sont inclus automatiquement.
      </div>

      <SegmentBuilder value={rules} onChange={setRules} />

      <div className="flex justify-end pt-3">
        <Button variant="hero" size="lg" onClick={onContinue} disabled={!canContinue}>
          Continuer
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function AudienceSummary({ rules }: { rules: SegmentRules }) {
  const parts: string[] = [];
  if (rules.role && rules.role.length > 0) parts.push(`Type : ${rules.role.join(", ")}`);
  if (typeof rules.has_account === "boolean")
    parts.push(rules.has_account ? "Avec compte Exclu" : "Email seul (pas de compte)");
  if (rules.last_seen_after) parts.push(`Actif après ${rules.last_seen_after.slice(0, 10)}`);
  if (rules.email_contains) parts.push(`Email contient "${rules.email_contains}"`);
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
        <span className="text-amber-500">Aucun filtre défini</span>
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
          "Ton HTML a été modifié manuellement. Revenir au mode simple va écraser tes changements. Continuer ?",
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
          HTML avancé
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Left: editor */}
        <div className="space-y-4 min-w-0">
          {form.contentMode === "simple" ? (
            <>
              <Field label="Titre principal" required>
                <Input
                  value={form.simpleContent.headline}
                  onChange={(e) => patchSimple({ headline: e.target.value })}
                  placeholder="Bonjour Maria 👋"
                  className="h-11 text-base"
                />
              </Field>

              <Field label="Message" hint="Saute 2 lignes pour créer un nouveau paragraphe">
                <Textarea
                  value={form.simpleContent.intro}
                  onChange={(e) => patchSimple({ intro: e.target.value })}
                  placeholder={
                    "On vient de lancer une nouvelle fonctionnalité qu'on voulait te montrer…\n\nÇa te permet de gagner du temps sur ton profil, en 1 clic."
                  }
                  className="min-h-[120px] text-sm resize-y"
                />
              </Field>

              <Field label="Bouton d'action" hint="Optionnel — laisse vide si tu n'en veux pas">
                <div className="grid grid-cols-5 gap-2">
                  <Input
                    value={form.simpleContent.cta?.text ?? ""}
                    onChange={(e) => patchCta({ text: e.target.value })}
                    placeholder="Ouvrir mon tableau de bord"
                    className="col-span-2 h-11"
                  />
                  <Input
                    value={form.simpleContent.cta?.url ?? ""}
                    onChange={(e) => patchCta({ url: e.target.value })}
                    placeholder="https://exclu.at/app/dashboard"
                    className="col-span-3 h-11 font-mono text-xs"
                  />
                </div>
              </Field>

              <Field label="Conclusion" hint="Optionnel — texte après le bouton">
                <Textarea
                  value={form.simpleContent.outro}
                  onChange={(e) => patchSimple({ outro: e.target.value })}
                  placeholder={"Si tu as des questions, réponds à cet email — je lis tout."}
                  className="min-h-[80px] text-sm resize-y"
                />
              </Field>

              <Field label="Signature">
                <Textarea
                  value={form.simpleContent.signature}
                  onChange={(e) => patchSimple({ signature: e.target.value })}
                  placeholder="— Maria, équipe Exclu"
                  className="min-h-[60px] text-sm resize-y"
                />
              </Field>
            </>
          ) : (
            <Field
              label="HTML complet"
              hint="Les placeholders {{ unsubscribe }}, {{ email }}, {{ preheader }} sont substitués à l'envoi. Les liens absolus reçoivent automatiquement les UTM."
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
            Aperçu en direct
          </div>
          <div className="rounded-lg border border-border bg-white overflow-hidden lg:sticky lg:top-4">
            <iframe
              srcDoc={form.htmlContent
                .replace(/<!--\s*EXCLU_BLOCKS:[\s\S]*?-->/, "")
                .replace(/\{\{\s*unsubscribe\s*\}\}/gi, "https://exclu.at/unsubscribe?t=PREVIEW")
                .replace(/\{\{\s*email\s*\}\}/gi, "preview@exclu.at")
                .replace(/\{\{\s*preheader\s*\}\}/gi, form.preheader || "")}
              title="Aperçu"
              className="w-full h-[calc(100vh-240px)] min-h-[500px] max-h-[720px] border-0"
              sandbox=""
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3">
        <Button variant="hero" size="lg" onClick={onContinue} disabled={!canContinue}>
          Continuer
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function ContentSummary({ form }: { form: FormState }) {
  const preview =
    form.contentMode === "simple"
      ? form.simpleContent.headline || "(pas de titre)"
      : "HTML personnalisé";
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
// Step 4 — Send
// ═══════════════════════════════════════════════════════════════════════

function StepSend({
  form,
  setForm,
  loaded,
  canLaunch,
  saveMutation,
  startMutation,
  isEditable,
  onSaveFirst,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  loaded: Campaign | null;
  canLaunch: boolean;
  saveMutation: { isPending: boolean };
  startMutation: { isPending: boolean; mutate: (scheduledAt: string | null) => void };
  isEditable: boolean;
  onSaveFirst: () => void;
}) {
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const handleTestSend = async () => {
    if (!loaded) {
      toast.error("Enregistre d'abord la campagne pour envoyer un test.");
      return;
    }
    const t = testEmail.trim();
    if (!t || !t.includes("@")) {
      toast.error("Entre un email valide");
      return;
    }
    setTestSending(true);
    try {
      await adminCampaigns.testSend(loaded.id, t);
      toast.success(`Test envoyé à ${t}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTestSending(false);
    }
  };

  const isSaved = Boolean(loaded);
  const needsSave = !isSaved || saveMutation.isPending;
  const scheduled = form.scheduledAt ? new Date(form.scheduledAt) : null;
  const isFuture = scheduled ? scheduled.getTime() > Date.now() + 30_000 : false;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TestTube className="w-4 h-4 text-primary" />
          Envoi de test
        </div>
        <div className="text-xs text-muted-foreground">
          Envoie la version complète à ton adresse pour vérifier le rendu dans ta boîte.
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="toi@example.com"
            className="h-10 flex-1"
          />
          <Button
            onClick={handleTestSend}
            variant="outline"
            disabled={testSending || !loaded}
            className="sm:flex-shrink-0"
          >
            {testSending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-1.5" />
            )}
            Envoyer le test
          </Button>
        </div>
        {!loaded && (
          <div className="text-[11px] text-amber-500">
            Enregistre la campagne (bouton en haut) pour débloquer l'envoi de test.
          </div>
        )}
      </div>

      <Field
        label="Programmer l'envoi"
        hint="Laisse vide pour envoyer tout de suite. Horaires en heure locale."
      >
        <Input
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
          className="h-11 max-w-[280px]"
        />
      </Field>

      <div className="rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Quota warmup :</strong> la plateforme est en période
        de montée en charge. Les envois sont limités par jour glissant — si ta campagne dépasse le
        quota, elle reprend automatiquement le lendemain.
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3">
        {!isSaved && (
          <Button variant="outline" onClick={onSaveFirst} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            Enregistrer comme brouillon
          </Button>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="hero"
              size="lg"
              disabled={!canLaunch || startMutation.isPending || !isEditable || needsSave}
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4 mr-1.5" />
              )}
              {isFuture ? "Programmer l'envoi" : "Envoyer maintenant"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isFuture ? "Programmer cette campagne ?" : "Envoyer cette campagne maintenant ?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Une fois lancée, le contenu et l'audience sont figés. Le quota warmup s'applique
                (envoi étalé sur plusieurs jours si besoin).
                {isFuture && scheduled && <> L'envoi démarrera le {scheduled.toLocaleString()}.</>}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  startMutation.mutate(
                    form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
                  )
                }
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isFuture ? "Programmer" : "Lancer l'envoi"}
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
