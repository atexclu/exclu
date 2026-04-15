import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { adminEmails, type EmailTemplateRow } from "@/lib/adminEmails";
import { renderEmailTemplate } from "@/lib/renderEmailTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr] lg:h-[calc(100vh-14rem)]">
      {/* Left: editor */}
      <div className="space-y-3 overflow-y-auto pr-2">
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
        <Tabs defaultValue="html">
          <TabsList>
            <TabsTrigger value="html">HTML</TabsTrigger>
            <TabsTrigger value="text">Plain text</TabsTrigger>
            <TabsTrigger value="vars">Variables & sample</TabsTrigger>
          </TabsList>

          <TabsContent value="html">
            <div className="h-[60vh] rounded border border-border overflow-hidden">
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
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="text">
            <div className="h-[60vh] rounded border border-border overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="plaintext"
                value={draft.text_body ?? ""}
                onChange={(v) =>
                  setDraft({ ...draft, text_body: v ?? null })
                }
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on" }}
              />
            </div>
          </TabsContent>

          <TabsContent value="vars" className="space-y-3">
            <Label>Declared variables (JSON)</Label>
            <div className="h-[30vh] rounded border border-border overflow-hidden">
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
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>

            <Label>Sample data (drives the live preview)</Label>
            <div className="h-[20vh] rounded border border-border overflow-hidden">
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
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          {saveError && (
            <span className="text-xs text-destructive">{saveError}</span>
          )}
        </div>
      </div>

      {/* Right: preview */}
      <div className="flex min-h-[60vh] flex-col rounded border border-border bg-white">
        <div className="border-b border-border p-3 text-sm font-medium text-foreground">
          <span className="text-muted-foreground mr-1">Subject:</span>
          {rendered.subject}
        </div>
        <iframe
          title="email preview"
          className="flex-1 bg-white"
          srcDoc={rendered.html}
          sandbox=""
        />
      </div>
    </div>
  );
}
