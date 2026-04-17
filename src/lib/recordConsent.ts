/**
 * Client helper for /functions/v1/record-consent.
 *
 * Capture the WHERE / HOW context around a marketing-consent grant and
 * ship it to the edge fn, which attaches IP + user-agent from request
 * headers and persists via upsert_mailing_contact. The Postgres trigger
 * handle_new_user() already creates a minimal mailing_contacts row at
 * signup time; this helper enriches it with legal_document_version_id,
 * consent_url, IP, UA, and the exact disclosure copy.
 *
 * Intentionally fire-and-forget: compliance telemetry must never block
 * the primary flow. Errors are logged but swallowed.
 */

import { supabase } from "@/lib/supabaseClient";

export type ConsentSource =
  | "signup"
  | "settings"
  | "link_purchase"
  | "tip"
  | "gift"
  | "custom_request"
  | "guest_chat";

export type ConsentLegalSlug =
  | "terms"
  | "privacy"
  | "cookies"
  | "marketing_consent";

export interface RecordConsentInput {
  email: string;
  source: ConsentSource;
  /** Associated entity id (purchase, user, etc.). Optional. */
  sourceRef?: string | null;
  role?: "fan" | "creator" | "agency" | "chatter" | "unknown";
  displayName?: string | null;
  /** Which legal doc the user was shown at consent time. */
  legalSlug?: ConsentLegalSlug;
  /** Verbatim checkbox/disclosure copy (for CNIL audit replay). */
  consentText?: string | null;
  /** Opt-in default is true; pass false to record an opt-out with context. */
  optedIn?: boolean;
}

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/record-consent`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export async function recordMarketingConsent(input: RecordConsentInput): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;

    const consentUrl = typeof window !== "undefined" ? window.location.href : "";

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    // The edge fn accepts anon callers only for source='signup'. When
    // available we send the user's JWT so cross-email calls are rejected.
    if (token) headers.authorization = `Bearer ${token}`;
    else if (ANON_KEY) headers.apikey = ANON_KEY;

    await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: input.email,
        source: input.source,
        source_ref: input.sourceRef ?? null,
        role: input.role ?? "unknown",
        display_name: input.displayName ?? null,
        consent_url: consentUrl,
        consent_text: input.consentText ?? null,
        legal_slug: input.legalSlug ?? null,
        marketing_opted_in: input.optedIn !== false,
      }),
    });
  } catch (err) {
    // Intentionally swallow — never block the primary signup / purchase
    // flow on a consent-telemetry failure.
    console.warn("[recordMarketingConsent] failed", err);
  }
}
