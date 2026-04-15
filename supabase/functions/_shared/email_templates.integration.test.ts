// supabase/functions/_shared/email_templates.integration.test.ts
//
// Integration test: validates the 8 seeded email templates load from the
// local DB via loadTemplate() and render cleanly with their sample_data.
//
// Requires: local Supabase stack running with migrations 132 (seed) and
// 133 (chatter restore) applied.
//
// These are read from the local Supabase stack — not hardcoded, because the
// service role key regenerates per `supabase start` and is not portable.
// Export before running: eval "$(supabase status -o env)"
// Or manually:         export SUPABASE_URL=http://127.0.0.1:54321 \
//                             SUPABASE_SERVICE_ROLE_KEY=<from supabase status>

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadTemplate, renderTemplate } from "./email_templates.ts";

const LOCAL_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!LOCAL_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required to run the integration test.\n" +
      "Run: eval \"$(supabase status -o env)\" then rerun `deno test`.",
  );
}

const EXPECTED_SLUGS = [
  "auth_signup",
  "auth_recovery",
  "auth_magiclink",
  "auth_email_change",
  "link_content_delivery",
  "chatter_invitation",
  "referral_invite",
  "agency_contact",
] as const;

const supabase = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: {
    // Disable GoTrue internals we don't need — avoids background timers
    // that trip Deno's leak detector during `deno test`.
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// The supabase-js client still registers internal ops / resources that
// Deno's strict sanitizers flag as leaks. Disable the sanitizers for
// these tests since we're only exercising REST calls against a local DB.
const testOpts = {
  sanitizeOps: false,
  sanitizeResources: false,
};

Deno.test("integration: all 8 seeded templates exist", testOpts, async () => {
  const { data, error } = await supabase
    .from("email_templates")
    .select("slug")
    .order("slug");
  assert(!error, `query failed: ${error?.message}`);
  const slugs = (data ?? []).map((r: { slug: string }) => r.slug).sort();
  assertEquals(slugs, [...EXPECTED_SLUGS].sort());
});

for (const slug of EXPECTED_SLUGS) {
  Deno.test(`integration: ${slug} renders cleanly with its sample_data`, testOpts, async () => {
    const template = await loadTemplate(supabase, slug);
    assert(template.subject.length > 0, `${slug}: empty subject`);
    assert(template.html_body.length > 0, `${slug}: empty html_body`);

    // Fetch the sample_data for this template
    const { data, error } = await supabase
      .from("email_templates")
      .select("sample_data, variables")
      .eq("slug", slug)
      .single();
    assert(!error && data, `${slug}: sample_data fetch failed`);

    const sampleData = data.sample_data as Record<string, unknown>;
    const declared =
      (data.variables as Array<{ key: string; required?: boolean }>) ?? [];

    // Every required variable must be present in sample_data
    for (const v of declared) {
      if (v.required) {
        assert(
          sampleData[v.key] !== undefined && sampleData[v.key] !== null,
          `${slug}: required variable "${v.key}" missing from sample_data`,
        );
      }
    }

    // Render with the sample_data
    const rendered = renderTemplate(
      {
        slug: template.slug,
        subject: template.subject,
        html_body: template.html_body,
        text_body: template.text_body,
        variables: template.variables,
      },
      sampleData,
    );

    assert(rendered.subject.length > 0, `${slug}: rendered subject is empty`);
    assert(rendered.html.length > 0, `${slug}: rendered html is empty`);

    // No unresolved {{placeholder}} or {{{placeholder}}} may survive in the
    // rendered output. The optional inner/outer brace covers triple-brace
    // Mustache-unsafe interpolations leaking through renderer bugs.
    const combined = rendered.subject + rendered.html + rendered.text;
    const stillHasPlaceholders = /\{\{\{?\s*[a-zA-Z0-9_]+\s*\}?\}\}/.test(
      combined,
    );
    // Collect the keys that actually survived, for a helpful error message
    const surviving: string[] = [];
    if (stillHasPlaceholders) {
      const re = /\{\{\{?\s*([a-zA-Z0-9_]+)\s*\}?\}\}/g;
      for (const m of combined.matchAll(re)) {
        surviving.push(m[1]);
      }
    }
    assert(
      !stillHasPlaceholders,
      `${slug}: unresolved placeholders survived: ${surviving.join(", ")}`,
    );
  });
}
