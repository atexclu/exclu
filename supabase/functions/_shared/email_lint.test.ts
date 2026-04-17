import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lintEmail } from "./email_lint.ts";

const MINIMAL_HTML = `<!DOCTYPE html><html><body>
<p>Hello {{ name }}, visit <a href="https://exclu.at">Exclu</a>.</p>
{{ unsubscribe }}
</body></html>`;

Deno.test("clean transactional template → no errors", () => {
  const result = lintEmail({
    subject: "Welcome",
    html: MINIMAL_HTML,
    declaredVariables: [{ key: "name" }],
    category: "transactional",
  });
  assertEquals(result.hasErrors, false);
});

Deno.test("empty subject is an error", () => {
  const result = lintEmail({ subject: "", html: "<p>hi</p>", category: "transactional" });
  assertEquals(result.hasErrors, true);
  assertEquals(result.issues.some((i) => i.code === "subject_empty"), true);
});

Deno.test("empty HTML is an error", () => {
  const result = lintEmail({ subject: "x", html: "  ", category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "html_empty"), true);
});

Deno.test("subject over 80 chars → warning", () => {
  const long = "x".repeat(85);
  const result = lintEmail({ subject: long, html: "<p>hi</p>", category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "subject_long"), true);
  assertEquals(result.hasErrors, false);
});

Deno.test("subject over 200 chars → error", () => {
  const veryLong = "x".repeat(210);
  const result = lintEmail({ subject: veryLong, html: "<p>hi</p>", category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "subject_too_long"), true);
  assertEquals(result.hasErrors, true);
});

Deno.test("undeclared variable is an error", () => {
  const result = lintEmail({
    subject: "Hi {{ name }}",
    html: "<p>Order {{ order_id }}</p>",
    declaredVariables: [],
    category: "transactional",
  });
  const orphan = result.issues.find((i) => i.code === "undeclared_variables");
  assertEquals(!!orphan, true);
  assertEquals(result.hasErrors, true);
});

Deno.test("reserved variables {{ unsubscribe }} / {{ email }} are never orphans", () => {
  const result = lintEmail({
    subject: "Hello {{ email }}",
    html: `<p>Hi! <a href="{{ unsubscribe }}">unsub</a></p>`,
    declaredVariables: [],
    category: "campaign",
  });
  assertEquals(result.issues.some((i) => i.code === "undeclared_variables"), false);
});

Deno.test("campaign without {{ unsubscribe }} placeholder is an error", () => {
  const result = lintEmail({
    subject: "Our news",
    html: `<p>Hello.</p>`,
    declaredVariables: [],
    category: "campaign",
  });
  assertEquals(result.issues.some((i) => i.code === "missing_unsubscribe"), true);
  assertEquals(result.hasErrors, true);
});

Deno.test("transactional without {{ unsubscribe }} is fine", () => {
  const result = lintEmail({
    subject: "Receipt",
    html: `<p>Thanks for your purchase.</p>`,
    category: "transactional",
  });
  assertEquals(result.issues.some((i) => i.code === "missing_unsubscribe"), false);
});

Deno.test("unclosed <html> is an error", () => {
  const result = lintEmail({
    subject: "x",
    html: "<html><body><p>hi</p></body>",
    category: "transactional",
  });
  const unclosed = result.issues.filter((i) => i.code === "unclosed_tag");
  assertEquals(unclosed.some((i) => i.message.includes("<html>")), true);
  assertEquals(result.hasErrors, true);
});

Deno.test("self-closing <br/> is not counted as unclosed", () => {
  const result = lintEmail({
    subject: "x",
    html: "<html><body><p>hi<br/>there</p></body></html>",
    category: "transactional",
  });
  assertEquals(result.issues.some((i) => i.code === "unclosed_tag"), false);
});

Deno.test("img without alt is a warning", () => {
  const result = lintEmail({
    subject: "x",
    html: `<html><body><p>logo</p><img src="https://x.com/a.png"></body></html>`,
    category: "transactional",
  });
  assertEquals(result.issues.some((i) => i.code === "images_missing_alt"), true);
  assertEquals(result.hasErrors, false);
});

Deno.test("img with alt is fine", () => {
  const result = lintEmail({
    subject: "x",
    html: `<html><body><img src="https://x.com/a.png" alt="logo"></body></html>`,
    category: "transactional",
  });
  assertEquals(result.issues.some((i) => i.code === "images_missing_alt"), false);
});

Deno.test("relative href is a warning", () => {
  const result = lintEmail({
    subject: "x",
    html: `<html><body><a href="/docs">click</a></body></html>`,
    category: "transactional",
  });
  assertEquals(result.issues.some((i) => i.code === "relative_hrefs"), true);
});

Deno.test("mailto: / tel: / anchor hrefs are not flagged", () => {
  const html = `<html><body>
    <a href="mailto:x@y.com">mail</a>
    <a href="tel:+123">call</a>
    <a href="#top">top</a>
    <a href="https://exclu.at">site</a>
  </body></html>`;
  const result = lintEmail({ subject: "x", html, category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "relative_hrefs"), false);
});

Deno.test("href containing placeholder is not flagged", () => {
  const result = lintEmail({
    subject: "x",
    html: `<html><body><a href="{{ url }}">x</a></body></html>`,
    declaredVariables: [{ key: "url" }],
    category: "transactional",
  });
  assertEquals(result.issues.some((i) => i.code === "relative_hrefs"), false);
});

Deno.test("huge HTML over 250KB is an error", () => {
  const big = "<p>" + "a".repeat(260_000) + "</p>";
  const result = lintEmail({ subject: "x", html: `<html><body>${big}</body></html>`, category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "html_too_large"), true);
  assertEquals(result.hasErrors, true);
});

Deno.test("HTML between 102KB and 250KB is a warning", () => {
  const mid = "<p>" + "a".repeat(120_000) + "</p>";
  const result = lintEmail({ subject: "x", html: `<html><body>${mid}</body></html>`, category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "html_large"), true);
  assertEquals(result.hasErrors, false);
});

Deno.test("unused declared variable is info-level", () => {
  const result = lintEmail({
    subject: "Hi",
    html: "<p>hello</p>",
    declaredVariables: [{ key: "unused_var" }],
    category: "transactional",
  });
  const info = result.issues.find((i) => i.code === "unused_variables");
  assertEquals(info?.severity, "info");
  assertEquals(result.hasErrors, false);
});

Deno.test("text-heavy email passes ratio check", () => {
  const html = `<html><body><p>${"Lorem ipsum dolor sit amet ".repeat(50)}</p></body></html>`;
  const result = lintEmail({ subject: "x", html, category: "transactional" });
  assertEquals(result.issues.some((i) => i.code === "low_text_ratio"), false);
});
