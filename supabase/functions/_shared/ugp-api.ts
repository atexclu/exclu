/**
 * UG Payments REST API helpers — Refund only.
 *
 * QuickPay (hosted checkout) processes every transaction as a Sale on
 * our MID; pre-auth/Capture/Void are not available, so the only API
 * money-movement call we need is `refundtransactions`.
 *
 * Required env vars:
 *   UGP_MERCHANT_ID    — Merchant ID for API authentication
 *   UGP_API_BEARER_TOKEN — OAuth Bearer token for API authentication
 *
 * API Base: https://api.ugpayments.ch/merchants/{MerchantId}
 */

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

function getCredentials(): { merchantId: string; bearerToken: string } {
  const merchantId = Deno.env.get('UGP_MERCHANT_ID');
  const bearerToken = Deno.env.get('UGP_API_BEARER_TOKEN');

  if (!merchantId || !bearerToken) {
    throw new Error('Missing UGP_MERCHANT_ID or UGP_API_BEARER_TOKEN environment variables');
  }

  return { merchantId, bearerToken };
}

async function callUgpApi(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<UgpApiResponse> {
  const { merchantId, bearerToken } = getCredentials();
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
 */
export async function ugpRefund(
  referenceTransactionId: string,
  amountDecimal: number,
): Promise<UgpApiResponse> {
  return callUgpApi('refundtransactions', {
    referenceTransactionId,
    amount: amountDecimal,
  });
}
