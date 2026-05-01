-- 183_pending_balance_and_payout_proof.sql
--
-- Pending balance (rolling 7-day maturity, 21-day initial hold for new creators)
-- + payout proof system (admin uploads a justificatif, creator can download it).
--
-- Touches:
--   1. wallet_transactions  → adds `available_at` (maturity timestamp on credits)
--   2. profiles             → adds `pending_balance_cents` (parallel projection)
--   3. payouts              → adds `paid_at`, `proof_path`, `admin_message`
--   4. platform_settings    → new key/value table for admin-tweakable globals
--   5. apply_wallet_transaction (RPC, replaced) — routes credits to the right
--      bucket (pending vs current) and decrements from the correct bucket on
--      refunds/chargebacks based on the parent's maturity state.
--   6. mature_wallet_transactions (RPC, new) — moves matured pending funds to
--      the current balance. Called daily by the Vercel cron at 08:30 UTC.
--   7. storage.buckets / storage.objects RLS — private `payout-proofs` bucket.
--
-- Backfill is engineered so production balances DO NOT move on deploy:
--   - existing `wallet_transactions.available_at` is set to `created_at`
--     (= already mature) for every credit row, so the maturation cron has
--     nothing to sweep on first run for legacy data.
--   - `pending_balance_cents` starts at 0 for every profile, matching the
--     fact that every existing credit is treated as already mature.

-- ============================================================
-- 1. wallet_transactions.available_at
-- ============================================================

alter table wallet_transactions
  add column if not exists available_at timestamptz;

-- Backfill: every existing credit is treated as already mature so
-- `wallet_balance_cents` stays exactly where it is. Debits keep NULL.
update wallet_transactions
   set available_at = created_at
 where direction = 'credit'
   and available_at is null;

-- The maturation cron iterates rows whose available_at falls within a
-- (frontier, now()] window. Partial index keeps that scan cheap.
create index if not exists wallet_tx_available_at_idx
  on wallet_transactions (available_at)
  where available_at is not null;

comment on column wallet_transactions.available_at is
  'For credit rows: timestamp at which the funds become withdrawable (rolling 7d, or 21d for new accounts). NULL for debits — they instantly affect the bucket the parent currently sits in.';

-- ============================================================
-- 2. profiles.pending_balance_cents
-- ============================================================

alter table profiles
  add column if not exists pending_balance_cents bigint not null default 0;

create index if not exists idx_profiles_pending_positive
  on profiles (pending_balance_cents)
  where pending_balance_cents > 0;

comment on column profiles.pending_balance_cents is
  'Sum of credits not yet matured (available_at > now()). Parallel projection to wallet_balance_cents, also maintained by apply_wallet_transaction. Sum across both = sum of credits − sum of debits in the ledger.';

-- ============================================================
-- 3. payouts: paid_at, proof_path, admin_message
-- ============================================================

alter table payouts
  add column if not exists paid_at date,
  add column if not exists proof_path text,
  add column if not exists admin_message text;

comment on column payouts.paid_at is
  'Date the admin actually wired the funds. Distinct from processed_at (UI confirmation timestamp). Optional.';
comment on column payouts.proof_path is
  'Storage path inside the payout-proofs bucket (e.g. <creator_id>/<payout_id>.pdf). Optional.';
comment on column payouts.admin_message is
  'Free-text message from admin to creator, shown in the withdrawal history. Optional.';

-- ============================================================
-- 4. platform_settings
-- ============================================================

create table if not exists platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table platform_settings enable row level security;

-- Anyone authenticated can read platform settings (creators need
-- next_payout_date for the dashboard banner). Writes only via the admin
-- edge function (service role bypasses RLS).
drop policy if exists platform_settings_read on platform_settings;
create policy platform_settings_read
  on platform_settings for select
  to authenticated
  using (true);

comment on table platform_settings is
  'Global key/value config managed by admins. Writes go through the update-platform-setting edge function (service role).';

-- Seed the next-payout-date row so the UI never sees NULL on first render.
insert into platform_settings (key, value)
values ('next_payout_date', jsonb_build_object('date', null))
on conflict (key) do nothing;

