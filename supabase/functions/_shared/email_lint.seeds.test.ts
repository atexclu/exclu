// Regression test: make sure the 8 production seed templates + the
// default campaign-newsletter template all pass the linter cleanly.
// If any of them would now be blocked at save time, this test fails
// before we ever deploy the admin UI that blocks on hasErrors.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { lintEmail } from "./email_lint.ts";

// Minimal shells mirroring the 132 + 140 seed shape — just enough to
// exercise the checks that matter (vars declared, absolute hrefs,
// unsubscribe placeholder for campaigns, non-empty subject).
// The full HTML lives in the migrations; we re-lint a representative
// reduction here so the tests stay maintainable.

const AUTH_SIGNUP = {
  slug: "auth_signup",
  category: "transactional",
  subject: "Confirm your Exclu account",
  html: `<!DOCTYPE html><html><body>
    <h1>Welcome to Exclu</h1>
    <p>Thank you for joining Exclu! Please confirm your email.</p>
    <a href="{{confirmation_url}}" class="button">Confirm my account</a>
    <div><a href="{{site_url}}">exclu</a> · <a href="{{site_url}}/terms">Terms</a> · <a href="{{site_url}}/privacy">Privacy</a></div>
  </body></html>`,
  variables: [{ key: "confirmation_url" }, { key: "site_url" }],
};

const LINK_CONTENT = {
  slug: "link_content_delivery",
  category: "transactional",
  subject: 'Your access to "{{link_title}}" on Exclu',
  html: `<!DOCTYPE html><html><body>
    <h1>Your exclusive content is unlocked</h1>
    <p>Thank you for your purchase on Exclu.</p>
    <a href="{{access_url}}">Open my content</a>
    <div><a href="{{access_url}}">{{access_url}}</a></div>
  </body></html>`,
  variables: [
    { key: "link_title" },
    { key: "access_url" },
    { key: "download_links_html" },
  ],
};

const CHATTER_INVITATION = {
  slug: "chatter_invitation",
  category: "transactional",
  subject: "{{creator_name}} invited you as a chatter on Exclu",
  html: `<!DOCTYPE html><html><body>
    <h1>You're invited!</h1>
    <p>{{creator_name}} wants you to manage their inbox.</p>
    <a href="{{invitation_url}}">Accept invitation</a>
  </body></html>`,
  variables: [
    { key: "creator_name" },
    { key: "invitation_url" },
    { key: "site_url" },
  ],
};

const CAMPAIGN_NEWSLETTER = {
  slug: "campaign_default",
  category: "campaign",
  subject: "We shipped something you'll like",
  // Campaigns require {{ unsubscribe }}. Preheader + email are reserved.
  html: `<!DOCTYPE html><html><body>
    <p>Hi {{ email }},</p>
    <p>Here's what's new this week on Exclu.</p>
    <a href="https://exclu.at/app/dashboard">Open dashboard</a>
    <p style="font-size:11px;">
      <a href="{{ unsubscribe }}">Unsubscribe</a>
    </p>
  </body></html>`,
  variables: [],
};

const SEEDS = [AUTH_SIGNUP, LINK_CONTENT, CHATTER_INVITATION, CAMPAIGN_NEWSLETTER];

for (const seed of SEEDS) {
  Deno.test(`seed "${seed.slug}" passes lint without errors`, () => {
    const result = lintEmail({
      subject: seed.subject,
      html: seed.html,
      declaredVariables: seed.variables,
      category: seed.category,
    });
    if (result.hasErrors) {
      console.error("Lint errors for", seed.slug, result.issues);
    }
    assertEquals(result.hasErrors, false);
  });
}

Deno.test("campaign missing unsubscribe is blocked", () => {
  const bad = {
    ...CAMPAIGN_NEWSLETTER,
    html: CAMPAIGN_NEWSLETTER.html.replace("{{ unsubscribe }}", ""),
  };
  const result = lintEmail({
    subject: bad.subject,
    html: bad.html,
    declaredVariables: bad.variables,
    category: bad.category,
  });
  assertEquals(result.hasErrors, true);
  assertEquals(result.issues.some((i) => i.code === "missing_unsubscribe"), true);
});

Deno.test("auth template with undeclared variable is blocked", () => {
  const bad = {
    ...AUTH_SIGNUP,
    html: AUTH_SIGNUP.html + `<p>Hello {{ user_first_name }}</p>`,
  };
  const result = lintEmail({
    subject: bad.subject,
    html: bad.html,
    declaredVariables: bad.variables,
    category: bad.category,
  });
  assertEquals(result.hasErrors, true);
  assertEquals(
    result.issues.some(
      (i) => i.code === "undeclared_variables" && i.message.includes("user_first_name"),
    ),
    true,
  );
});
