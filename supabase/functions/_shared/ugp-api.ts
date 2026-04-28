/**
 * UG Payments REST API helpers — Refund only.
 *
 * QuickPay (hosted checkout) processes every transaction as a Sale on
 * our MID; pre-auth/Capture/Void are not available, so the only API
 * money-movement call we need is `refundtransactions`.
 *
 * Per-MID routing: each transaction is captured on a specific MID
 * (us_2d for US/CA, intl_3d for the rest). Refunds MUST hit the same
 * MID's API endpoint with that MID's credentials, otherwise the API
 * returns "transaction not found". Callers pass the row's `ugp_mid`
 * column; rows older than migration 164 (where the column was added)
 * may have NULL — we default to `intl_3d` since that's the only MID
 * that existed before per-MID routing.
 *
 * API Base: https://api.ugpayments.ch/merchants/{MerchantId}
 */

import { type UgMidKey } from './ugRouting.ts';

const UGP_API_BASE = 'https://api.ugpayments.ch/merchants';

export interface UgpApiResponse {
  id: string;
  message: string;
  state: string;
  status: string;
  reasoncode?: string;
  trackingId?: string;
}

export class UgpApiError extends Error {
  public readonly httpStatus: number;
  public readonly ugpResponse: UgpApiResponse | null;

  constructor(message: string, httpStatus: number, ugpResponse: UgpApiResponse | null = null) {
    super(message);
    this.name = 'UgpApiError';
    this.httpStatus = httpStatus;
    this.ugpResponse = ugpResponse;
  }

  /** True if the transaction was already refunded (idempotent retry safe) */
  get isAlreadyProcessed(): boolean {
    return this.message.toLowerCase().includes('already been refunded');
  }
}

// Read ONLY the API credentials (merchantId + bearer) for a given MID.
// We deliberately do NOT go through getMidCredentials() — that helper also
// validates quickPayToken + siteId, which are checkout-only fields and
// irrelevant for refunds. A partial env-var migration (where checkout creds
// were renamed but bearer/merchant kept legacy names, or vice versa) used
// to throw before reaching the API.
function getCredentials(midKey: UgMidKey): { merchantId: string; bearerToken: string } {
  const prefix = midKey === 'us_2d' ? 'US_2D' : 'INTL_3D';
  const legacy = midKey === 'intl_3d';
  const merchantId =
    Deno.env.get(`UGP_MID_${prefix}`) ??
    (legacy ? Deno.env.get('UGP_MERCHANT_ID') ?? '' : '');
  const bearerToken =
    Deno.env.get(`UGP_API_BEARER_TOKEN_${prefix}`) ??
    (legacy ? Deno.env.get('UGP_API_BEARER_TOKEN') ?? '' : '');

  if (!merchantId || !bearerToken) {
    throw new Error(
      `Missing UG refund credentials for MID ${midKey} ` +
      `(need UGP_MID_${prefix} + UGP_API_BEARER_TOKEN_${prefix}` +
      (legacy ? ' or legacy UGP_MERCHANT_ID + UGP_API_BEARER_TOKEN' : '') +
      ')',
    );
  }
  return { merchantId, bearerToken };
}

async function callUgpApi(
  endpoint: string,
  body: Record<string, unknown>,
  midKey: UgMidKey,
): Promise<UgpApiResponse> {
  const { merchantId, bearerToken } = getCredentials(midKey);
  const url = `${UGP_API_BASE}/${merchantId}/${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bearerToken}`,
    },
    body: JSON.stringify(body),
  });

  let data: UgpApiResponse;
  try {
    data = await res.json() as UgpApiResponse;
  } catch {
    const text = await res.text().catch(() => 'no body');
    throw new UgpApiError(
      `UGP API ${endpoint} returned non-JSON (HTTP ${res.status}): ${text}`,
      res.status,
    );
  }

  if (!res.ok || (data.status !== 'Successful' && data.status !== 'Approved')) {
    throw new UgpApiError(
      data.message || `UGP API ${endpoint} failed (HTTP ${res.status})`,
      res.status,
      data,
    );
  }

  return data;
}

/**
 * Refund a completed Sale transaction.
 * Supports partial refunds (amount < original).
 *
 * QuickPay always processes a Sale on this MID — there is no Authorize/
 * Capture/Void path available, so refundtransactions is the only money-
 * movement REST call we need. See docs/documentation api ugc payment 2.md.
 *
 * @param referenceTransactionId - The TransactionID from the Sale
 * @param amountDecimal - Amount to refund (decimal, e.g. 20.00)
 * @param midKey - Which MID processed the original sale; defaults to
 *   `intl_3d` for legacy rows (pre-migration 164) where ugp_mid is NULL.
 */
export async function ugpRefund(
  referenceTransactionId: string,
  amountDecimal: number,
  midKey: UgMidKey | null | undefined = 'intl_3d',
): Promise<UgpApiResponse> {
  const resolved: UgMidKey = midKey ?? 'intl_3d';
  return callUgpApi('refundtransactions', {
    referenceTransactionId,
    amount: amountDecimal,
  }, resolved);
}
