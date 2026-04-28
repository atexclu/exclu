// Vitest unit tests for ugp-api.ts — covers refund-path correctness
// without touching the real UG API or moving money.
//
// Run with: npx vitest run supabase/functions/_shared/ugp-api.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Stub Deno.env so the module under test can read env vars in Vitest ──
const envStore = new Map<string, string>();
(globalThis as unknown as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno = {
  env: { get: (k: string) => envStore.get(k) },
};

// Module is .ts with a Deno-style import path — load via dynamic import after stubbing.
async function loadModule() {
  // Vite/Vitest can resolve .ts paths directly.
  return await import('./ugp-api.ts');
}

beforeEach(() => {
  envStore.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  envStore.clear();
});

describe('UgpApiError.isAlreadyProcessed', () => {
  it('catches "already been refunded"', async () => {
    const { UgpApiError } = await loadModule();
    const err = new UgpApiError('Transaction has already been refunded', 400);
    expect(err.isAlreadyProcessed).toBe(true);
  });

  it('catches "is already refunded" (alt phrasing)', async () => {
    const { UgpApiError } = await loadModule();
    const err = new UgpApiError('The transaction is already refunded', 400);
    expect(err.isAlreadyProcessed).toBe(true);
  });

  it('catches "CBK1 record" (chargeback already pulled funds)', async () => {
    const { UgpApiError } = await loadModule();
    const err = new UgpApiError(
      'Validation Error: Not able to refund. The transaction might have CBK1 record or is already refunded.',
      400,
    );
    expect(err.isAlreadyProcessed).toBe(true);
  });

  it('does NOT catch unrelated errors', async () => {
    const { UgpApiError } = await loadModule();
    expect(new UgpApiError('Test card is not enabled', 400).isAlreadyProcessed).toBe(false);
    expect(new UgpApiError('Invalid amount', 400).isAlreadyProcessed).toBe(false);
    expect(new UgpApiError('Network timeout', 502).isAlreadyProcessed).toBe(false);
  });
});

describe('ugpRefund — per-MID credential routing', () => {
  it('uses INTL_3D env vars when midKey = "intl_3d"', async () => {
    envStore.set('UGP_MID_INTL_3D', 'INTL-MID-123');
    envStore.set('UGP_API_BEARER_TOKEN_INTL_3D', 'INTL-BEARER');
    envStore.set('UGP_MID_US_2D', 'US-MID-999');
    envStore.set('UGP_API_BEARER_TOKEN_US_2D', 'US-BEARER');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', message: 'ok', state: 'OK', status: 'Successful' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { ugpRefund } = await loadModule();
    await ugpRefund('TX123', 23, 'intl_3d');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.ugpayments.ch/merchants/INTL-MID-123/refundtransactions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer INTL-BEARER' });
  });

  it('uses US_2D env vars when midKey = "us_2d"', async () => {
    envStore.set('UGP_MID_INTL_3D', 'INTL-MID-123');
    envStore.set('UGP_API_BEARER_TOKEN_INTL_3D', 'INTL-BEARER');
    envStore.set('UGP_MID_US_2D', 'US-MID-999');
    envStore.set('UGP_API_BEARER_TOKEN_US_2D', 'US-BEARER');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', message: 'ok', state: 'OK', status: 'Successful' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { ugpRefund } = await loadModule();
    await ugpRefund('TX456', 50, 'us_2d');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.ugpayments.ch/merchants/US-MID-999/refundtransactions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer US-BEARER' });
  });

  it('defaults to INTL_3D when midKey is null/undefined (legacy rows)', async () => {
    envStore.set('UGP_MID_INTL_3D', 'INTL-MID-123');
    envStore.set('UGP_API_BEARER_TOKEN_INTL_3D', 'INTL-BEARER');

    // Each Response can only be consumed once — use a factory.
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ id: '1', message: 'ok', state: 'OK', status: 'Successful' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { ugpRefund } = await loadModule();
    await ugpRefund('TX789', 10, null);
    await ugpRefund('TX789', 10, undefined);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mock.calls.forEach(([url]) => {
      expect(url).toBe('https://api.ugpayments.ch/merchants/INTL-MID-123/refundtransactions');
    });
  });

  it('falls back to legacy UGP_MERCHANT_ID/UGP_API_BEARER_TOKEN for INTL_3D when new vars missing', async () => {
    envStore.set('UGP_MERCHANT_ID', 'LEGACY-MID');
    envStore.set('UGP_API_BEARER_TOKEN', 'LEGACY-BEARER');
    // No UGP_MID_INTL_3D / UGP_API_BEARER_TOKEN_INTL_3D set.

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', message: 'ok', state: 'OK', status: 'Successful' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { ugpRefund } = await loadModule();
    await ugpRefund('TX-LEG', 23, 'intl_3d');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.ugpayments.ch/merchants/LEGACY-MID/refundtransactions');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer LEGACY-BEARER' });
  });

  it('does NOT fall back to legacy for US_2D (different MID, no shared creds)', async () => {
    envStore.set('UGP_MERCHANT_ID', 'LEGACY-MID');
    envStore.set('UGP_API_BEARER_TOKEN', 'LEGACY-BEARER');
    // No UGP_MID_US_2D / UGP_API_BEARER_TOKEN_US_2D set.

    const { ugpRefund } = await loadModule();
    await expect(ugpRefund('TX-US', 50, 'us_2d')).rejects.toThrow(/Missing UG refund credentials for MID us_2d/);
  });

  it('throws clear error when INTL_3D creds are missing entirely', async () => {
    // No env vars at all.
    const { ugpRefund } = await loadModule();
    await expect(ugpRefund('TX-NO-CREDS', 23, 'intl_3d')).rejects.toThrow(/Missing UG refund credentials/);
  });

  it('sends correct request body shape (referenceTransactionId + amount)', async () => {
    envStore.set('UGP_MID_INTL_3D', 'M');
    envStore.set('UGP_API_BEARER_TOKEN_INTL_3D', 'B');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', message: 'ok', state: 'OK', status: 'Successful' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { ugpRefund } = await loadModule();
    await ugpRefund('TX-BODY-TEST', 42.5, 'intl_3d');

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      referenceTransactionId: 'TX-BODY-TEST',
      amount: 42.5,
    });
  });

  it('treats UG response with status="Approved" or "Successful" as success', async () => {
    envStore.set('UGP_MID_INTL_3D', 'M');
    envStore.set('UGP_API_BEARER_TOKEN_INTL_3D', 'B');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: '1', message: 'ok', state: 'APPROVED', status: 'Approved' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    );

    const { ugpRefund } = await loadModule();
    await expect(ugpRefund('TX-APPROVED', 10, 'intl_3d')).resolves.toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('throws UgpApiError on non-success UG status (e.g. "Declined")', async () => {
    envStore.set('UGP_MID_INTL_3D', 'M');
    envStore.set('UGP_API_BEARER_TOKEN_INTL_3D', 'B');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        id: '1', message: 'Declined by issuer', state: 'DECLINED', status: 'Declined',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    const { ugpRefund, UgpApiError } = await loadModule();
    await expect(ugpRefund('TX-DECL', 10, 'intl_3d'))
      .rejects.toBeInstanceOf(UgpApiError);
  });
});
