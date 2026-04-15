import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COOLDOWN_BLOCKING_OUTCOMES,
  constantTimeStringEqual,
  extractEmailDomain,
  isValidFingerprint,
  normalizeEmail,
  parseSignupBody,
  shouldBlockByCooldown,
} from "./signup_checks.ts";

Deno.test("extractEmailDomain parses basic addresses", () => {
  assertEquals(extractEmailDomain("Alice@Example.com"), "example.com");
  assertEquals(extractEmailDomain("user.name+tag@sub.example.co.uk"), "sub.example.co.uk");
});

Deno.test("extractEmailDomain rejects malformed input", () => {
  assertEquals(extractEmailDomain("bad"), null);
  assertEquals(extractEmailDomain("a@b@c"), null);
  assertEquals(extractEmailDomain("@example.com"), null);
  assertEquals(extractEmailDomain("user@"), null);
  assertEquals(extractEmailDomain(""), null);
  assertEquals(extractEmailDomain("user @example.com"), null);
  assertEquals(extractEmailDomain("user@exa mple.com"), null);
});

Deno.test("normalizeEmail lowercases and trims", () => {
  assertEquals(normalizeEmail("  Alice@Example.COM  "), "alice@example.com");
  assertEquals(normalizeEmail("A@B.C"), "a@b.c");
});

Deno.test("isValidFingerprint accepts reasonable visitor ids", () => {
  assertStrictEquals(isValidFingerprint("1a2b3c4d5e6f7890abcd1234"), true);
  assertStrictEquals(isValidFingerprint("A".repeat(32)), true);
  assertStrictEquals(isValidFingerprint("abcd_EFGH-1234"), true);
});

Deno.test("isValidFingerprint rejects injection attempts, empty, too short, too long", () => {
  assertStrictEquals(isValidFingerprint(""), false);
  assertStrictEquals(isValidFingerprint("short"), false);
  assertStrictEquals(isValidFingerprint("A".repeat(200)), false);
  assertStrictEquals(isValidFingerprint("foo;delete"), false);
  assertStrictEquals(isValidFingerprint("abc'or'1=1"), false);
  assertStrictEquals(isValidFingerprint("a b c d e f g h"), false);
  assertStrictEquals(isValidFingerprint(null), false);
  assertStrictEquals(isValidFingerprint(undefined), false);
  assertStrictEquals(isValidFingerprint(123), false);
  assertStrictEquals(isValidFingerprint({}), false);
});

Deno.test("shouldBlockByCooldown blocks allowed attempts within window", () => {
  const now = Date.now();
  const recent = [
    { created_at: new Date(now - 30_000).toISOString(), outcome: "allowed" },
  ];
  assertStrictEquals(shouldBlockByCooldown(recent, now, 60), true);
  assertStrictEquals(shouldBlockByCooldown(recent, now, 20), false);
});

Deno.test("shouldBlockByCooldown blocks completed attempts within window", () => {
  const now = Date.now();
  const recent = [
    { created_at: new Date(now - 60_000).toISOString(), outcome: "completed" },
  ];
  assertStrictEquals(shouldBlockByCooldown(recent, now, 300), true);
});

Deno.test("shouldBlockByCooldown ignores blocked or failed attempts", () => {
  const now = Date.now();
  const recent = [
    { created_at: new Date(now - 5_000).toISOString(), outcome: "blocked_rate" },
    { created_at: new Date(now - 5_000).toISOString(), outcome: "failed_validation" },
    { created_at: new Date(now - 5_000).toISOString(), outcome: "blocked_disposable" },
  ];
  assertStrictEquals(shouldBlockByCooldown(recent, now, 600), false);
});

Deno.test("shouldBlockByCooldown handles empty array", () => {
  assertStrictEquals(shouldBlockByCooldown([], Date.now(), 300), false);
});

Deno.test("shouldBlockByCooldown tolerates malformed timestamps", () => {
  const now = Date.now();
  const recent = [
    { created_at: "not-a-date", outcome: "allowed" },
  ];
  // Malformed date → skip, don't crash, don't block.
  assertStrictEquals(shouldBlockByCooldown(recent, now, 300), false);
});

