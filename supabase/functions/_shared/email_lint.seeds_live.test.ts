// Live regression: parse migration 132 (subjects + declared variables)
// and migration 140 (rewritten html_body for each of the 8 seeds), run
// the linter on the ACTUAL production HTML, and assert no hard errors.
//
// This test is the last line of defense before we ship a linter that
// might reject templates a real admin already saved. It hits the file
// system directly — no mocks — so it catches regressions that a crafted
// small test would miss.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lintEmail } from "./email_lint.ts";

const ROOT = new URL("../../migrations/", import.meta.url);

/**
 * Parse `insert into public.email_templates ... values (...)` tuples out
 * of migration 132 to recover {slug, subject, variables} for each seed.
 * Intentionally tolerant — we only need the fields the linter cares about.
 */
async function loadSeedsFromMigration132(): Promise<
  Array<{ slug: string; subject: string; variables: Array<{ key: string }>; category: string }>
> {
  const sql = await Deno.readTextFile(new URL("132_seed_email_templates.sql", ROOT));
  const out: Array<{ slug: string; subject: string; variables: Array<{ key: string }>; category: string }> = [];

  // Match each tuple like:
  //   (
  //     'auth_signup',
  //     'Auth — Signup confirmation',
  //     'transactional',
  //     'Confirm your Exclu account',
  //     $html$...$html$,
  //     '[{"key":"confirmation_url","required":true}, ...]'::jsonb,
  //     '{...}'::jsonb
  //   )
  const tupleRe =
    /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\$html\$[\s\S]*?\$html\$\s*,\s*'(\[[\s\S]*?\])'::jsonb/g;
  for (const m of sql.matchAll(tupleRe)) {
    const slug = m[1];
    const category = m[3];
    const subject = m[4].replace(/''/g, "'");
    let variables: Array<{ key: string }> = [];
    try {
      variables = JSON.parse(m[5]);
    } catch {
      variables = [];
    }
    out.push({ slug, subject, variables, category });
  }
  return out;
}

/**
 * Pull the rewritten html_body for a slug out of migration 140. It
 * wraps each body in a `body := $tpl$...$tpl$` PL/pgSQL declaration
 * followed by `update public.email_templates set html_body = replace(...)`.
 * We grab the final replaced string by re-running a cheap substitution.
 *
 * 140's structure is:
 *    shell := $tpl$<!DOCTYPE ...>%%TITLE%% ... %%BODY%%... $tpl$;
 *    body_<slug> := $tpl$ <body fragment> $tpl$;
 *    update ... set html_body = replace(replace(shell, '%%TITLE%%', 'Welcome to Exclu'), '%%BODY%%', body_auth_signup)
 *    where slug = 'auth_signup';
 *
 * We don't need the exact rendering — we only need something close
 * enough to feed to the linter.
 */
async function loadBodiesFromMigration140(): Promise<Record<string, string>> {
  const sql = await Deno.readTextFile(
    new URL("140_transactional_templates_newsletter_style.sql", ROOT),
  );
  const out: Record<string, string> = {};

  const shellMatch = sql.match(/shell\s+text\s*:=\s*\$tpl\$([\s\S]*?)\$tpl\$;/);
  const shell = shellMatch?.[1] ?? "";

  // Body fragments use $b$ delimiters and are named body_<short> (e.g.
  // body_signup, body_link) — not the slug itself. We capture the raw
  // fragment first, then map via the update statements below.
  const bodyFragments: Record<string, string> = {};
  const bodyRe = /body_([a-z_]+)\s+text\s*:=\s*\$b\$([\s\S]*?)\$b\$;/g;
  for (const m of sql.matchAll(bodyRe)) {
    bodyFragments[m[1]] = m[2];
  }

  // Each `update ... where slug = 'X'` block names a body_<short>. Parse
  // the mapping so our output is keyed by the real slug admins see.
  const updateRe =
    /replace\(\s*replace\(\s*shell\s*,\s*'%%TITLE%%'\s*,\s*'([^']+)'\s*\)\s*,\s*'%%BODY%%'\s*,\s*body_([a-z_]+)\s*\)[\s\S]*?where\s+slug\s*=\s*'([^']+)'/g;
  for (const m of sql.matchAll(updateRe)) {
    const title = m[1];
    const shortName = m[2];
    const slug = m[3];
    const body = bodyFragments[shortName];
    if (!body) continue;
    out[slug] = shell.replace(/%%TITLE%%/g, title).replace(/%%BODY%%/g, body);
  }
  return out;
}

/**
 * Apply the `update ... set html_body = replace(html_body, 'A', 'B') where slug = 'X'`
 * corrective statements from migration 146 onto the bodies we already
 * parsed out of migration 140. This keeps the test in sync with the
 * actual production state after all migrations have run, without
 * hard-coding the 3 renames here.
 */
async function applyCorrectiveMigration146(
  bodies: Record<string, string>,
): Promise<Record<string, string>> {
  let sql: string;
  try {
    sql = await Deno.readTextFile(new URL("146_fix_seed_variable_names.sql", ROOT));
  } catch {
    return bodies; // migration not present — nothing to patch
  }
  const out = { ...bodies };
  // Match: update ... replace(html_body, '{{old}}', '{{new}}') ... where slug = 'X'
  const re =
    /replace\(\s*html_body\s*,\s*'(\{\{[^']+\}\})'\s*,\s*'(\{\{[^']+\}\})'\s*\)[\s\S]*?where\s+slug\s*=\s*'([a-z_]+)'/g;
  for (const m of sql.matchAll(re)) {
    const from = m[1];
    const to = m[2];
    const slug = m[3];
    if (!out[slug]) continue;
    out[slug] = out[slug].split(from).join(to);
  }
  return out;
}

const seeds = await loadSeedsFromMigration132();
const rawBodies = await loadBodiesFromMigration140();
const bodies = await applyCorrectiveMigration146(rawBodies);

if (seeds.length === 0) {
  Deno.test("migration 132 parsed at least one template", () => {
    throw new Error("No seeds parsed from migration 132 — parser regex may need updating");
  });
}

for (const seed of seeds) {
  const html = bodies[seed.slug];
  Deno.test(`production seed "${seed.slug}" passes the linter`, () => {
    if (!html) {
      throw new Error(`No body for "${seed.slug}" found in migration 140`);
    }
    const result = lintEmail({
      subject: seed.subject,
      html,
      declaredVariables: seed.variables,
      category: seed.category,
    });
    if (result.hasErrors) {
      console.error(
        `[lint regression] "${seed.slug}" would be blocked at save:`,
        result.issues.filter((i) => i.severity === "error"),
      );
    }
    assertEquals(result.hasErrors, false, `seed ${seed.slug} has lint errors`);
  });
}

// Sanity check that the corrective migration actually ran on every
// slug it targets — guards against someone adding a new rename to
// migration 146 without updating the parser.
Deno.test("migration 146 renames leave no stale placeholders", () => {
  const stale: string[] = [];
  for (const seed of seeds) {
    const html = bodies[seed.slug] ?? "";
    for (const old of ["{{magic_url}}", "{{confirmation_url}}", "{{inviter_name}}"]) {
      if (seed.slug === "auth_signup" && old === "{{confirmation_url}}") continue; // legitimate use
      if (html.includes(old)) stale.push(`${seed.slug}: ${old}`);
    }
  }
  assertEquals(stale, []);
});
