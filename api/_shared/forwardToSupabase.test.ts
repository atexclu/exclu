import { describe, it, expect, vi } from "vitest";
import { forwardToSupabase } from "./forwardToSupabase";

const URL = "https://example.supabase.co/functions/v1/check-signup-allowed";
const SECRET = "test-secret-123";

function makeFetch(responder: (init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    return responder(init ?? {});
  }) as unknown as typeof fetch;
}

describe("forwardToSupabase", () => {
  it("attaches x-internal-secret and forwards the body", async () => {
    const fetchSpy = makeFetch(
      () => new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    );

    const result = await forwardToSupabase(
      { email: "alice@example.com", device_fingerprint: "fp123", user_agent: "ua/1.0" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: true });
    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls.length).toBe(1);
    const [calledUrl, init] = calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(URL);
    expect(init.method).toBe("POST");
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders["x-internal-secret"]).toBe(SECRET);
    expect(sentHeaders["content-type"]).toBe("application/json");
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.email).toBe("alice@example.com");
    expect(parsedBody.device_fingerprint).toBe("fp123");
    expect(parsedBody.user_agent).toBe("ua/1.0");
  });

  it("forwards x-client-ip when clientIp is provided", async () => {
    const fetchSpy = makeFetch(
      () => new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    );

    await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, clientIp: "203.0.113.42", fetchImpl: fetchSpy },
    );

    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const [, init] = calls[0] as [string, RequestInit];
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders["x-client-ip"]).toBe("203.0.113.42");
  });

  it("omits x-client-ip when clientIp is absent", async () => {
    const fetchSpy = makeFetch(
      () => new Response(JSON.stringify({ allowed: true }), { status: 200 }),
    );

    await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    const calls = (fetchSpy as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const [, init] = calls[0] as [string, RequestInit];
    const sentHeaders = init.headers as Record<string, string>;
    expect(sentHeaders["x-client-ip"]).toBeUndefined();
  });

  it("passes through Supabase's {allowed:false, reason} verbatim", async () => {
    const fetchSpy = makeFetch(
      () =>
        new Response(
          JSON.stringify({ allowed: false, reason: "disposable_email" }),
          { status: 200 },
        ),
    );

    const result = await forwardToSupabase(
      { email: "throwaway@mailinator.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "disposable_email" });
  });

  it("fails closed on non-200 response", async () => {
    const fetchSpy = makeFetch(() => new Response("", { status: 500 }));

    const result = await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("fails closed on 401 (wrong secret)", async () => {
    const fetchSpy = makeFetch(
      () =>
        new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    const result = await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: "wrong-secret", fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("fails closed when fetch throws", async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const result = await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("fails closed on malformed JSON body", async () => {
    const fetchSpy = makeFetch(() => new Response("not-json", { status: 200 }));

    const result = await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("fails closed on valid JSON but unexpected shape", async () => {
    const fetchSpy = makeFetch(
      () => new Response(JSON.stringify({ wat: "nope" }), { status: 200 }),
    );

    const result = await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("fails closed on {allowed:false} without a reason string", async () => {
    const fetchSpy = makeFetch(
      () =>
        new Response(JSON.stringify({ allowed: false, reason: 123 }), {
          status: 200,
        }),
    );

    const result = await forwardToSupabase(
      { email: "alice@example.com" },
      { url: URL, secret: SECRET, fetchImpl: fetchSpy },
    );

    expect(result).toEqual({ allowed: false, reason: "internal_error" });
  });
});