Deno.test("COOLDOWN_BLOCKING_OUTCOMES is the single source of truth", () => {
  assertStrictEquals(COOLDOWN_BLOCKING_OUTCOMES.has("allowed"), true);
  assertStrictEquals(COOLDOWN_BLOCKING_OUTCOMES.has("completed"), true);
  assertStrictEquals(COOLDOWN_BLOCKING_OUTCOMES.has("blocked_rate"), false);
});

Deno.test("parseSignupBody accepts minimal valid body", () => {
  const out = parseSignupBody({ email: "a@b.com" });
  assertEquals(out.ok, true);
  if (out.ok) {
    assertEquals(out.value.email, "a@b.com");
    assertEquals(out.value.device_fingerprint, undefined);
    assertEquals(out.value.user_agent, undefined);
  }
});

Deno.test("parseSignupBody accepts full valid body", () => {
  const out = parseSignupBody({
    email: "User@Example.com",
    device_fingerprint: "abcd1234efgh5678",
    user_agent: "Mozilla/5.0",
  });
  assertEquals(out.ok, true);
  if (out.ok) {
    assertEquals(out.value.email, "User@Example.com");
    assertEquals(out.value.device_fingerprint, "abcd1234efgh5678");
    assertEquals(out.value.user_agent, "Mozilla/5.0");
  }
});

Deno.test("parseSignupBody rejects non-object, missing email, non-string email", () => {
  assertStrictEquals(parseSignupBody(null).ok, false);
  assertStrictEquals(parseSignupBody("string").ok, false);
  assertStrictEquals(parseSignupBody({}).ok, false);
  assertStrictEquals(parseSignupBody({ email: 123 }).ok, false);
  assertStrictEquals(parseSignupBody({ email: "" }).ok, false);
  assertStrictEquals(parseSignupBody({ email: " ".repeat(5) }).ok, false);
});

Deno.test("parseSignupBody drops invalid fingerprint silently", () => {
  const out = parseSignupBody({
    email: "a@b.com",
    device_fingerprint: "evil'or'1=1",
  });
  assertEquals(out.ok, true);
  if (out.ok) {
    // Invalid fingerprint is dropped, not rejected — caller treats "no fingerprint" as degraded mode.
    assertEquals(out.value.device_fingerprint, undefined);
  }
});

Deno.test("parseSignupBody truncates excessively long user_agent", () => {
  const huge = "UA".repeat(5000); // 10_000 chars
  const out = parseSignupBody({ email: "a@b.com", user_agent: huge });
  assertEquals(out.ok, true);
  if (out.ok) {
    assertEquals(out.value.user_agent!.length <= 512, true);
  }
});

Deno.test("constantTimeStringEqual accepts exact match", () => {
  assertStrictEquals(constantTimeStringEqual("secret", "secret"), true);
  assertStrictEquals(constantTimeStringEqual("", ""), true);
  const long = "x".repeat(256);
  assertStrictEquals(constantTimeStringEqual(long, long), true);
});

Deno.test("constantTimeStringEqual rejects mismatched strings of same length", () => {
  assertStrictEquals(constantTimeStringEqual("secret", "secrex"), false);
  assertStrictEquals(constantTimeStringEqual("aaaa", "aaab"), false);
});

Deno.test("constantTimeStringEqual rejects length mismatches without early return", () => {
  assertStrictEquals(constantTimeStringEqual("secret", "secretz"), false);
  assertStrictEquals(constantTimeStringEqual("a", ""), false);
  assertStrictEquals(constantTimeStringEqual("", "a"), false);
  // Very different lengths also return false.
  assertStrictEquals(constantTimeStringEqual("a", "a".repeat(100)), false);
});

Deno.test("constantTimeStringEqual handles multibyte UTF-8 correctly", () => {
  // 2-byte UTF-8 char "é" vs 1-byte ASCII "e" differ byte-wise even though
  // they look similar — make sure we compare bytes, not codepoints.
  assertStrictEquals(constantTimeStringEqual("café", "café"), true);
  assertStrictEquals(constantTimeStringEqual("café", "cafe"), false);
});
