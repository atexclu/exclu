import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  verifyStandardWebhook,
  WebhookVerificationError,
  parseWebhookSecret,
  _signForTest,
} from "./standardwebhooks.ts";

// A realistic Supabase-format secret: "v1,whsec_" + 32 bytes of base64
// (32 bytes of zeroes base64-encoded = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
const SECRET = "v1,whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function h(init: Record<string, string>): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(init)) headers.set(k, v);
  return headers;
}

Deno.test("parseWebhookSecret handles all 3 secret formats", () => {
  const a = parseWebhookSecret("v1,whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  const b = parseWebhookSecret("whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  const c = parseWebhookSecret("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  assertEquals(a.length, 32);
  assertEquals(b.length, 32);
  assertEquals(c.length, 32);
  // All three should produce the same bytes
  for (let i = 0; i < 32; i++) {
    assertEquals(a[i], b[i]);
    assertEquals(a[i], c[i]);
  }
});

Deno.test("valid signature passes", async () => {
  const id = "msg_1";
  const ts = "1766000000";
  const body = '{"hello":"world"}';
  const sig = await _signForTest(id, ts, body, SECRET);
  await verifyStandardWebhook({
    headers: h({
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": sig,
    }),
    rawBody: body,
    secret: SECRET,
    nowMs: Number(ts) * 1000,
  });
});

Deno.test("tampered body is rejected", async () => {
  const id = "msg_1";
  const ts = "1766000000";
  const sig = await _signForTest(id, ts, '{"hello":"world"}', SECRET);
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-id": id,
          "webhook-timestamp": ts,
          "webhook-signature": sig,
        }),
        rawBody: '{"hello":"evil"}', // tampered
        secret: SECRET,
        nowMs: Number(ts) * 1000,
      }),
    WebhookVerificationError,
    "Invalid webhook signature",
  );
});

Deno.test("stale timestamp is rejected", async () => {
  const id = "msg_1";
  const ts = "1766000000";
  const body = "{}";
  const sig = await _signForTest(id, ts, body, SECRET);
  // now is 10 minutes after ts — beyond 5 min tolerance
  const nowMs = (Number(ts) + 600) * 1000;
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-id": id,
          "webhook-timestamp": ts,
          "webhook-signature": sig,
        }),
        rawBody: body,
        secret: SECRET,
        nowMs,
      }),
    WebhookVerificationError,
    "out of tolerance",
  );
});

Deno.test("future timestamp beyond tolerance is rejected", async () => {
  const id = "msg_1";
  const ts = "1766000000";
  const body = "{}";
  const sig = await _signForTest(id, ts, body, SECRET);
  const nowMs = (Number(ts) - 600) * 1000; // server 10 min behind client
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-id": id,
          "webhook-timestamp": ts,
          "webhook-signature": sig,
        }),
        rawBody: body,
        secret: SECRET,
        nowMs,
      }),
    WebhookVerificationError,
  );
});

Deno.test("missing webhook-id header is rejected", async () => {
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-timestamp": "1766000000",
          "webhook-signature": "v1,abc=",
        }),
        rawBody: "{}",
        secret: SECRET,
        nowMs: 1766000000000,
      }),
    WebhookVerificationError,
    "webhook-id",
  );
});

Deno.test("missing webhook-timestamp header is rejected", async () => {
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-id": "msg_1",
          "webhook-signature": "v1,abc=",
        }),
        rawBody: "{}",
        secret: SECRET,
        nowMs: 1766000000000,
      }),
    WebhookVerificationError,
    "webhook-timestamp",
  );
});

Deno.test("missing webhook-signature header is rejected", async () => {
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-id": "msg_1",
          "webhook-timestamp": "1766000000",
        }),
        rawBody: "{}",
        secret: SECRET,
        nowMs: 1766000000000,
      }),
    WebhookVerificationError,
    "webhook-signature",
  );
});

Deno.test("multiple signatures in header — one valid is accepted", async () => {
  const id = "msg_1";
  const ts = "1766000000";
  const body = "{}";
  const validSig = await _signForTest(id, ts, body, SECRET);
  // Simulate multi-signature header: one bogus, one real
  const header = `v1,bogusbogusbogusbogusbogusbogusbogus= ${validSig}`;
  await verifyStandardWebhook({
    headers: h({
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": header,
    }),
    rawBody: body,
    secret: SECRET,
    nowMs: Number(ts) * 1000,
  });
});

Deno.test("wrong secret is rejected", async () => {
  const id = "msg_1";
  const ts = "1766000000";
  const body = "{}";
  const sig = await _signForTest(id, ts, body, SECRET);
  const wrongSecret = "v1,whsec_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=";
  await assertRejects(
    () =>
      verifyStandardWebhook({
        headers: h({
          "webhook-id": id,
          "webhook-timestamp": ts,
          "webhook-signature": sig,
        }),
        rawBody: body,
        secret: wrongSecret,
        nowMs: Number(ts) * 1000,
      }),
    WebhookVerificationError,
    "Invalid webhook signature",
  );
});
