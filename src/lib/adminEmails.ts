import { supabase } from "@/lib/supabaseClient";

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-email-templates`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    },
  );
  const json = await res.json().catch(() => ({ error: "invalid response" }));
  if (!res.ok) {
    throw new Error(json.error ?? `admin-email-templates ${action} failed (${res.status})`);
  }
  return json as T;
}

export interface EmailTemplateListRow {
  id: string;
  slug: string;
  name: string;
  category: "transactional" | "campaign" | "system";
  subject: string;
  is_active: boolean;
  updated_at: string;
}

export interface EmailTemplateRow extends EmailTemplateListRow {
  html_body: string;
  text_body: string | null;
  variables: Array<{ key: string; required?: boolean; description?: string }>;
  sample_data: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
}

export interface EmailTemplateVersion {
  id: string;
  template_id: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: unknown;
  edited_by: string | null;
  created_at: string;
}

export const adminEmails = {
  list: () => call<{ templates: EmailTemplateListRow[] }>("list"),
  get: (slug: string) => call<{ template: EmailTemplateRow }>("get", { slug }),
  upsert: (payload: Partial<EmailTemplateRow> & { slug: string; name: string; subject: string; html_body: string }) =>
    call<{ template: EmailTemplateRow }>("upsert", { payload }),
  versions: (slug: string) => call<{ versions: EmailTemplateVersion[] }>("versions", { slug }),
  restore: (version_id: string) => call<{ template: EmailTemplateRow }>("restore", { version_id }),
};
