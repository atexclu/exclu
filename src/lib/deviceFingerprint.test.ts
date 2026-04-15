/**
 * Vitest for preflightSignup and humanizeReason.
 *
 * The FingerprintJS library is lazy-loaded and makes network calls; the
 * tests mock `fetch` and the FingerprintJS module so we exercise pure
 * logic only. Preflight gating is controlled by stubbing
 * `import.meta.env.VITE_SIGNUP_PREFLIGHT_ENABLED`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock FingerprintJS so we never touch a browser API during tests.
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn(async () => ({
      get: async () => ({ visitorId: "fake-visitor-id-abcdef123456" }),
    })),
  },
}));

import {
  humanizeReason,
  preflightSignup,
  type PreflightReason,
} from "./deviceFingerprint";

const originalFetch = globalThis.fetch;
const originalEnv = import.meta.env.VITE_SIGNUP_PREFLIGHT_ENABLED;

function stubFlag(value: "true" | "false" | undefined) {
  if (value === undefined) {
    // @ts-expect-error test-time mutation
    delete import.meta.env.VITE_SIGNUP_PREFLIGHT_ENABLED;
  } else {
    // @ts-expect-error test-time mutation
    import.meta.env.VITE_SIGNUP_PREFLIGHT_ENABLED = value;
  }
}

beforeEach(() => {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Test)" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  stubFlag(originalEnv);
});

describe("humanizeReason", () => {
  it("returns a specific message for each known reason", () => {
    const reasons: PreflightReason[] = [
      "disposable_email",
      "too_many_signups_ip",
      "too_many_signups_device",
      "cooldown_active",
      "invalid_email",
      "internal_error",
      "bot_detected",
      "network_error",
    ];
    for (const r of reasons) {
      const msg = humanizeReason(r);
      expect(msg).toBeTruthy();
      expect(msg.length).toBeGreaterThan(10);
    }
  });

  it("falls back to unknown for unmapped reasons", () => {
    // @ts-expect-error deliberately invalid
    const msg = humanizeReason("totally-made-up");
    expect(msg).toMatch(/unavailable/i);
  });
});

describe("preflightSignup", () => {
  it("is a no-op when VITE_SIGNUP_PREFLIGHT_ENABLED is not 'true'", async () => {
    stubFlag(undefined);
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await preflightSignup("a@b.com");

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("is a no-op when the flag is 'false'", async () => {
    stubFlag("false");
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await preflightSignup("a@b.com");

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls /api/check-signup-allowed with email + fingerprint + UA when enabled", async () => {
    stubFlag("true");
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await preflightSignup("alice@example.com");

    expect(result).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/check-signup-allowed");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    const body = JSON.parse(init.body as string);
    expect(body.email).toBe("alice@example.com");
    expect(body.device_fingerprint).toBe("fake-visitor-id-abcdef123456");
    expect(body.user_agent).toBe("Mozilla/5.0 (Test)");
  });

  it("returns the server-provided reason when allowed=false", async () => {
    stubFlag("true");
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ allowed: false, reason: "disposable_email" }), {
        status: 200,
      })) as unknown as typeof fetch;

    const result = await preflightSignup("throwaway@mailinator.com");
    expect(result).toEqual({ ok: false, reason: "disposable_email" });
  });

  it("buckets non-200 responses into internal_error", async () => {
    stubFlag("true");
    globalThis.fetch = (async () =>
      new Response("", { status: 500 })) as unknown as typeof fetch;

    const result = await preflightSignup("alice@example.com");
    expect(result).toEqual({ ok: false, reason: "internal_error" });
  });

  it("handles a thrown fetch as network_error", async () => {
    stubFlag("true");
    globalThis.fetch = (async () => {
      throw new Error("ERR_NETWORK");
    }) as unknown as typeof fetch;

    const result = await preflightSignup("alice@example.com");
    expect(result).toEqual({ ok: false, reason: "network_error" });
  });

  it("handles a non-JSON response as internal_error", async () => {
    stubFlag("true");
    globalThis.fetch = (async () =>
      new Response("not-json", { status: 200 })) as unknown as typeof fetch;

    const result = await preflightSignup("alice@example.com");
    expect(result).toEqual({ ok: false, reason: "internal_error" });
  });

  it("maps unknown reason strings to the 'unknown' reason", async () => {
    stubFlag("true");
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ allowed: false, reason: "martian_invasion" }), {
        status: 200,
      })) as unknown as typeof fetch;

    const result = await preflightSignup("alice@example.com");
    // We trust server to never invent categories we don't map, but if it
    // does, we still block (ok: false) and show the generic message.
    expect(result).toMatchObject({ ok: false });
  });
});
