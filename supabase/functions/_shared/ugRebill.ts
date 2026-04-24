// supabase/functions/_shared/ugRebill.ts
//
// Thin wrapper around UG Payments' /recurringtransactions endpoint.
//
// Request body fields (verified via UG 400 validation response 2026-04-24):
//   - SaleTransactionId: the ORIGINAL Sale TID (UG's validator calls this field
//                        "Reference Transaction Id" in human form but expects
//                        the JSON key `SaleTransactionId`). Do NOT use
//                        `TransactionID` — UG silently ignores it and rejects
//                        the request as `SaleTransactionId` null.
//   - Amount:            decimal-as-string, e.g. "39.99"
//   - Currency:          ISO-4217, MUST match the original Sale's currency
//   - TrackingId:        echoed verbatim on the ListenerURL Recurring postback
//
// UG Payment confirmed (2026-04-20) there's no uniform card-expired reason code —
// each issuer returns its own free-form message. Classification is binary
// (success / declined / error); the caller decides the retry policy on top.
//
// Transient errors (5xx / network timeout) are classified `transient` so the
// cron does NOT count them against the 3-attempt cap — UG being down is not
// the creator's fault.
import type { UgMidCredentials } from './ugRouting.ts';

export interface RebillResult {
  success: boolean;
  transactionId: string | null;  // NEW rebill TID (not the reference)
  reasonCode: string | null;
  message: string | null;
  classification: 'success' | 'declined' | 'error' | 'transient';
  raw: unknown;
}

const REBILL_TIMEOUT_MS = 15_000;

export async function rebillTransaction(
  creds: UgMidCredentials,
  referenceTransactionId: string,   // MUST be the ORIGINAL Sale TID; never a rebilled TID (UG Payment Q1)
  amountCents: number,
  trackingId: string,               // our rebill_attempts.id — echoed back in the Listener postback per UG Payment Q9
): Promise<RebillResult> {
  const url = `https://api.ugpayments.ch/merchants/${creds.merchantId}/recurringtransactions`;
  const body = {
    SaleTransactionId: referenceTransactionId,
    Amount: (amountCents / 100).toFixed(2),
    Currency: 'USD',
    TrackingId: trackingId,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REBILL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${creds.oauthBearer}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    // Network failure / timeout / abort — transient. The cron will retry next run.
    return {
      success: false,
      transactionId: null,
      reasonCode: null,
      message: (e as Error).message,
      classification: 'transient',
      raw: null,
    };
  } finally {
    clearTimeout(timeout);
  }

  // 5xx from UG itself = transient; 4xx = a real decline/validation error.
  if (res.status >= 500) {
    const raw = await res.json().catch(() => null);
    return {
      success: false,
      transactionId: null,
      reasonCode: null,
      message: `UG 5xx: ${res.status}`,
      classification: 'transient',
      raw,
    };
  }

  const raw = await res.json().catch(() => null);
  // Direct Rebilling 1.0 §APPENDIX B transaction statuses: Successful / Error
  //   / Declined / Pending / Scrubbed / Fraud / Unconfirmed. Response example
  //   uses lowercase field names (`reasoncode`); the legacy DirectSale v1.14
  //   doc also mentions `reasonCode`. Accept either.
  const status = String(raw?.status ?? '').toLowerCase();
  const reasonCode = raw?.reasoncode
    ? String(raw.reasoncode)
    : raw?.reasonCode
    ? String(raw.reasonCode)
    : null;
  const message = raw?.message ? String(raw.message) : null;
  const tid = raw?.id ? String(raw.id) : null;

  if (status === 'successful' || status === 'approved') {
    return { success: true, transactionId: tid, reasonCode, message, classification: 'success', raw };
  }
  if (status === 'declined' || status === 'scrubbed' || status === 'fraud') {
    return { success: false, transactionId: tid, reasonCode, message, classification: 'declined', raw };
  }
  if (status === 'pending' || status === 'unconfirmed' || status === 'error') {
    // UG's own side is uncertain — treat as transient so we don't burn a retry slot.
    return { success: false, transactionId: tid, reasonCode, message, classification: 'transient', raw };
  }
  return { success: false, transactionId: tid, reasonCode, message, classification: 'error', raw };
}
