# Phase 4 — `hi.exclu.at` marketing subdomain setup

> Part of the mailing overhaul spec #15. This runbook is **user-executed** (there is no code change). Follow the steps in order. Total elapsed time: ~30 minutes of active work + up to 24 h of DNS propagation wait.

## Why a dedicated subdomain

Marketing emails (campaigns sent via the Phase 5 bulk sender) have a higher risk of triggering spam complaints or bounces than transactional emails (password reset, purchase confirmation, link content delivery). When campaigns go out from `noreply@exclu.at`, every spam complaint hurts the reputation of the main domain — which is the same domain that sends **password reset emails**. A user who never receives a password reset because your campaign domain was silently greylisted is a locked-out user.

Standard practice is to isolate marketing traffic on a dedicated subdomain. We chose `hi.exclu.at` — friendly, short, matches a hoo.be-style tone.

**After this phase:**

- Transactional email (existing `send-auth-email`, `send-link-content-email`, `send-chatter-invitation`, `send-referral-invite`, `send-agency-contact`) continues to send from `noreply@exclu.at` (or whatever is already configured as `BREVO_SENDER_EMAIL`). No change.
- Marketing email (future Phase 5 `process-campaign-queue`) sends from `maria@hi.exclu.at` (or any other sender you create on the subdomain). Spam complaints on campaigns affect `hi.exclu.at` reputation only. `exclu.at` stays clean.

## Prerequisites

- [ ] Access to **GoDaddy DNS management** for `exclu.at`
- [ ] Access to **Brevo dashboard** (same account that currently sends Exclu transactional email)
- [ ] Access to **Supabase secrets** for the prod project (`qexnwezetjlbwltyccks`) — already configured, you know the drill
- [ ] ~30 minutes of attention; optional 24 h wait for DNS propagation

## Step 0 — Confirm current Brevo setup (optional, 2 min)

Before adding a new sender, sanity-check that the existing transactional setup is healthy:

1. Open Brevo → **Senders & IPs** → **Domains**
2. Confirm `exclu.at` is listed as a **verified** domain with DKIM + SPF green checkmarks
3. Confirm the existing sender (probably `noreply@exclu.at` or similar) is active

If anything is red here, stop and fix the existing domain first. Adding a new subdomain won't help if the parent domain is broken.

## Step 1 — Add `hi.exclu.at` to Brevo (5 min)

1. Brevo → **Senders & IPs** → **Domains** → **Add a domain**
2. Enter: `hi.exclu.at`
3. Check the box: **"I would like to authenticate this domain with my DNS records"** (this is what generates DKIM + BIMI records; leave the "Track your email campaigns" checkbox toggled as you prefer for open/click tracking)
4. Click **Save and continue**
5. Brevo presents a list of DNS records to add. **Copy them as-is** — we'll add them in GoDaddy in Step 2. The set typically includes:

   - 1 × **TXT record** for Brevo verification (host: `brevo-code.hi.exclu.at` OR just `hi.exclu.at`, value: `brevo-code:<unique-token>`)
   - 1 × **TXT record** for **DKIM** (host: `mail._domainkey.hi.exclu.at`, value: `v=DKIM1; k=rsa; p=<long-public-key>`) — Brevo generates this, DO NOT copy from this runbook, use the exact value Brevo gives you
   - 1 × **TXT record** for **SPF** (host: `hi.exclu.at`, value: `v=spf1 include:spf.brevo.com -all`)
   - 1 × **TXT record** for **DMARC** (host: `_dmarc.hi.exclu.at`, value: `v=DMARC1; p=none; rua=mailto:dmarc@exclu.at`) — recommended, Brevo may suggest a stricter policy later
   - Optionally 1 × **CNAME** for link tracking (host: e.g. `em.hi.exclu.at`, value: something like `custom.brevo.com`) — only if you enabled the tracking subdomain option

   **Leave the Brevo tab open.** You'll come back to click "Verify" after the DNS is live.

## Step 2 — Add DNS records in GoDaddy (10 min)

