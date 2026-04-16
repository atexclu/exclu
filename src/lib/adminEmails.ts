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
    const msg = json.detail ? `${json.error}: ${json.detail}` : json.error;
    throw new Error(msg ?? `admin-email-templates ${action} failed (${res.status})`);
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

// ═══════════════════════════════════════════════════════════════════════
// Mailing contacts API (Phase 3 — Part B.1)
// ═══════════════════════════════════════════════════════════════════════

export interface MailingContactRow {
  email: string;
  display_name: string | null;
  role: "fan" | "creator" | "agency" | "chatter" | "unknown";
  first_seen_at: string;
  last_seen_at: string;
  first_source: string;
  last_source: string;
  marketing_opted_in: boolean;
  marketing_opted_out_at: string | null;
  user_id: string | null;
  has_account: boolean;
  account_email_confirmed_at: string | null;
  account_last_sign_in_at: string | null;
  profile_is_creator: boolean | null;
  profile_is_admin: boolean | null;
  profile_handle: string | null;
}

export interface ListContactsResult {
  rows: MailingContactRow[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    withAccount: number;
    emailOnly: number;
  };
}

export type AccountFilter = "all" | "with_account" | "email_only";
export type RoleFilter = "all" | "fan" | "creator" | "agency" | "chatter" | "unknown";

export interface ListContactsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  accountFilter?: AccountFilter;
  roleFilter?: RoleFilter;
  marketingOnly?: boolean;
}

async function callContacts<T>(body: Record<string, unknown>): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-mailing-contacts`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ error: "invalid response" }));
    throw new Error(errJson.error ?? `admin-list-mailing-contacts failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Trigger a CSV download via the admin-list-mailing-contacts edge fn.
 * Uses a direct fetch because we need to treat the response as a Blob,
 * not JSON — callContacts hard-codes JSON parsing.
 */
async function downloadContactsCsv(params: ListContactsParams): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-mailing-contacts`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "csv", ...params }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "invalid response" }));
    throw new Error(err.error ?? `CSV export failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mailing_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const adminContacts = {
  list: (params: ListContactsParams = {}) =>
    callContacts<ListContactsResult>({ action: "list", ...params }),
  exportCsv: (params: ListContactsParams = {}) => downloadContactsCsv(params),
};
