import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const Editor = lazy(() => import("@monaco-editor/react"));

function EditorFallback() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
      Loading editor…
    </div>
  );
}
import { adminEmails, type EmailTemplateRow } from "@/lib/adminEmails";
import { renderEmailTemplate } from "@/lib/renderEmailTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Draft {
  id?: string;
  slug: string;
  name: string;
  category: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: Array<{ key: string; required?: boolean; description?: string }>;
  sample_data: Record<string, unknown>;
}

function toDraft(row: EmailTemplateRow): Draft {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    subject: row.subject,
    html_body: row.html_body,
    text_body: row.text_body,
    variables: row.variables ?? [],
    sample_data: row.sample_data ?? {},
  };
}

export default function AdminEmailTemplateEdit() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-email-template", slug],
    queryFn: () => adminEmails.get(slug!),
    enabled: !!slug,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"html" | "text" | "vars">("html");

  useEffect(() => {
    if (data?.template) setDraft(toDraft(data.template));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Nothing to save");
      return adminEmails.upsert({
        slug: draft.slug,
        name: draft.name,
        category: draft.category,
        subject: draft.subject,
        html_body: draft.html_body,
        text_body: draft.text_body ?? undefined,
        variables: draft.variables,
        sample_data: draft.sample_data,
      });
    },
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ["admin-email-template", slug] });
      qc.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  if (isLoading || !draft) {
    return <div className="text-sm text-muted-foreground">Loading template…</div>;
  }
  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load template: {(error as Error).message}
      </div>
    );
  }

  const rendered = renderEmailTemplate(
    {
      subject: draft.subject,
      html_body: draft.html_body,
      text_body: draft.text_body,
      variables: draft.variables,
    },
    draft.sample_data ?? {},
  );

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {/* Back link — only shows on mobile where nav context is cramped */}
      <Link
        to="/admin/emails/templates"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to templates
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr] lg:h-[calc(100vh-14rem)]">
        {/* Left: editor */}
        <div className="space-y-3 lg:overflow-y-auto lg:pr-2 min-w-0">
          <div>
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div>
            <Label>Subject</Label>
            <Input
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            />
          </div>
          {/* Pill-style tab bar — matches the Templates/Campaigns/Contacts/Logs nav */}
          <div className="flex gap-1 rounded-xl bg-muted/30 p-1 overflow-x-auto scrollbar-none w-fit">
            {[
              { key: "html" as const, label: "HTML" },
              { key: "text" as const, label: "Plain text" },
              { key: "vars" as const, label: "Variables & sample" },
            ].map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab === "html" && (
            <div className="h-[45vh] sm:h-[50vh] lg:h-[60vh] rounded-lg border border-border overflow-hidden">
              <Suspense fallback={<EditorFallback />}>
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  value={draft.html_body}
                  onChange={(v) => setDraft({ ...draft, html_body: v ?? "" })}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                  }}
                />
              </Suspense>
            </div>
          )}

          {activeTab === "text" && (
            <div className="h-[45vh] sm:h-[50vh] lg:h-[60vh] rounded-lg border border-border overflow-hidden">
              <Suspense fallback={<EditorFallback />}>
                <Editor
                  height="100%"
                  defaultLanguage="plaintext"
                  value={draft.text_body ?? ""}
                  onChange={(v) => setDraft({ ...draft, text_body: v ?? null })}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    wordWrap: "on",
                    scrollBeyondLastLine: false,
                  }}
                />
              </Suspense>
            </div>
          )}

          {activeTab === "vars" && (
            <div className="space-y-3">
              <Label>Declared variables (JSON)</Label>
              <div className="h-[25vh] sm:h-[30vh] rounded-lg border border-border overflow-hidden">
                <Suspense fallback={<EditorFallback />}>
                  <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={JSON.stringify(draft.variables, null, 2)}
                    onChange={(v) => {
                      try {
                        const parsed = JSON.parse(v ?? "[]");
                        if (Array.isArray(parsed)) {
                          setDraft({ ...draft, variables: parsed });
                        }
                      } catch {
                        /* ignore until JSON is valid again */
                      }
                    }}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  />
                </Suspense>
              </div>

              <Label>Sample data (drives the live preview)</Label>
              <div className="h-[20vh] rounded-lg border border-border overflow-hidden">
                <Suspense fallback={<EditorFallback />}>
                  <Editor
                    height="100%"
                    defaultLanguage="json"
                    value={JSON.stringify(draft.sample_data ?? {}, null, 2)}
                    onChange={(v) => {
                      try {
                        const parsed = JSON.parse(v ?? "{}");
                        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                          setDraft({ ...draft, sample_data: parsed });
                        }
                      } catch {
                        /* ignore until JSON is valid again */
                      }
                    }}
                    theme="vs-dark"
                    options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* Desktop-only inline Save button */}
          <div className="hidden lg:flex items-center gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            {saveError && (
              <span className="text-xs text-destructive">{saveError}</span>
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="flex min-h-[50vh] lg:min-h-0 flex-col rounded border border-border bg-white">
          <div className="border-b border-border p-3 text-sm font-medium text-foreground">
            <span className="text-muted-foreground mr-1">Subject:</span>
            <span className="break-words">{rendered.subject}</span>
          </div>
          <iframe
            title="email preview"
            className="flex-1 bg-white min-h-[40vh] lg:min-h-0"
            srcDoc={rendered.html}
            sandbox=""
          />
        </div>
      </div>

      {/* Sticky Save bar — mobile only. Fixed bottom so the user never
          has to scroll back to the top to save. Desktop uses the inline
          button inside the editor column above. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur px-4 py-3 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="flex-1"
          >
            {save.isPending ? "Saving…" : "Save template"}
          </Button>
          {saveError && (
            <span className="text-[11px] text-destructive line-clamp-2 max-w-[40%]">
              {saveError}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