1. Log into **GoDaddy** → **My Products** → **DNS** for `exclu.at`
2. Scroll to **Records** → click **Add New Record**
3. For **each** record Brevo gave you in Step 1, add one entry in GoDaddy with these mappings:

   | Brevo says | GoDaddy field |
   |---|---|
   | Host / Name | **Name** (strip the `.exclu.at` suffix — GoDaddy appends it for you, so `mail._domainkey.hi.exclu.at` becomes `mail._domainkey.hi`) |
   | Type | **Type** (TXT or CNAME) |
   | Value / Target | **Value** (paste the full string, including quotes if Brevo showed them — though GoDaddy usually strips quotes on save) |
   | TTL | Leave as default (1 hour is fine) |

4. **IMPORTANT name-prefix gotcha**: GoDaddy expects the name **relative to the zone root** (`exclu.at`). So:

   | Brevo gave you | GoDaddy Name field |
   |---|---|
   | `hi.exclu.at` | `hi` |
   | `brevo-code.hi.exclu.at` | `brevo-code.hi` |
   | `mail._domainkey.hi.exclu.at` | `mail._domainkey.hi` |
   | `_dmarc.hi.exclu.at` | `_dmarc.hi` |
   | `em.hi.exclu.at` (CNAME) | `em.hi` |

   Miss the `.hi` suffix and you'll accidentally add the record at the APEX `exclu.at` level — which would either break your main domain's SPF/DKIM or be a no-op depending on what's there. Double-check each one before saving.

5. Click **Save** for each record
6. After all records are added, scroll through the DNS zone file in GoDaddy and visually verify you see ~4-5 new entries, all with names ending in `.hi` (except the bare `hi` TXT record for SPF)

## Step 3 — Wait for DNS propagation (0-24 h)

DNS propagation to Brevo's resolvers usually takes **5-30 minutes** for newly added records. The official max is 24 h because of TTL caching at intermediate resolvers.

**Test propagation from your terminal** before going back to Brevo:

```bash
# SPF (should return your new v=spf1 include:spf.brevo.com -all)
dig +short TXT hi.exclu.at

# DKIM (should return the v=DKIM1; k=rsa; p=... value from Brevo)
dig +short TXT mail._domainkey.hi.exclu.at

# DMARC (should return v=DMARC1; p=none; rua=...)
dig +short TXT _dmarc.hi.exclu.at

# Brevo verification (should return brevo-code:<your-token>)
dig +short TXT brevo-code.hi.exclu.at
```

If any of these returns empty, wait another 15 min and retry. If after 2 h they're still empty, you almost certainly have the name-prefix gotcha from Step 2.4 — go back to GoDaddy and check.

## Step 4 — Verify in Brevo (2 min)

1. Return to the Brevo tab you left open in Step 1
2. Click **Verify / Authenticate domain**
3. Brevo runs all the DNS checks and flips `hi.exclu.at` to **Authenticated** (green checkmarks on SPF, DKIM, DMARC)
4. If any check fails, Brevo tells you exactly which record is missing or malformed. Go back to Step 2.

**Do not skip this step.** Sending from an unverified sender domain will silently route emails to spam folders on Gmail / Outlook — the worst kind of failure because nothing is rejected, just quietly dropped.

## Step 5 — Create the campaign sender address (3 min)

1. Brevo → **Senders & IPs** → **Senders** → **Add a new sender**
2. Sender name: **Maria @ Exclu** (or your preferred friendly name — `Team @ Exclu`, `Hello from Exclu`, etc.)
3. Sender email: **`maria@hi.exclu.at`** (or `team@hi.exclu.at`, `hello@hi.exclu.at` — whatever you want the `FROM:` field to show)
4. Click **Save**

Note: this is **not a real mailbox**. You don't need GoDaddy email hosting. The address is only used as a `FROM:` header — all replies bounce-handle through Brevo's bounce webhook (configured in Phase 5), not an actual inbox.

**If you want replies to go somewhere**, create a **Reply-To** address in the sender settings pointing to a real inbox (e.g., `support@exclu.at` if that exists, or a Google Workspace address). Brevo handles the `Reply-To` header separately.

## Step 6 — Set Supabase secrets (2 min)

These secrets tell the Phase 5 campaign sender which sender identity to use. They're **separate** from the existing transactional secrets (`BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`), which stay untouched.

From your terminal, project linked to prod (`qexnwezetjlbwltyccks`):

