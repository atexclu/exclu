import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBucketKey, checkRateLimit } from "./rate_limit.ts";

Deno.test("buildBucketKey namespaces by scope and identifier", () => {
  assertEquals(
    buildBucketKey({ scope: "signup", identifier: "1.2.3.4" }),
    "signup:ip:1.2.3.4",
  );
  assertEquals(
    buildBucketKey({ scope: "campaign-send", identifier: "hi@x.com", subKey: "abc" }),
    "campaign-send:hi@x.com:abc",
  );
});

type RpcResult = { data: unknown; error: unknown };

function fakeClient(result: RpcResult): SupabaseClient {
  return {
    rpc: (_name: string, _params: unknown) => Promise.resolve(result),
  } as unknown as SupabaseClient;
}

Deno.test("checkRateLimit returns allowed=true when RPC returns true", async () => {
  const svc = fakeClient({ data: true, error: null });
  const out = await checkRateLimit(svc, {
    scope: "signup-ip",
    identifier: "1.2.3.4",
    limit: 5,
    windowSeconds: 3600,
  });
  assertEquals(out.allowed, true);
  assertEquals(out.key, "signup-ip:ip:1.2.3.4");
});

Deno.test("checkRateLimit returns allowed=false when RPC returns false (limit hit)", async () => {
  const svc = fakeClient({ data: false, error: null });
  const out = await checkRateLimit(svc, {
    scope: "signup-ip",
    identifier: "1.2.3.4",
    limit: 5,
    windowSeconds: 3600,
  });
  assertEquals(out.allowed, false);
});

Deno.test("checkRateLimit defaults to fail-OPEN on RPC error for backward compat", async () => {
  const svc = fakeClient({ data: null, error: { message: "rpc down" } });
  const out = await checkRateLimit(svc, {
    scope: "campaign-send",
    identifier: "hi@x.com",
    limit: 10,
    windowSeconds: 60,
  });
  assertEquals(out.allowed, true);
});

Deno.test("checkRateLimit with failClosed=true blocks on RPC error", async () => {
  const svc = fakeClient({ data: null, error: { message: "rpc down" } });
  const out = await checkRateLimit(svc, {
    scope: "signup-ip",
    identifier: "1.2.3.4",
    limit: 5,
    windowSeconds: 3600,
    failClosed: true,
  });
  assertEquals(out.allowed, false);
});

Deno.test("checkRateLimit with failClosed=false explicitly opts into fail-open on error", async () => {
  const svc = fakeClient({ data: null, error: { message: "rpc down" } });
  const out = await checkRateLimit(svc, {
    scope: "campaign-send",
    identifier: "hi@x.com",
    limit: 10,
    windowSeconds: 60,
    failClosed: false,
  });
  assertEquals(out.allowed, true);
});

Deno.test("checkRateLimit reports error flag separately from allowed", async () => {
  const svc = fakeClient({ data: null, error: { message: "boom" } });
  const out = await checkRateLimit(svc, {
    scope: "signup-ip",
    identifier: "1.2.3.4",
    limit: 5,
    windowSeconds: 3600,
    failClosed: true,
  });
  assertEquals(out.allowed, false);
  assertEquals(out.errored, true);
});