-- Frontier marker for the maturation cron. Stores the highest available_at
-- already swept; the next run only considers rows with available_at > frontier.
insert into platform_settings (key, value)
values ('maturity_frontier_at', jsonb_build_object('ts', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
on conflict (key) do nothing;

-- ============================================================
-- 5. apply_wallet_transaction (replaced)
-- ============================================================

create or replace function apply_wallet_transaction(
  p_owner_id uuid,
  p_owner_kind wallet_owner_kind,
  p_direction wallet_tx_direction,
  p_amount_cents bigint,
  p_source_type wallet_tx_source,
  p_source_id uuid,
  p_source_transaction_id text default null,
  p_source_ugp_mid text default null,
  p_parent_id uuid default null,
  p_metadata jsonb default null,
  p_admin_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_signed_amount bigint;
  v_now timestamptz := now();
  v_account_created_at timestamptz;
  v_available_at timestamptz;
  v_parent_available timestamptz;
  v_parent_is_pending boolean;
begin
  if p_owner_id is null or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'apply_wallet_transaction: bad args';
  end if;
  if p_source_type = 'manual_adjustment' and (p_admin_notes is null or length(p_admin_notes) < 3) then
    raise exception 'manual_adjustment requires admin_notes';
  end if;

  -- Idempotency short-circuit (unchanged from the previous implementation).
  select id into v_id
    from wallet_transactions
   where owner_id = p_owner_id
     and source_type = p_source_type
     and direction = p_direction
     and coalesce(source_transaction_id, source_id::text) = coalesce(p_source_transaction_id, p_source_id::text)
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- Compute available_at on credits. Chatters earn instantly (no holding).
  if p_direction = 'credit' and p_owner_kind = 'creator' then
    select created_at into v_account_created_at
      from auth.users
     where id = p_owner_id;

    if v_account_created_at is not null
       and v_account_created_at + interval '21 days' > v_now then
      -- Inside the new-creator hold window — every credit unlocks together
      -- on day 21.
      v_available_at := v_account_created_at + interval '21 days';
    else
      -- Standard rolling window.
      v_available_at := v_now + interval '7 days';
    end if;
  elsif p_direction = 'credit' and p_owner_kind = 'chatter' then
    -- No hold for chatters: mark as already mature.
    v_available_at := v_now;
  else
    -- Debits leave available_at NULL (they don't represent a maturable claim).
    v_available_at := null;
  end if;

  insert into wallet_transactions (
    owner_id, owner_kind, direction, amount_cents, source_type, source_id,
    source_transaction_id, source_ugp_mid, parent_id, metadata, admin_notes,
    available_at
  ) values (
    p_owner_id, p_owner_kind, p_direction, p_amount_cents, p_source_type, p_source_id,
    p_source_transaction_id, p_source_ugp_mid, p_parent_id, p_metadata, p_admin_notes,
    v_available_at
  ) returning id into v_id;

  v_signed_amount := case when p_direction = 'credit' then p_amount_cents else -p_amount_cents end;

  if p_owner_kind = 'creator' then
    if p_direction = 'credit' then
      -- Route credit to pending vs current depending on its own maturity.
      if v_available_at is not null and v_available_at > v_now then
        update profiles
           set pending_balance_cents = coalesce(pending_balance_cents, 0) + v_signed_amount,
               total_earned_cents    = coalesce(total_earned_cents, 0)    + v_signed_amount
         where id = p_owner_id;
      else
        update profiles
           set wallet_balance_cents = coalesce(wallet_balance_cents, 0) + v_signed_amount,
               total_earned_cents   = coalesce(total_earned_cents, 0)   + v_signed_amount
         where id = p_owner_id;
      end if;
    else
      -- Debit: figure out which bucket the parent credit currently sits in.
      -- payout_hold rows have no parent_id (they're the original of a payout
      -- chain); they always debit the current balance because withdrawals can
      -- only target funds that already cleared the hold window.
      v_parent_is_pending := false;
      if p_parent_id is not null then
        select available_at into v_parent_available
          from wallet_transactions
         where id = p_parent_id;
        v_parent_is_pending := v_parent_available is not null and v_parent_available > v_now;
      end if;

      if v_parent_is_pending then
        update profiles
           set pending_balance_cents = coalesce(pending_balance_cents, 0) + v_signed_amount,
               total_earned_cents    = coalesce(total_earned_cents, 0)    + v_signed_amount
         where id = p_owner_id;
      else
        update profiles
           set wallet_balance_cents = coalesce(wallet_balance_cents, 0) + v_signed_amount,
               total_earned_cents   = coalesce(total_earned_cents, 0)   + v_signed_amount
         where id = p_owner_id;
      end if;
    end if;
  else
    -- Chatters: no pending bucket, all flows hit chatter_earnings_cents.
    update profiles
       set chatter_earnings_cents = coalesce(chatter_earnings_cents, 0) + v_signed_amount
     where id = p_owner_id;
  end if;

  return v_id;
end;
$$;

grant execute on function apply_wallet_transaction(uuid, wallet_owner_kind, wallet_tx_direction, bigint, wallet_tx_source, uuid, text, text, uuid, jsonb, text) to service_role;

-- ============================================================
-- 6. mature_wallet_transactions (new)
-- ============================================================

-- Sweeps the (frontier, now()] window: every credit row whose available_at
-- falls inside it gets transferred from pending to current. Idempotent within
-- the same `p_now` because we advance the frontier at the end of the sweep.
create or replace function mature_wallet_transactions(p_now timestamptz default now())
returns table(creator_id uuid, moved_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frontier timestamptz;
begin
  -- Read frontier (default: epoch if not set).
  select coalesce((value->>'ts')::timestamptz, 'epoch'::timestamptz)
    into v_frontier
    from platform_settings
   where key = 'maturity_frontier_at';

  if v_frontier is null then
    v_frontier := 'epoch'::timestamptz;
  end if;

  -- Build per-creator deltas in the window. Only creator rows count: chatter
  -- credits are written with available_at = now() and never end up in pending.
  return query
  with newly_matured as (
    select wt.owner_id as creator_id,
           sum(wt.amount_cents)::bigint as delta
      from wallet_transactions wt
     where wt.owner_kind  = 'creator'
       and wt.direction   = 'credit'
       and wt.available_at is not null
       and wt.available_at >  v_frontier
       and wt.available_at <= p_now
     group by wt.owner_id
  ),
  applied as (
    update profiles p
       set pending_balance_cents = coalesce(p.pending_balance_cents, 0) - nm.delta,
           wallet_balance_cents  = coalesce(p.wallet_balance_cents, 0)  + nm.delta
      from newly_matured nm
     where p.id = nm.creator_id
    returning p.id, nm.delta
  )
  select id, delta from applied;

  -- Advance the frontier so the next run skips this window.
  update platform_settings
     set value = jsonb_build_object('ts', to_char(p_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         updated_at = now()
   where key = 'maturity_frontier_at';
end;
$$;

grant execute on function mature_wallet_transactions(timestamptz) to service_role;

comment on function mature_wallet_transactions(timestamptz) is
  'Daily cron RPC. Moves every newly-matured pending credit to the current balance and advances the platform_settings.maturity_frontier_at marker.';

-- ============================================================
-- 7. payout-proofs storage bucket
-- ============================================================

-- Private bucket. Direct frontend uploads are blocked — the
-- sign-payout-proof-upload edge function is the only writer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payout-proofs',
  'payout-proofs',
  false,
  10485760, -- 10 MB
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Creators can SELECT (i.e. let edge function generate signed URLs on their
-- behalf — service role bypasses RLS, but the RPC uses an authenticated client
-- to sign so we still need this policy).
drop policy if exists payout_proofs_owner_select on storage.objects;
create policy payout_proofs_owner_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payout-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Admins can SELECT everything in the bucket.
drop policy if exists payout_proofs_admin_select on storage.objects;
create policy payout_proofs_admin_select
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payout-proofs'
    and exists (
      select 1 from profiles
       where profiles.id = auth.uid()
         and profiles.is_admin = true
    )
  );
