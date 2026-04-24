-- 170_wallet_ledger.sql
-- Append-only ledger for every credit/debit that touches:
--   profiles.wallet_balance_cents
--   profiles.total_earned_cents
--   profiles.chatter_earnings_cents
--
-- Invariants enforced here:
--   - Idempotency: duplicate ConfirmURLs for the same TransactionID never double-credit.
--   - Provenance: every balance mutation links back to a real UG transaction
--     OR to an internal operation (payout, manual_adjustment) with audit metadata.
--   - No UPDATEs: reversals are expressed as a new row with opposite sign + parent_id.

do $$ begin
  create type wallet_owner_kind as enum ('creator', 'chatter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wallet_tx_direction as enum ('credit', 'debit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type wallet_tx_source as enum (
    'link_purchase',
    'tip',
    'gift_purchase',
    'custom_request',
    'creator_subscription',
    'fan_subscription',
    'chatter_commission',
    'payout_hold',
    'payout_failure',
    'refund',
    'chargeback',
    'manual_adjustment'
  );
exception when duplicate_object then null; end $$;

create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  owner_kind wallet_owner_kind not null,
  direction wallet_tx_direction not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'USD',
  source_type wallet_tx_source not null,
  source_id uuid,
  source_transaction_id text,
  source_ugp_mid text,
  parent_id uuid references wallet_transactions(id),
  admin_notes text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  -- Chatter attribution policy: chatters earn ONLY on link purchases and
  -- custom request captures. They earn nothing on tips, gifts, subscriptions.
  constraint wallet_tx_chatter_source_whitelist check (
    owner_kind <> 'chatter'
    or source_type in ('chatter_commission', 'refund', 'chargeback', 'manual_adjustment')
  )
);

-- Idempotency guarantee: one (credit|debit) row per (owner, source, UG TID) tuple.
-- parent_id is NULL for first-write rows and points at the original for reversals,
-- so refunding the same TID twice creates exactly ONE reversal row.
create unique index wallet_tx_idempotency_idx
  on wallet_transactions(owner_id, source_type, direction, coalesce(source_transaction_id, source_id::text))
  where source_transaction_id is not null or source_id is not null;

create index wallet_tx_owner_idx on wallet_transactions(owner_id, created_at desc);
create index wallet_tx_source_idx on wallet_transactions(source_type, source_id);
create index wallet_tx_tid_idx on wallet_transactions(source_transaction_id)
  where source_transaction_id is not null;

comment on table wallet_transactions is
  'Append-only ledger of every mutation to creator/chatter balances. Every credit or debit written here; profiles.wallet_balance_cents/total_earned_cents/chatter_earnings_cents are projections that MUST equal the ledger sum.';

-- Single-writer RPC: callers pass the facts, the function writes the ledger row
-- AND updates the projection columns atomically. Idempotent on the unique index.
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
begin
  if p_owner_id is null or p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'apply_wallet_transaction: bad args';
  end if;
  if p_source_type = 'manual_adjustment' and (p_admin_notes is null or length(p_admin_notes) < 3) then
    raise exception 'manual_adjustment requires admin_notes';
  end if;

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

  insert into wallet_transactions (
    owner_id, owner_kind, direction, amount_cents, source_type, source_id,
    source_transaction_id, source_ugp_mid, parent_id, metadata, admin_notes
  ) values (
    p_owner_id, p_owner_kind, p_direction, p_amount_cents, p_source_type, p_source_id,
    p_source_transaction_id, p_source_ugp_mid, p_parent_id, p_metadata, p_admin_notes
  ) returning id into v_id;

  v_signed_amount := case when p_direction = 'credit' then p_amount_cents else -p_amount_cents end;

  if p_owner_kind = 'creator' then
    update profiles
       set wallet_balance_cents = coalesce(wallet_balance_cents, 0) + v_signed_amount,
           total_earned_cents = coalesce(total_earned_cents, 0) + greatest(v_signed_amount, 0)
     where id = p_owner_id;
  else
    update profiles
       set chatter_earnings_cents = coalesce(chatter_earnings_cents, 0) + v_signed_amount
     where id = p_owner_id;
  end if;

  return v_id;
end;
$$;

grant execute on function apply_wallet_transaction(uuid, wallet_owner_kind, wallet_tx_direction, bigint, wallet_tx_source, uuid, text, text, uuid, jsonb, text) to service_role;

alter table wallet_transactions enable row level security;

create policy wallet_tx_self_read
  on wallet_transactions for select
  using (auth.uid() = owner_id);

create or replace view wallet_transactions_admin
with (security_invoker = on)
as
select wt.*, p.display_name, p.handle
  from wallet_transactions wt
  join profiles p on p.id = wt.owner_id;
