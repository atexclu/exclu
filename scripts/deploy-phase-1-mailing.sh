#!/usr/bin/env bash
#
# scripts/deploy-phase-1-mailing.sh
#
# Ordered deployment for Phase 1 of the mailing system overhaul.
# This script exists to prevent the "deploy edge functions before migrations
# land, get Template not found on every email send" failure mode.
#
# Usage:
#   ./scripts/deploy-phase-1-mailing.sh
#
# Prerequisites:
#   - supabase CLI installed and logged in
#   - Project is linked: `supabase link --project-ref qexnwezetjlbwltyccks`
#   - Current branch is feature/mailing-overhaul (or use --force-branch)
#   - No uncommitted changes
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars set (for post-deploy verification)
#   - SEND_EMAIL_HOOK_SECRET already configured in Supabase Secrets (see NEXT STEPS)
#
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; NC=$'\033[0m'
else
  GREEN=""; RED=""; YELLOW=""; BLUE=""; NC=""
fi

log() { echo "${BLUE}[deploy]${NC} $*"; }
ok()  { echo "${GREEN}  ✓${NC} $*"; }
err() { echo "${RED}  ✗${NC} $*" >&2; }
warn(){ echo "${YELLOW}  !${NC} $*"; }

FORCE_BRANCH=false
ALLOW_PROJECT_OVERRIDE=false
for arg in "$@"; do
  case "$arg" in
    --force-branch) FORCE_BRANCH=true ;;
    --allow-project-override) ALLOW_PROJECT_OVERRIDE=true ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
  esac
done

EXPECTED_PROJECT_REF="qexnwezetjlbwltyccks"

# ── Preconditions ─────────────────────────────────────────────────────
log "Checking preconditions…"

command -v supabase >/dev/null 2>&1 || { err "supabase CLI not in PATH"; exit 1; }
command -v curl >/dev/null 2>&1 || { err "curl not in PATH"; exit 1; }
command -v jq >/dev/null 2>&1 || { err "jq not in PATH"; exit 1; }
ok "required binaries present"

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  err "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
  err "Get them from: supabase projects api-keys --project-ref qexnwezetjlbwltyccks"
  exit 1
fi
ok "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "feature/mailing-overhaul" && "$FORCE_BRANCH" != "true" ]]; then
  err "Current branch is $CURRENT_BRANCH, expected feature/mailing-overhaul"
  err "Use --force-branch to override"
  exit 1
fi
ok "branch is $CURRENT_BRANCH"

if [[ -n "$(git status --porcelain)" ]]; then
  err "git status is not clean — commit or stash first"
  git status --short >&2
  exit 1
fi
ok "git status clean"

# Verify supabase linked project
LINKED_REF=$(supabase projects list 2>/dev/null | awk '/●/ {print $6}' | head -1 || true)
if [[ -z "$LINKED_REF" ]]; then
  err "Could not determine linked project ref. Run: supabase link --project-ref $EXPECTED_PROJECT_REF"
  exit 1
fi
log "Linked project: $LINKED_REF"

if [[ "$LINKED_REF" != "$EXPECTED_PROJECT_REF" ]]; then
  if [[ "$ALLOW_PROJECT_OVERRIDE" == "true" ]]; then
    warn "Linked to $LINKED_REF (expected $EXPECTED_PROJECT_REF) — override enabled"
  else
    err "Linked to project $LINKED_REF, expected $EXPECTED_PROJECT_REF"
    err "Run: supabase link --project-ref $EXPECTED_PROJECT_REF"
    err "Or pass --allow-project-override to bypass (staging deploys only)"
    exit 1
  fi
else
  ok "linked to $LINKED_REF (matches expected)"
fi

# ── Confirmation ──────────────────────────────────────────────────────
echo
echo "${YELLOW}About to deploy Phase 1 mailing to production: $LINKED_REF${NC}"
echo "This will:"
echo "  1. Push pending migrations (130, 131, 132, 133)"
echo "  2. Verify the 8 seeded email templates landed in prod"
echo "  3. Verify public.is_admin() exists"
echo "  4. Deploy 5 refactored edge functions"
echo "  5. Deploy admin-email-templates"
echo
read -rp "Type 'yes' to continue: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  log "Aborted."
  exit 0
fi

# ── Step 1: migrations ────────────────────────────────────────────────
log "Step 1/5: pushing migrations…"
if ! supabase db push --linked; then
  err "Migration push failed. Fix and rerun."
  exit 1
fi
ok "migrations applied"

# ── Step 2: verify templates seeded ───────────────────────────────────
log "Step 2/5: verifying seeded templates in prod…"

