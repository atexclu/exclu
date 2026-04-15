// supabase/functions/admin-email-templates/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  action: "list" | "get" | "upsert" | "versions" | "restore";
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
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user } } = await svc.auth.getUser(jwt);
  if (!user) throw new Error("unauthorized");
  const { data: profile } = await svc
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("forbidden");
  return { svc, user };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  try {
    const { svc, user } = await requireAdmin(req);
    const body: RequestBody = await req.json();

    switch (body.action) {
      case "list": {
        const { data, error } = await svc
          .from("email_templates")
          .select("id, slug, name, category, subject, is_active, updated_at")
          .order("category").order("slug");
        if (error) throw error;
        return json({ templates: data });
      }
      case "get": {
        const { data, error } = await svc
          .from("email_templates").select("*").eq("slug", body.slug!).single();
        if (error) throw error;
        return json({ template: data });
      }
      case "upsert": {
        const p = body.payload!;
        const { data, error } = await svc.from("email_templates").upsert({
          slug: p.slug,
          name: p.name,
          category: p.category ?? "transactional",
          subject: p.subject,
          html_body: p.html_body,
          text_body: p.text_body,
          variables: p.variables ?? [],
          sample_data: p.sample_data ?? {},
          updated_by: user.id,
        }, { onConflict: "slug" }).select().single();
        if (error) throw error;
        return json({ template: data });
      }
      case "versions": {
        const { data: tpl } = await svc
          .from("email_templates").select("id").eq("slug", body.slug!).single();
        const { data, error } = await svc
          .from("email_template_versions")
          .select("*").eq("template_id", tpl!.id)
          .order("created_at", { ascending: false }).limit(50);
        if (error) throw error;
        return json({ versions: data });
      }
      case "restore": {
        const { data: version, error: vErr } = await svc
          .from("email_template_versions").select("*").eq("id", body.version_id!).single();
        if (vErr) throw vErr;
        const { data, error } = await svc.from("email_templates").update({
          subject: version.subject,
          html_body: version.html_body,
          text_body: version.text_body,
          variables: version.variables,
          updated_by: user.id,
        }).eq("id", version.template_id).select().single();
        if (error) throw error;
        return json({ template: data });
      }
    }
    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
