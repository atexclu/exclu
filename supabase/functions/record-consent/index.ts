// supabase/functions/record-consent/index.ts
//
// Phase 6.4 — Capture HTTP context (IP, user-agent, full URL) at the
// moment a user grants marketing consent, and persist it via
// upsert_mailing_contact with a reference to the live legal document
// versions (Terms / Privacy / marketing_consent clause).
//
// Rationale: the Postgres trigger handle_new_user() captures consent at
// signup but has NO access to req.ip / user-agent / full URL — so the
// consent record is traceable by WHEN and WHO but not by WHERE or HOW.
// This edge fn closes that gap; it is called from the client right after
// signup or when the user explicitly opts back in via the settings toggle.
//
// Callers (all client-side):
//   - /auth signup success handler   → { source: 'signup', email, legal_slug: 'terms' }
//   - /fan/signup success handler    → { source: 'signup', email, legal_slug: 'terms' }
//   - /auth/chatter signup success   → { source: 'signup', email, legal_slug: 'terms' }
//   - Checkouts (optional)           → { source: 'link_purchase' | 'tip' | 'gift' | 'request', email, legal_slug: 'marketing_consent' }
//   - Settings opt-in toggle         → { source: 'settings', email, legal_slug: 'marketing_consent' }
//
// Auth: the caller must already be authenticated (Supabase JWT in
// Authorization header) OR the email must match the caller's own email.
// Anonymous callers are allowed only for the 'signup' source, and must
// supply the email being signed up; IP + UA still get captured.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors, jsonError, jsonOk } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("VITE_SUPABASE_ANON_KEY") ?? "";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const ANONYMOUS_SOURCES = new Set(["signup"]);

const VALID_ROLES = new Set(["fan", "creator", "agency", "chatter", "unknown"]);

interface RecordConsentBody {
  email: string;
  source: string;                        // 'signup' | 'settings' | 'link_purchase' | ...
  source_ref?: string | null;            // optional entity id (purchase_id, user_id)
  role?: string;                         // fan | creator | ...
  display_name?: string | null;
  consent_url: string;                   // client-supplied (window.location.href)
  consent_text?: string | null;          // exact checkbox / disclosure copy
  legal_slug?: string | null;            // which legal doc (terms|privacy|marketing_consent)
  marketing_opted_in?: boolean;          // default true
}

/** Best-effort client IP. Prefer Vercel-style x-forwarded-for over Fly/Deno Deploy's x-real-ip. */
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // XFF may be a comma-separated list; the first entry is the originating client.
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xReal = req.headers.get("x-real-ip");
  if (xReal) return xReal.trim();
  // Supabase Edge exposes the Deno Deploy client IP on this header.
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return null;
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return jsonError("method_not_allowed", 405, cors);

  let body: RecordConsentBody;
  try {
    body = (await req.json()) as RecordConsentBody;
  } catch {
    return jsonError("invalid_body", 400, cors);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const source = String(body.source ?? "").trim();
  const consentUrl = String(body.consent_url ?? "").trim();
  if (!email || !email.includes("@")) return jsonError("bad_email", 400, cors);
  if (!source) return jsonError("source_required", 400, cors);
  if (!consentUrl || consentUrl.length > 1000) return jsonError("bad_consent_url", 400, cors);

  // Auth: require a JWT unless the source is in the anonymous allowlist.
  // For 'signup', the user has just created their account and may not
  // have a live session yet — we still capture consent but verify the
  // email is plausible.
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

  let authedEmail: string | null = null;
  if (jwt) {
    try {
      const authed = createClient(supabaseUrl, anonKey || serviceRoleKey);
      const { data: { user } } = await authed.auth.getUser(jwt);
      if (user?.email) authedEmail = user.email.trim().toLowerCase();
    } catch {
      // fall through — treated as anonymous below
    }
  }

  if (!authedEmail && !ANONYMOUS_SOURCES.has(source)) {
    return jsonError("unauthorized", 401, cors);
  }
  if (authedEmail && authedEmail !== email) {
    // A signed-in user can only record consent for their own email.
    return jsonError("email_mismatch", 403, cors);
  }

  const role = VALID_ROLES.has(String(body.role ?? "")) ? String(body.role) : "unknown";
  const optedIn = body.marketing_opted_in !== false;                    // default true
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent") ?? null;

  // Resolve the live legal document version id from slug, if provided.
  let legalVersionId: string | null = null;
  if (body.legal_slug) {
    const { data, error } = await admin.rpc("current_legal_version", { p_slug: body.legal_slug });
    if (!error && data) legalVersionId = data as string;
  }

  const { error } = await admin.rpc("upsert_mailing_contact", {
    p_email: email,
    p_source: source,
    p_source_ref: body.source_ref ?? null,
    p_role: role,
    p_display_name: body.display_name ?? null,
    p_marketing_opted_in: optedIn,
    p_ip: ip,
    p_user_agent: userAgent,
    p_consent_url: consentUrl,
    p_consent_text: body.consent_text ?? null,
    p_legal_version_id: legalVersionId,
  });

  if (error) {
    console.error("[record-consent] upsert failed", error);
    return jsonError("upsert_failed", 500, cors);
  }

  return jsonOk({ ok: true, legal_version_id: legalVersionId }, cors);
});
