#!/usr/bin/env bash
# scripts/check-ledger-discipline.sh — fails if any edge function writes wallet fields
# directly. The ledger RPC (apply_wallet_transaction) is the only allowed writer.
#
# Allow-list:
#   - _shared/ledger.ts (the wrapper that calls the RPC)
#   - // ledger-exempt  inline comment (use sparingly, for read-only SELECTs with an equals literal)
set -euo pipefail

BAD=$(grep -rEn \
  "wallet_balance_cents\s*=|chatter_earnings_cents\s*=|total_earned_cents\s*=|credit_creator_wallet\(|debit_creator_wallet\(" \
  supabase/functions/ \
  --include='*.ts' \
  | grep -v '_shared/ledger.ts' \
  | grep -v 'apply_wallet_transaction' \
  | grep -v '// ledger-exempt' || true)

if [ -n "$BAD" ]; then
  echo "✗ Direct wallet writes detected — route through _shared/ledger.ts:"
  echo "$BAD"
  exit 1
fi
echo "✓ Ledger discipline OK"
