import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderTemplate, type EmailTemplateRow } from "./email_templates.ts";

const base: EmailTemplateRow = {
  slug: "welcome",
  subject: "Welcome {{name}}",
  html_body: "<p>Hi {{name}}, visit <a href=\"{{url}}\">your dashboard</a></p>",
  text_body: "Hi {{name}}, visit {{url}}",
  variables: [
    { key: "name", required: true },
    { key: "url", required: true },
  ],
};

Deno.test("substitutes variables and HTML-escapes them", () => {
  const out = renderTemplate(base, { name: "<Alice>", url: "https://x.com" });
  assertEquals(out.subject, "Welcome <Alice>"); // subject is plain text
  assertEquals(
    out.html,
    "<p>Hi &lt;Alice&gt;, visit <a href=\"https://x.com\">your dashboard</a></p>"
  );
  assertEquals(out.text, "Hi <Alice>, visit https://x.com");
});

Deno.test("throws if a required variable is missing", () => {
  assertThrows(
    () => renderTemplate(base, { name: "Alice" }),
    Error,
    "Missing required variable: url",
  );
});

Deno.test("raw block skips escaping for known-safe HTML", () => {
  const tpl: EmailTemplateRow = {
    ...base,
    html_body: "<div>{{{html_block}}}</div>",
    variables: [{ key: "html_block", required: true }],
  };
  const out = renderTemplate(tpl, { html_block: "<b>bold</b>" });
  assertEquals(out.html, "<div><b>bold</b></div>");
});
