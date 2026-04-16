/**
 * admin-list-mailing-contacts
 *
 * Phase 3 (Part B.1) — admin-only listing of the mailing contacts
 * registry with a clear distinction between:
 *   - contacts WITH an auth account (has_account=true) — real users who
 *     signed up via /auth or /fan/signup
 *   - contacts WITHOUT an account (has_account=false) — fans who only
 *     left their email during a link purchase, tip, gift, or custom
 *     request (no signup yet)
 *
 * Backed by the `public.mailing_contacts_with_account` view which joins
 * `mailing_contacts` to `auth.users` + `profiles`.
 *
 * Actions:
 *   - list: paginated rows + total count + facet counts
 *   - csv: full CSV export (admin only, one-shot fetch)
 *
 * All shapes use typed enums. Errors return specific HTTP codes
 *   401 missing/invalid token, 403 non-admin, 400 bad input, 500 DB.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonError, jsonOk } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
const supabaseServiceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const supabaseAnonKey =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY")!;

const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function verifyAdmin(token: string): Promise<boolean> {
  if (!token) return false;
  const authed = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user } } = await authed.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return profile?.is_admin === true;
}

type AccountFilter = "all" | "with_account" | "email_only";
type RoleFilter = "all" | "fan" | "creator" | "agency" | "chatter" | "unknown";

interface ListBody {
  action: "list";
  page?: number;
  pageSize?: number;
  search?: string;
  accountFilter?: AccountFilter;
  roleFilter?: RoleFilter;
  marketingOnly?: boolean;
}

interface CsvBody {
  action: "csv";
  search?: string;
  accountFilter?: AccountFilter;
  roleFilter?: RoleFilter;
  marketingOnly?: boolean;
}

type RequestBody = ListBody | CsvBody;

function coercePage(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function coercePageSize(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(10, Math.min(200, Math.floor(n)));
}

type ContactRow = {
  email: string;
  display_name: string | null;
  role: string;
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
};

// deno-lint-ignore no-explicit-any
function applyFilters(query: any, body: ListBody | CsvBody): any {
  let q = query;
  if (body.search && body.search.trim().length > 0) {
    q = q.ilike("email", `%${body.search.trim().toLowerCase()}%`);
  }
  if (body.accountFilter === "with_account") {
    q = q.eq("has_account", true);
  } else if (body.accountFilter === "email_only") {
    q = q.eq("has_account", false);
  }
  if (body.roleFilter && body.roleFilter !== "all") {
    q = q.eq("role", body.roleFilter);
  }
  if (body.marketingOnly === true) {
    q = q.eq("marketing_opted_in", true);
  }
  return q;
}

async function handleList(
  body: ListBody,
  cors: Record<string, string>,
): Promise<Response> {
  const page = coercePage(body.page);
  const pageSize = coercePageSize(body.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Main page query (count + rows in one trip via count:'exact')
  let q = admin
    .from("mailing_contacts_with_account")
    .select("*", { count: "exact" })
    .order("last_seen_at", { ascending: false })
    .range(from, to);
  q = applyFilters(q, body);

  const { data: rows, count, error } = await q;
  if (error) {
    console.error("[admin-list-mailing-contacts] list query failed", error);
    return jsonError("internal", 500, cors);
  }

  // Facets — lightweight separate count queries so the UI can show
  // "X with account / Y email-only" even after filtering by search.
  // We run them with the SAME search filter but ignore the accountFilter
  // so the counts remain informative for the user toggling between modes.
  const facetBase = { ...body, accountFilter: "all" as AccountFilter };

  const [withAccount, emailOnly] = await Promise.all([
    applyFilters(
      admin
        .from("mailing_contacts_with_account")
        .select("email", { count: "exact", head: true })
        .eq("has_account", true),
      facetBase,
    ),
    applyFilters(
      admin
        .from("mailing_contacts_with_account")
        .select("email", { count: "exact", head: true })
        .eq("has_account", false),
      facetBase,
    ),
  ]);

  return jsonOk(
    {
      rows: (rows ?? []) as ContactRow[],
      total: count ?? 0,
      page,
      pageSize,
      facets: {
        withAccount: withAccount.count ?? 0,
        emailOnly: emailOnly.count ?? 0,
      },
    },
    cors,
  );
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function handleCsv(
  body: CsvBody,
  cors: Record<string, string>,
): Promise<Response> {
  // Fetch in pages to avoid OOM on large exports. 1000 rows per page.
  const PAGE = 1000;
  const rows: ContactRow[] = [];
  let from = 0;
  while (true) {
    let q = admin
      .from("mailing_contacts_with_account")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .range(from, from + PAGE - 1);
    q = applyFilters(q, body);
    const { data, error } = await q;
    if (error) {
      console.error("[admin-list-mailing-contacts] csv query failed", error);
      return jsonError("internal", 500, cors);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as ContactRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
    // Safety cap: never export more than 100k contacts in a single call.
    if (rows.length >= 100_000) break;
  }

  const header = [
    "email",
    "display_name",
    "role",
    "has_account",
    "profile_handle",
    "first_source",
    "last_source",
    "first_seen_at",
    "last_seen_at",
    "marketing_opted_in",
    "marketing_opted_out_at",
    "account_email_confirmed_at",
    "account_last_sign_in_at",
  ];

  const lines: string[] = [header.join(",")];
  for (const r of rows) {
    lines.push([
      csvEscape(r.email),
      csvEscape(r.display_name),
      csvEscape(r.role),
      csvEscape(r.has_account),
      csvEscape(r.profile_handle),
      csvEscape(r.first_source),
      csvEscape(r.last_source),
      csvEscape(r.first_seen_at),
      csvEscape(r.last_seen_at),
      csvEscape(r.marketing_opted_in),
      csvEscape(r.marketing_opted_out_at),
      csvEscape(r.account_email_confirmed_at),
      csvEscape(r.account_last_sign_in_at),
    ].join(","));
  }

  const csv = lines.join("\n");
  const filename = `mailing_contacts_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      ...cors,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonError("method_not_allowed", 405, cors);
  }

  // Accept the token via either header for compatibility with existing
  // admin edge functions in the repo (admin-email-templates uses
  // `authorization`, admin-blog-manage uses `x-supabase-auth`).
  const token = (
    req.headers.get("authorization") ?? req.headers.get("x-supabase-auth") ?? ""
  )
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) return jsonError("unauthorized", 401, cors);
  if (!(await verifyAdmin(token))) return jsonError("forbidden", 403, cors);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError("invalid_body", 400, cors);
  }

  if (body.action === "list") {
    return handleList(body, cors);
  }
  if (body.action === "csv") {
    return handleCsv(body, cors);
  }
  return jsonError("unknown_action", 400, cors);
});
