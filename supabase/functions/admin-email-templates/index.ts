// supabase/functions/admin-email-templates/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { lintEmail } from "../_shared/email_lint.ts";

interface RequestBody {
  action: "list" | "get" | "upsert" | "versions" | "restore" | "lint";
  slug?: string;
  payload?: {
    slug: string;
    name: string;
    category?: string;
    subject: string;
    html_body: string;
    text_body?: string;
    variables?: unknown[];
    sample_data?: Record<string, unknown>;
  };
  version_id?: string;
  /** If true on upsert, warnings alone do not block the save. Default true — errors always block. */
  accept_warnings?: boolean;
}

/**
 * HTTP error that maps to a known client-visible status code.
 * Only 4xx values are valid — 5xx should always go through the outer catch
 * as unhandled exceptions so the error is logged and surfaced as a generic
 * `{error: "internal"}` 500 response.
 */
class HttpError extends Error {
  constructor(public status: 400 | 401 | 403 | 404, public detail?: string) {
    super(`HTTP ${status}`);
  }
}

function mapHttpErrorMessage(status: 400 | 401 | 403 | 404): string {
  switch (status) {
    case 400:
      return "bad request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not found";
  }
}

function json(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) throw new HttpError(401);

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: userErr } = await svc.auth.getUser(jwt);
  if (userErr || !user) throw new HttpError(401);

  const { data: profile, error: profErr } = await svc
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr) throw profErr; // surfaces as 500
  if (!profile?.is_admin) throw new HttpError(403);

  return { svc, user };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  const corsHeaders = getCorsHeaders(req);

  try {
    const { svc, user } = await requireAdmin(req);
    const body: RequestBody = await req.json().catch(() => {
      throw new HttpError(400, "invalid JSON body");
    });

    switch (body.action) {
      case "list": {
        const { data, error } = await svc
          .from("email_templates")
          .select("id, slug, name, category, subject, is_active, updated_at")
          .order("category")
          .order("slug");
        if (error) throw error;
        return json({ templates: data }, 200, corsHeaders);
      }
      case "get": {
        if (!body.slug) throw new HttpError(400, "slug is required");
        const { data, error } = await svc
          .from("email_templates")
          .select("*")
          .eq("slug", body.slug)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new HttpError(404);
        return json({ template: data }, 200, corsHeaders);
      }
      case "upsert": {
        if (!body.payload) throw new HttpError(400, "payload is required");
        const p = body.payload;
        if (!p.slug) throw new HttpError(400, "payload.slug is required");
        if (!p.name) throw new HttpError(400, "payload.name is required");
        if (!p.subject) throw new HttpError(400, "payload.subject is required");
        if (!p.html_body) throw new HttpError(400, "payload.html_body is required");

        // Lint pass. 'error' severity blocks the save; 'warning' + 'info'
        // are returned alongside the saved row so the UI can surface them.
        const lint = lintEmail({
          subject: p.subject,
          html: p.html_body,
          declaredVariables: (p.variables as Array<{ key: string }> | undefined) ?? [],
          category: p.category ?? "transactional",
        });
        if (lint.hasErrors) {
          return json(
            { error: "lint_failed", lint },
            422,
            corsHeaders,
          );
        }

        const { data, error } = await svc
          .from("email_templates")
          .upsert(
            {
              slug: p.slug,
              name: p.name,
              category: p.category ?? "transactional",
              subject: p.subject,
              html_body: p.html_body,
              text_body: p.text_body,
              variables: p.variables ?? [],
              sample_data: p.sample_data ?? {},
              updated_by: user.id,
            },
            { onConflict: "slug" },
          )
          .select()
          .single();
        if (error) throw error;
        return json({ template: data, lint }, 200, corsHeaders);
      }
      case "lint": {
        if (!body.payload) throw new HttpError(400, "payload is required");
        const p = body.payload;
        const result = lintEmail({
          subject: p.subject ?? "",
          html: p.html_body ?? "",
          declaredVariables: (p.variables as Array<{ key: string }> | undefined) ?? [],
          category: p.category ?? "transactional",
        });
        return json({ lint: result }, 200, corsHeaders);
      }
      case "versions": {
        if (!body.slug) throw new HttpError(400, "slug is required");
        const { data: tpl, error: tplErr } = await svc
          .from("email_templates")
          .select("id")
          .eq("slug", body.slug)
          .maybeSingle();
        if (tplErr) throw tplErr;
        if (!tpl) throw new HttpError(404);
        const { data, error } = await svc
          .from("email_template_versions")
          .select("*")
          .eq("template_id", tpl.id)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        return json({ versions: data }, 200, corsHeaders);
      }
      case "restore": {
        if (!body.version_id) throw new HttpError(400, "version_id is required");
        const { data: version, error: vErr } = await svc
          .from("email_template_versions")
          .select("*")
          .eq("id", body.version_id)
          .maybeSingle();
        if (vErr) throw vErr;
        if (!version) throw new HttpError(404);
        const { data, error } = await svc
          .from("email_templates")
          .update({
            subject: version.subject,
            html_body: version.html_body,
            text_body: version.text_body,
            variables: version.variables,
            updated_by: user.id,
          })
          .eq("id", version.template_id)
          .select()
          .single();
        if (error) throw error;
        return json({ template: data }, 200, corsHeaders);
      }
    }
    throw new HttpError(400, "unknown action");
  } catch (err) {
    if (err instanceof HttpError) {
      return json(
        { error: mapHttpErrorMessage(err.status), detail: err.detail },
        err.status,
        getCorsHeaders(req),
      );
    }
    console.error("[admin-email-templates] internal error:", err);
    return json({ error: "internal" }, 500, getCorsHeaders(req));
  }
});
