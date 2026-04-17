import { useMemo } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ChevronDown } from "lucide-react";
import { lintEmail, type LintIssue, type LintResult } from "@/lib/emailLint";

interface Props {
  subject: string;
  html: string;
  category?: string;
  declaredVariables?: Array<{ key: string } | string>;
  /** Optional override when the server returned a fresh lint result. */
  overrideResult?: LintResult | null;
  className?: string;
}

/**
 * Live deliverability + quality feedback for the email being edited.
 *
 * Strategy: run the exact same lintEmail() logic the server will run on
 * save. The server remains authoritative — it blocks 'error'-severity
 * saves with a 422 — but this panel reports the same verdict instantly.
 *
 * When `overrideResult` is provided (e.g. from the last server response)
 * the panel shows that instead of re-linting locally. This covers the
 * brief window between "admin hit Save" and "server returned", so issues
 * the server flagged stay visible even if the admin keeps typing.
 */
export function EmailLintPanel({
  subject,
  html,
  category = "transactional",
  declaredVariables,
  overrideResult,
  className,
}: Props) {
  const result = useMemo(() => {
    if (overrideResult) return overrideResult;
    return lintEmail({ subject, html, category, declaredVariables });
  }, [subject, html, category, declaredVariables, overrideResult]);

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const infos = result.issues.filter((i) => i.severity === "info");

  if (result.issues.length === 0) {
    return (
      <div
        className={`rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center gap-2 text-sm text-emerald-500 ${className ?? ""}`}
      >
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>All deliverability checks pass.</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-card/60 overflow-hidden ${className ?? ""}`}>
      <div className="px-3 py-2.5 border-b border-border/60 flex items-center gap-2 text-xs font-medium text-foreground">
        {errors.length > 0 ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : warnings.length > 0 ? (
          <AlertTriangle className="w-4 h-4 text-amber-500" />
        ) : (
          <Info className="w-4 h-4 text-muted-foreground" />
        )}
        <span>
          {errors.length > 0 && (
            <span className="text-red-500">{errors.length} error{errors.length > 1 ? "s" : ""}</span>
          )}
          {errors.length > 0 && warnings.length > 0 && <span className="mx-1.5">·</span>}
          {warnings.length > 0 && (
            <span className="text-amber-500">
              {warnings.length} warning{warnings.length > 1 ? "s" : ""}
            </span>
          )}
          {(errors.length > 0 || warnings.length > 0) && infos.length > 0 && <span className="mx-1.5">·</span>}
          {infos.length > 0 && (
            <span className="text-muted-foreground">
              {infos.length} info
            </span>
          )}
        </span>
      </div>

      <div className="divide-y divide-border/40">
        {errors.map((issue, i) => (
          <IssueRow key={`e${i}`} issue={issue} />
        ))}
        {warnings.map((issue, i) => (
          <IssueRow key={`w${i}`} issue={issue} />
        ))}
        {infos.length > 0 && <InfoGroup issues={infos} />}
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: LintIssue }) {
  const palette =
    issue.severity === "error"
      ? "text-red-500"
      : issue.severity === "warning"
        ? "text-amber-500"
        : "text-muted-foreground";
  const Icon =
    issue.severity === "error" ? AlertCircle : issue.severity === "warning" ? AlertTriangle : Info;
  return (
    <div className="px-3 py-2.5 flex items-start gap-2 text-[13px]">
      <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${palette}`} />
      <div className="min-w-0 flex-1">
        <div className="text-foreground leading-snug">{issue.message}</div>
        {issue.detail && (
          <div className="text-[11px] text-muted-foreground mt-0.5 break-words">{issue.detail}</div>
        )}
      </div>
    </div>
  );
}

function InfoGroup({ issues }: { issues: LintIssue[] }) {
  return (
    <details className="group px-3 py-2 text-[12px] text-muted-foreground">
      <summary className="flex items-center gap-1.5 cursor-pointer select-none list-none">
        <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
        <span>{issues.length} info check{issues.length > 1 ? "s" : ""}</span>
      </summary>
      <div className="mt-1 space-y-1.5 pl-5">
        {issues.map((i, idx) => (
          <div key={idx}>
            <div className="text-foreground/80">{i.message}</div>
            {i.detail && <div className="text-[11px] opacity-75">{i.detail}</div>}
          </div>
        ))}
      </div>
    </details>
  );
}
