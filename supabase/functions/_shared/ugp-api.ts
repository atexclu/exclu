/**
 * UG Payments REST API helpers for Capture, Void, and Refund operations.
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

  /** True if the transaction was already in the target state (idempotent) */
  get isAlreadyProcessed(): boolean {
    const msg = this.message.toLowerCase();
    return msg.includes('already been captured') ||
           msg.includes('already been voided') ||
           msg.includes('already been refunded');
  }

  /** True if the authorization has expired */
  get isExpired(): boolean {
    return this.message.toLowerCase().includes('time period to capture') ||
           this.message.toLowerCase().includes('expired');
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
 * Capture a pre-authorized transaction.
 * Only authorize transactions that have not been voided can be captured.
 *
 * @param authorizeTransactionId - The TransactionID from the original Authorize
 * @param amountDecimal - Amount to capture (decimal, e.g. 20.00)
 */
export async function ugpCapture(
  authorizeTransactionId: string,
  amountDecimal: number,
): Promise<UgpApiResponse> {
  return callUgpApi('capturetransactions', {
    authorizeTransactionId,
    amount: amountDecimal,
  });
}

/**
 * Void a pre-authorized transaction (release the hold).
 * Only authorize transactions can be voided.
 *
 * @param authorizeTransactionId - The TransactionID from the original Authorize
 */
export async function ugpVoid(
  authorizeTransactionId: string,
): Promise<UgpApiResponse> {
  return callUgpApi('voidtransactions', {
    authorizeTransactionId,
  });
}

/**
 * Refund a completed Sale or Capture transaction.
 * Supports partial refunds (amount < original).
 *
 * @param referenceTransactionId - The TransactionID from the Sale or Capture
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
