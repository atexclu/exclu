import { describe, it, expect, vi } from "vitest";
import {
  extractClientIp,
  handleSignupPreflight,
  type CheckBotIdFn,
  type CheckBotIdResult,
} from "./signupPreflightHandler";
import type {
  SupabaseForwardBody,
  SupabaseForwardResult,
  ForwardOptions,
} from "./forwardToSupabase";

const SUPABASE_URL = "https://example.supabase.co/functions/v1/check-signup-allowed";
const SECRET = "test-secret-abc";

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/check-signup-allowed", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeCheckBotId(result: CheckBotIdResult | Error): CheckBotIdFn {
  return async () => {
    if (result instanceof Error) throw result;
    return result;
  };
}

function makeForwarder(
  result: SupabaseForwardResult,
  capture?: { body?: SupabaseForwardBody; opts?: ForwardOptions },
) {
  return async (body: SupabaseForwardBody, opts: ForwardOptions) => {
    if (capture) {
      capture.body = body;
      capture.opts = opts;
    }
    return result;
  };
}

async function parseBody(
  res: Response,
): Promise<{ allowed?: boolean; reason?: string }> {
  return (await res.json()) as { allowed?: boolean; reason?: string };
}

describe("handleSignupPreflight — BotID guard", () => {
  it("passes when BotID returns isBot=false", async () => {
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: makeCheckBotId({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: false }),
        forwardToSupabase: makeForwarder({ allowed: true }),
      },
    );
    expect(res.status).toBe(200);
    expect(await parseBody(res)).toEqual({ allowed: true });
  });

  it("fails closed when BotID returns isBot=true", async () => {
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: makeCheckBotId({ isBot: true, isHuman: false, isVerifiedBot: false, bypassed: false }),
        forwardToSupabase: makeForwarder({ allowed: true }),
      },
    );
    expect(res.status).toBe(200);
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "bot_detected" });
  });

  it("fails closed when BotID returns the challenge-required branch (no isBot key)", async () => {
    // This is the security-critical case — the d.ts union has a branch
    // with only responseHeaders and no isBot. An earlier version of the
    // handler silently allowed this path. Verify we now block it.
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: makeCheckBotId({ responseHeaders: undefined } as CheckBotIdResult),
        forwardToSupabase: makeForwarder({ allowed: true }),
      },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "bot_detected" });
  });

  it("fails closed when checkBotId throws", async () => {
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: makeCheckBotId(new Error("botid runtime not initialized")),
        forwardToSupabase: makeForwarder({ allowed: true }),
      },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "bot_detected" });
  });

  it("fails closed when checkBotId returns null", async () => {
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: makeCheckBotId(null as unknown as CheckBotIdResult),
        forwardToSupabase: makeForwarder({ allowed: true }),
      },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "bot_detected" });
  });
});

describe("handleSignupPreflight — body validation", () => {
  const okBotId = makeCheckBotId({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: false });

  it("rejects non-JSON body with invalid_email", async () => {
    const res = await handleSignupPreflight(
      req("not-valid-json"),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "invalid_email" });
  });

  it("rejects null body", async () => {
    const res = await handleSignupPreflight(
      req(null),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "invalid_email" });
  });

  it("rejects array body", async () => {
    const res = await handleSignupPreflight(
      req(["a@b.com"]),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "invalid_email" });
  });

  it("rejects missing email", async () => {
    const res = await handleSignupPreflight(
      req({}),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "invalid_email" });
  });

  it("rejects non-string email", async () => {
    const res = await handleSignupPreflight(
      req({ email: 42 }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "invalid_email" });
  });

  it("rejects whitespace-only email", async () => {
    const res = await handleSignupPreflight(
      req({ email: "   " }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "invalid_email" });
  });
});

describe("handleSignupPreflight — env + forwarding", () => {
  const okBotId = makeCheckBotId({ isBot: false, isHuman: true, isVerifiedBot: false, bypassed: false });

  it("fails closed when SIGNUP_CHECK_INTERNAL_SECRET is not configured", async () => {
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: undefined, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }) },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("forwards email + fingerprint + user_agent + clientIp to Supabase", async () => {
    const capture: { body?: SupabaseForwardBody; opts?: ForwardOptions } = {};
    const res = await handleSignupPreflight(
      req(
        { email: "alice@example.com", device_fingerprint: "fp123456789012", user_agent: "ua/1" },
        { "x-forwarded-for": "203.0.113.7" },
      ),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }, capture) },
    );
    expect(await parseBody(res)).toEqual({ allowed: true });
    expect(capture.body).toEqual({
      email: "alice@example.com",
      device_fingerprint: "fp123456789012",
      user_agent: "ua/1",
    });
    expect(capture.opts?.secret).toBe(SECRET);
    expect(capture.opts?.url).toBe(SUPABASE_URL);
    expect(capture.opts?.clientIp).toBe("203.0.113.7");
  });

  it("prefers x-vercel-forwarded-for over x-forwarded-for when both are present", async () => {
    const capture: { body?: SupabaseForwardBody; opts?: ForwardOptions } = {};
    await handleSignupPreflight(
      req(
        { email: "alice@example.com" },
        {
          "x-vercel-forwarded-for": "203.0.113.99",
          "x-forwarded-for": "10.0.0.1",
        },
      ),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }, capture) },
    );
    expect(capture.opts?.clientIp).toBe("203.0.113.99");
  });

  it("passes through Supabase's {allowed:false, reason} verbatim", async () => {
    const res = await handleSignupPreflight(
      req({ email: "throwaway@mailinator.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: okBotId,
        forwardToSupabase: makeForwarder({ allowed: false, reason: "disposable_email" }),
      },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "disposable_email" });
  });

  it("fails closed when forwardToSupabase throws", async () => {
    const res = await handleSignupPreflight(
      req({ email: "alice@example.com" }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      {
        checkBotId: okBotId,
        forwardToSupabase: vi.fn(async () => {
          throw new Error("network down");
        }) as unknown as typeof import("./forwardToSupabase").forwardToSupabase,
      },
    );
    expect(await parseBody(res)).toEqual({ allowed: false, reason: "internal_error" });
  });

  it("trims leading/trailing whitespace from email before forwarding", async () => {
    const capture: { body?: SupabaseForwardBody; opts?: ForwardOptions } = {};
    await handleSignupPreflight(
      req({ email: "  alice@example.com  " }),
      { secret: SECRET, supabaseUrl: SUPABASE_URL },
      { checkBotId: okBotId, forwardToSupabase: makeForwarder({ allowed: true }, capture) },
    );
    expect(capture.body?.email).toBe("alice@example.com");
  });
});

describe("extractClientIp", () => {
  it("returns x-vercel-forwarded-for when present", () => {
    const r = new Request("http://localhost", {
      headers: { "x-vercel-forwarded-for": "1.2.3.4" },
    });
    expect(extractClientIp(r)).toBe("1.2.3.4");
  });

  it("falls back to x-forwarded-for", () => {
    const r = new Request("http://localhost", {
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    expect(extractClientIp(r)).toBe("5.6.7.8");
  });

  it("returns undefined when neither header is present", () => {
    const r = new Request("http://localhost");
    expect(extractClientIp(r)).toBeUndefined();
  });
});
