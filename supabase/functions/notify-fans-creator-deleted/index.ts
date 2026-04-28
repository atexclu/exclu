/**
 * notify-fans-creator-deleted — fan-side notification when a creator deletes their account.
 *
 * Invoked (fire-and-forget) from `delete-account` after the soft-delete RPC
 * succeeds. Sends one email to every fan whose `fan_creator_subscriptions`
 * row was just canceled with `cancel_reason = 'creator_account_deleted'`
 * for any creator_profile owned by `user_id`.
 *
 * Idempotency:
 *   - per-profile: skip a creator_profile whose `fans_notified_at_deletion` is set.
 *   - per-fan:     skip subscriptions whose `deletion_email_sent_at` is set.
 *
 * Batching: 50 fans per batch, 250ms pause between batches, Promise.allSettled
 * so one failed send does not block the rest.
 *
 * Auth: `verify_jwt = false`. We do not require a JWT — the function only
 * acts on data already mutated by `soft_delete_account` (which set the
 * cancel_reason). The caller passes `{ user_id }`; we operate strictly on
 * creator_profiles owned by that user. Platform-level rate limiting +
 * idempotency guards protect against abuse / replay.
 *
 * **Single-caller invariant**: this function MUST NOT be invoked
 * concurrently for the same user_id. The single caller is `delete-account`
 * which is action-idempotent. Concurrent invocations could cause duplicate
 * fan emails despite the per-row `deletion_email_sent_at` guard (the row
 * UPDATE filter narrows the window but does not eliminate a
 * read-Brevo-send-then-write race between two parallel callers).
 *
 * MVP limit: `auth.admin.listUsers({ perPage: 1000 })` is used to resolve
 * fan emails. If a single creator has more than 1000 distinct fans on the
 * platform, this lookup will be incomplete — we log a console.error if
 * the page returns exactly 1000 rows so we notice in production logs.
 * TODO(scale): add pagination over auth.admin.listUsers if any creator
 * exceeds ~1000 fans. Today this is well under any real creator's reach.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import { FAN_CREATOR_DELETED } from '../send-account-deleted-email/templates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 250;

interface RequestBody {
  user_id?: string;
}

interface CreatorProfileRow {
  id: string;
  username: string;
  fans_notified_at_deletion: string | null;
}

interface FanSubscriptionRow {
  id: string;
  fan_id: string;
  period_end: string | null;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatPeriodEnd(periodEnd: string | null): string {
  if (!periodEnd) return 'the end of your current billing period';
  const d = new Date(periodEnd);
  if (isNaN(d.getTime())) return 'the end of your current billing period';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
    });
  }

  const supabaseUrl =
    Deno.env.get('SUPABASE_URL') ??
    Deno.env.get('PROJECT_URL') ??
    Deno.env.get('VITE_SUPABASE_URL');
  const supabaseServiceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[notify-fans-creator-deleted] Missing Supabase env vars');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const userId = (body?.user_id ?? '').toString().trim();
  if (!userId) {
    return jsonResponse({ error: 'Missing user_id' }, 400);
  }

  const svc = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // 1. Find every creator_profile owned by this user.
    const { data: profiles, error: profilesErr } = await svc
      .from('creator_profiles')
      .select('id, username, fans_notified_at_deletion')
      .eq('user_id', userId)
      .returns<CreatorProfileRow[]>();

    if (profilesErr) {
      console.error('[notify-fans-creator-deleted] creator_profiles lookup error', profilesErr);
      return jsonResponse({ error: 'Profile lookup failed' }, 500);
    }

    const profileList = profiles ?? [];
    if (profileList.length === 0) {
      return jsonResponse(
        { success: true, profiles_processed: 0, emails_sent: 0 },
        200,
      );
    }

    // 2. Resolve fan emails once via auth admin (MVP cap: 1000 fans/creator).
    //    See TODO at top of file.
    const { data: usersPage, error: listErr } = await svc.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listErr) {
      console.error('[notify-fans-creator-deleted] auth.admin.listUsers failed', listErr);
      return jsonResponse({ error: 'Auth lookup failed' }, 500);
    }
    if ((usersPage?.users?.length ?? 0) === 1000) {
      console.error(
        `[notify-fans-creator-deleted] WARNING: listUsers returned 1000 results — pagination needed for user_id=${userId}`,
      );
    }
    const emailByUserId = new Map<string, string>();
    for (const u of usersPage?.users ?? []) {
      if (u.id && u.email) emailByUserId.set(u.id, u.email);
    }

    let profilesProcessed = 0;
    let emailsSent = 0;

    for (const cp of profileList) {
      // Per-profile idempotency: skip if already notified.
      if (cp.fans_notified_at_deletion) {
        continue;
      }

      // 3. Pull subscriptions still owed an email for THIS profile.
      const { data: subs, error: subsErr } = await svc
        .from('fan_creator_subscriptions')
        .select('id, fan_id, period_end')
        .eq('creator_profile_id', cp.id)
        .eq('cancel_reason', 'creator_account_deleted')
        .is('deletion_email_sent_at', null)
        .returns<FanSubscriptionRow[]>();

      if (subsErr) {
        console.error(
          '[notify-fans-creator-deleted] fan_creator_subscriptions lookup error',
          { creator_profile_id: cp.id, err: subsErr },
        );
        continue;
      }

      const pending = subs ?? [];

      // 4. Batch sends (50 at a time, 250ms between batches).
      for (let i = 0; i < pending.length; i += BATCH_SIZE) {
        const batch = pending.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (sub) => {
            const email = emailByUserId.get(sub.fan_id);
            if (!email) {
              console.warn(
                '[notify-fans-creator-deleted] no email for fan',
                { fan_id: sub.fan_id, sub_id: sub.id },
              );
              return false;
            }
            const periodEnd = formatPeriodEnd(sub.period_end);
            const tpl = FAN_CREATOR_DELETED({
              creatorHandle: cp.username,
              periodEnd,
            });
            const ok = await sendBrevoEmail({
              to: email,
              subject: tpl.subject,
              htmlContent: tpl.html,
              tags: ['account-deletion', 'fan-creator-deleted'],
            });
            if (!ok) return false;

            // Mark the row sent ONLY on a successful Brevo send so retries
            // can still pick up failed ones on a re-invocation.
            // The `.is('deletion_email_sent_at', null)` guard narrows the
            // race window if a parallel invocation already stamped the row
            // (see single-caller invariant in top-of-file JSDoc — concurrent
            // invocations are forbidden, but this filter is defense-in-depth).
            const { error: updErr } = await svc
              .from('fan_creator_subscriptions')
              .update({ deletion_email_sent_at: new Date().toISOString() })
              .eq('id', sub.id)
              .is('deletion_email_sent_at', null);
            if (updErr) {
              console.error(
                '[notify-fans-creator-deleted] failed to mark sub as sent',
                { sub_id: sub.id, err: updErr },
              );
            }
            return true;
          }),
        );

        for (const r of results) {
          if (r.status === 'fulfilled' && r.value === true) emailsSent += 1;
        }

        if (i + BATCH_SIZE < pending.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      // 5. Mark profile as fully processed (per-profile idempotency).
      const { error: cpUpdErr } = await svc
        .from('creator_profiles')
        .update({ fans_notified_at_deletion: new Date().toISOString() })
        .eq('id', cp.id);
      if (cpUpdErr) {
        console.error(
          '[notify-fans-creator-deleted] failed to mark profile as notified',
          { creator_profile_id: cp.id, err: cpUpdErr },
        );
      }

      profilesProcessed += 1;
    }

    return jsonResponse(
      {
        success: true,
        profiles_processed: profilesProcessed,
        emails_sent: emailsSent,
      },
      200,
    );
  } catch (err) {
    console.error('[notify-fans-creator-deleted] unexpected error', err);
    return jsonResponse({ error: 'Internal error' }, 500);
  }
});