REQUIRED_SLUGS=(
  auth_signup
  auth_recovery
  auth_magiclink
  auth_email_change
  link_content_delivery
  chatter_invitation
  referral_invite
  agency_contact
)

for slug in "${REQUIRED_SLUGS[@]}"; do
  response=$(curl -sS \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
    "$SUPABASE_URL/rest/v1/email_templates?select=slug&slug=eq.$slug")
  if ! echo "$response" | jq -e 'type == "array"' >/dev/null 2>&1; then
    err "Unexpected PostgREST response for $slug: $response"
    err "Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars."
    exit 1
  fi
  count=$(echo "$response" | jq 'length')
  if [[ "$count" != "1" ]]; then
    err "template $slug missing in prod DB (count=$count, response=$response)"
    err "Check migration 132 application. Aborting before edge function deploy."
    exit 1
  fi
  ok "template $slug present"
done

# Sanity-check that chatter_invitation has the new variables from migration 133
chatter_response=$(curl -sS \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/email_templates?select=variables&slug=eq.chatter_invitation")
if ! echo "$chatter_response" | jq -e 'type == "array"' >/dev/null 2>&1; then
  err "Unexpected PostgREST response for chatter_invitation: $chatter_response"
  err "Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars."
  exit 1
fi
chatter_vars=$(echo "$chatter_response" | jq '.[0].variables')
if ! echo "$chatter_vars" | jq -e '.[] | select(.key == "custom_message_html")' >/dev/null; then
  err "chatter_invitation missing custom_message_html variable — migration 133 didn't apply?"
  exit 1
fi
ok "chatter_invitation has restored variables (migration 133 applied)"

# ── Step 3: verify public.is_admin() ──────────────────────────────────
log "Step 3/5: verifying public.is_admin() function exists…"
# Invoke the function via the PostgREST RPC endpoint. is_admin() takes no args
# and returns a boolean. We expect either `true`/`false` (function works, returns
# false because service-role auth.uid() is null) or a 400/404 with an error
# (function missing). We accept any successful HTTP response as proof the
# function is callable.
rpc_response=$(curl -sS -w $'\nHTTP_STATUS:%{http_code}' \
  -X POST \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$SUPABASE_URL/rest/v1/rpc/is_admin")
rpc_body="${rpc_response%$'\n'HTTP_STATUS:*}"
rpc_status="${rpc_response##*HTTP_STATUS:}"

if [[ "$rpc_status" != "200" ]]; then
  err "public.is_admin() RPC failed (HTTP $rpc_status): $rpc_body"
  err "Check migration 122 / 123 application on prod."
  exit 1
fi
ok "public.is_admin() callable (returned $rpc_body)"

# ── Step 4: deploy refactored edge functions ──────────────────────────
log "Step 4/5: deploying refactored edge functions…"

FUNCTIONS=(
  send-auth-email
  send-link-content-email
  send-chatter-invitation
  send-referral-invite
  send-agency-contact
)

for fn in "${FUNCTIONS[@]}"; do
  log "  deploying $fn…"
  if ! supabase functions deploy "$fn"; then
    err "$fn deploy failed. Previous functions are already live."
    err "Consider rolling back via: git checkout main -- supabase/functions/$fn && supabase functions deploy $fn"
    exit 1
  fi
  ok "$fn deployed"
done

# ── Step 5: deploy admin-email-templates ──────────────────────────────
log "Step 5/5: deploying admin-email-templates…"
if ! supabase functions deploy admin-email-templates; then
  err "admin-email-templates deploy failed. Templates are still live for the refactored functions."
  exit 1
fi
ok "admin-email-templates deployed"

# ── Done ──────────────────────────────────────────────────────────────
echo
echo "${GREEN}✓ Phase 1 deployment complete on $LINKED_REF${NC}"
echo
echo "${YELLOW}NEXT STEPS (manual):${NC}"
echo
echo "  1. Set the auth webhook secret in Supabase Secrets if not already:"
echo "       supabase secrets set SEND_EMAIL_HOOK_SECRET=\"v1,whsec_...\""
echo "     (get the value from Supabase Dashboard → Authentication → Hooks → Send Email)"
echo
echo "  2. Deploy the frontend:"
echo "       git push origin feature/mailing-overhaul"
echo "       (or merge to main for Vercel auto-deploy)"
echo
echo "  3. Run the E2E verification from the Phase 1 runbook:"
echo "       docs/ops/phase-1-mailing-templates-deploy.md → Task 1.11"
echo
echo "  4. Monitor Supabase function logs for 'Template not found' errors (should be zero)."
echo