```bash
cd /Users/tb/Documents/TB\ Dev/Exclu.at/Exclu

supabase secrets set \
  BREVO_CAMPAIGN_SENDER_EMAIL=maria@hi.exclu.at \
  BREVO_CAMPAIGN_SENDER_NAME="Maria @ Exclu"

# Verify they land
supabase secrets list | grep BREVO_CAMPAIGN
```

Replace `maria@hi.exclu.at` and `Maria @ Exclu` with whatever you created in Step 5.

## Step 7 — Send a test campaign through Brevo (5 min)

Before Phase 5 ships the automated campaign sender, do a one-off manual test from the Brevo UI:

1. Brevo → **Campaigns** → **Create a new email campaign**
2. Sender: select `Maria @ Exclu` (the sender you created in Step 5)
3. Recipients: a very small test list — your own email + 1-2 test addresses
4. Subject: `Test — hi.exclu.at reputation warmup`
5. Body: a short plain message. No images, no tracking pixels. Just "testing the new sender".
6. Send immediately

Check the inbox of each recipient:

- [ ] Email arrives in **Inbox** (not Promotions tab, not Spam)
- [ ] Sender shows as `Maria @ Exclu <maria@hi.exclu.at>`
- [ ] Open the email source / raw headers and look for:
   - `Authentication-Results: ... spf=pass ... dkim=pass ... dmarc=pass`
   - `DKIM-Signature: v=1; a=rsa-sha256; d=hi.exclu.at; ...`
   - Neither `spf=fail`, `dkim=fail`, nor `dmarc=fail`

If any authentication check fails, the domain is not properly set up — go back to Step 4 and re-verify.

## Step 8 — IP warmup (awareness, no action yet)

For the first 14 days after `hi.exclu.at` starts sending real campaign volume, you want to **ramp up gradually**. Gmail / Outlook reputation systems flag new domains that suddenly blast 10k emails from zero.

The Phase 5 bulk sender will implement a warmup ramp automatically:

- Day 1: 50 emails
- Day 2: 200 emails
- Day 3: 800 emails
- Day 4: 2000 emails
- Day 5: 5000 emails
- Day 6+: full volume

You don't do anything for this step — just **know** that when Phase 5 ships, it will throttle your first few campaigns even if you click "send to 10 000 fans". That's intentional.

## Step 9 — Update the CLAUDE.md project context (optional, 1 min)

So future Claude sessions know about the subdomain split, add this line to the `## Edge Functions` section of `CLAUDE.md`:

```markdown
- **Transactional sender**: `noreply@exclu.at` via `BREVO_SENDER_EMAIL` — used by send-auth-email, send-link-content-email, send-chatter-invitation, send-referral-invite, send-agency-contact
- **Campaign sender**: `maria@hi.exclu.at` via `BREVO_CAMPAIGN_SENDER_EMAIL` — used by Phase 5 process-campaign-queue (coming soon). Dedicated subdomain for reputation isolation.
```

## Rollback plan

If something goes wrong and you need to revert:

1. **Mid-setup failure (Brevo won't verify)**: just leave the subdomain in an unverified state. No email is sent from it until Step 6 secrets are set. No user impact.

2. **Secrets already set but Phase 5 not yet shipped**: unset the secrets:
   ```bash
   supabase secrets unset BREVO_CAMPAIGN_SENDER_EMAIL BREVO_CAMPAIGN_SENDER_NAME
   ```
   No impact — nothing in prod reads these yet.

3. **Phase 5 shipped and first campaign sent, then reputation issue**: pause campaigns in the admin UI, rotate the sender address to a different name (`maria2@hi.exclu.at`), keep sending. The subdomain itself is disposable — if `hi.exclu.at` gets blacklisted, we can spin up `mail.exclu.at` or similar in 30 min.

4. **DNS record cleanup** (if abandoning the subdomain permanently): remove all the `*.hi` records from GoDaddy. Any existing emails sent from `hi.exclu.at` will keep bouncing their authentication checks for the TTL window (1 h), then fail hard.

## Done

✅ `hi.exclu.at` is a fully authenticated marketing sender subdomain
✅ `maria@hi.exclu.at` is an active Brevo sender
✅ Supabase has the secrets Phase 5 needs
✅ Transactional email on `exclu.at` is completely unaffected

Phase 5 can now ship the bulk campaign sender and point it at `BREVO_CAMPAIGN_SENDER_EMAIL` without touching the transactional pipeline.
