// Single access gate for every content-delivery path on Exclu.
//
// Used by:
//   - src/pages/PublicLink.tsx (direct unlock after Confirm redirect)
//   - supabase/functions/send-link-content-email (email delivery)
//   - supabase/functions/generate-signed-urls (signed asset URLs)
//   - manage-request delivery flow (custom request fulfillment)
//
// Invariant: content unlocks iff the gate returns true, regardless of any
// other flag. Everything else — pending, requires_payment_method, refunded,
// null — keeps the content locked.

export interface PurchaseGate {
  status: string;
}

export interface CustomRequestGate {
  status: string;
  captured_at?: string | null;
}

export function canAccessPurchasedLink(p: PurchaseGate | null | undefined): boolean {
  return !!p && p.status === 'succeeded';
}

export function canAccessCustomRequestDelivery(r: CustomRequestGate | null | undefined): boolean {
  return !!r && r.status === 'delivered' && !!r.captured_at;
}
