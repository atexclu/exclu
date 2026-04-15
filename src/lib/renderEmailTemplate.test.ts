import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "./renderEmailTemplate";

describe("renderEmailTemplate (client)", () => {
  it("escapes HTML by default", () => {
    const out = renderEmailTemplate(
      { subject: "Hi {{name}}", html_body: "<p>{{name}}</p>", text_body: null, variables: [] },
      { name: "<b>" },
    );
    expect(out.html).toBe("<p>&lt;b&gt;</p>");
    expect(out.subject).toBe("Hi <b>");
  });

  it("supports {{{raw}}} blocks", () => {
    const out = renderEmailTemplate(
      { subject: "x", html_body: "<div>{{{block}}}</div>", text_body: null, variables: [] },
      { block: "<b>bold</b>" },
    );
    expect(out.html).toBe("<div><b>bold</b></div>");
  });

  it("does not resolve dot-notation placeholders", () => {
    // Must match the server renderer behavior (Task 0.2 fix)
    const out = renderEmailTemplate(
      { subject: "x", html_body: "<p>{{user.name}}</p>", text_body: null, variables: [] },
      { "user.name": "Alice" },
    );
    expect(out.html).toBe("<p>{{user.name}}</p>");
  });
});
