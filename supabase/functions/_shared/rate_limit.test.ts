import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBucketKey } from "./rate_limit.ts";

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
