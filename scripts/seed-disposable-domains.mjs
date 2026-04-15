/**
 * seed-disposable-domains.mjs
 *
 * Seeds public.disposable_email_domains from the upstream
 * disposable-email-domains open-source list. Idempotent — re-runnable.
 * Used by the check-signup-allowed edge function to block throwaway
 * emails during signup preflight (Phase 2 hardening).
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-disposable-domains.mjs
 *
 * Against prod:
 *   SUPABASE_URL=https://qexnwezetjlbwltyccks.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<prod service_role key> \
 *   node scripts/seed-disposable-domains.mjs
 *
 * Pass --dry-run to fetch and validate without writing.
 * Pass --source=<url> to override the upstream list.
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_SOURCE =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';

const DRY_RUN = process.argv.includes('--dry-run');
const sourceArg = process.argv.find((a) => a.startsWith('--source='));
const SOURCE = sourceArg ? sourceArg.slice('--source='.length) : DEFAULT_SOURCE;
const BATCH_SIZE = 500;

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    '❌  Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.',
  );
  process.exit(1);
}

function parseDomains(text) {
  const seen = new Set();
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase();
    if (!line || line.startsWith('#')) continue;
    // Defensive: only accept RFC-ish domain shapes. Guards against a malformed
    // upstream list ever injecting comment-wrapped garbage.
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(line)) {
      continue;
    }
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

async function main() {
  console.log(`→ Fetching disposable domain list from ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const domains = parseDomains(text);
  console.log(`→ Parsed ${domains.length} valid domains`);

  if (domains.length < 1000) {
    throw new Error(
      `Refusing to seed — only ${domains.length} domains parsed, expected > 1000. ` +
      `The upstream list may have changed format; investigate before re-running.`,
    );
  }

  if (DRY_RUN) {
    console.log('→ DRY RUN — no writes. Sample of first 5:');
    console.log(domains.slice(0, 5).join('\n'));
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  let upserted = 0;
  for (let i = 0; i < domains.length; i += BATCH_SIZE) {
    const slice = domains.slice(i, i + BATCH_SIZE).map((d) => ({
      domain: d,
      source: SOURCE,
    }));
    const { error } = await supabase
      .from('disposable_email_domains')
      .upsert(slice, { onConflict: 'domain', ignoreDuplicates: false });
    if (error) {
      throw new Error(`Upsert failed at batch ${i}: ${error.message}`);
    }
    upserted += slice.length;
    process.stdout.write(`\r→ Upserted ${upserted} / ${domains.length}`);
  }
  process.stdout.write('\n');

  const { count, error: countErr } = await supabase
    .from('disposable_email_domains')
    .select('*', { count: 'exact', head: true });
  if (countErr) {
    throw new Error(`Post-seed count failed: ${countErr.message}`);
  }
  console.log(`✅  Done. disposable_email_domains now has ${count} rows.`);
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
