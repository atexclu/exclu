-- 187_fix_total_earned_semantics.sql
--
-- Bug introduced by migration 183: the new apply_wallet_transaction wrote
-- `total_earned_cents = total_earned_cents + v_signed_amount` on BOTH the
-- credit and debit branches. Because v_signed_amount is negative for debits,
-- every refund / chargeback / payout_hold was decrementing total_earned —
-- which represents lifetime gross income and should grow only on credits
-- (matching the semantics of the original migration 170 RPC).
--
-- Fix: mirror the original `greatest(v_signed_amount, 0)` clamp. Debits no
-- longer touch total_earned. Credits behave exactly as before.
--
-- Tested in QA: a fresh credit still bumps total_earned ✓
--               a refund/chargeback/payout_hold leaves total_earned alone ✓

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

  -- Idempotency short-circuit.
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

  -- Compute available_at. Chatters earn instantly (no holding period).
  if p_direction = 'credit' and p_owner_kind = 'creator' then
    select created_at into v_account_created_at
      from auth.users
     where id = p_owner_id;

    if v_account_created_at is not null
       and v_account_created_at + interval '21 days' > v_now then
      v_available_at := v_account_created_at + interval '21 days';
    else
      v_available_at := v_now + interval '7 days';
    end if;
  elsif p_direction = 'credit' and p_owner_kind = 'chatter' then
    v_available_at := v_now;
  else
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
      -- Credit routed to pending vs current based on its own maturity.
      if v_available_at is not null and v_available_at > v_now then
        update profiles
           set pending_balance_cents = coalesce(pending_balance_cents, 0) + v_signed_amount,
               total_earned_cents    = coalesce(total_earned_cents, 0)    + greatest(v_signed_amount, 0)
         where id = p_owner_id;
      else
        update profiles
           set wallet_balance_cents = coalesce(wallet_balance_cents, 0) + v_signed_amount,
               total_earned_cents   = coalesce(total_earned_cents, 0)   + greatest(v_signed_amount, 0)
         where id = p_owner_id;
      end if;
    else
      -- Debit: locate the bucket of the parent credit so we decrement the
      -- correct projection. payout_hold is parent-less and always targets
      -- the current balance.
      v_parent_is_pending := false;
      if p_parent_id is not null then
        select available_at into v_parent_available
          from wallet_transactions
         where id = p_parent_id;
        v_parent_is_pending := v_parent_available is not null and v_parent_available > v_now;
      end if;

      -- Debits do NOT touch total_earned (greatest(negative, 0) == 0).
      if v_parent_is_pending then
        update profiles
           set pending_balance_cents = coalesce(pending_balance_cents, 0) + v_signed_amount,
               total_earned_cents    = coalesce(total_earned_cents, 0)    + greatest(v_signed_amount, 0)
         where id = p_owner_id;
      else
        update profiles
           set wallet_balance_cents = coalesce(wallet_balance_cents, 0) + v_signed_amount,
               total_earned_cents   = coalesce(total_earned_cents, 0)   + greatest(v_signed_amount, 0)
         where id = p_owner_id;
      end if;
    end if;
  else
    -- Chatters: no pending bucket; total_earned semantics not relevant here.
    update profiles
       set chatter_earnings_cents = coalesce(chatter_earnings_cents, 0) + v_signed_amount
     where id = p_owner_id;
  end if;

  return v_id;
end;
$$;

grant execute on function apply_wallet_transaction(uuid, wallet_owner_kind, wallet_tx_direction, bigint, wallet_tx_source, uuid, text, text, uuid, jsonb, text) to service_role;
