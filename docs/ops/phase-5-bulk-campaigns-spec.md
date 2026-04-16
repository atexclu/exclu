# Phase 5 — Bulk campaigns (spec d'implémentation)

Date : 2026-04-16. Ce doc fige les décisions d'architecture pour l'UI admin
campagnes (Phase 5). **Avant d'écrire du code, relire tout.** Des décisions
arrêtées sont marquées ❌ : ne pas les remettre en question sans motif fort.

## Principe directeur

L'admin Exclu **ne va jamais sur Brevo** sauf pour consulter les stats de
délivrabilité globales (domain reputation, feedback loops). Toute la
configuration utile se fait depuis `/admin/emails/campaigns`.

Une seule identité d'expédition, un seul reply-to, tracking toujours activé,
unsubscribe toujours via notre endpoint → c'est ce qui protège la réputation
du subdomain `hi.exclu.at` qui vient d'être warmup.

## Paramètres FIXES (secrets / code, pas d'UI)

| Paramètre | Source |
|---|---|
| `sender.email` | Supabase secret `BREVO_CAMPAIGN_SENDER_EMAIL` → `maria@hi.exclu.at` |
| `sender.name` | Supabase secret `BREVO_CAMPAIGN_SENDER_NAME` → `Maria from Exclu` |
| `replyTo.email` | Supabase secret `BREVO_CAMPAIGN_REPLY_TO` → `contact@exclu.at` |
| `replyTo.name` | Réutiliser `sender.name` |
| Tracking ouvertures + clics | Toujours activé |
| URL unsubscribe | **TOUJOURS** `https://exclu.at/unsubscribe?token=<HMAC>` via `api/unsubscribe` (Phase 4.5) |
| UTM auto | `utm_source=email&utm_medium=campaign&utm_campaign=<campaign.slug>` injecté dans tous les `<a href>` avant envoi |
| Warmup start | Supabase secret `EMAIL_WARMUP_START_DATE` → `2026-04-16` |

Tous ces secrets sont déjà en place côté Supabase (vérifié session 2026-04-16).

## Paramètres EXPOSÉS dans l'UI admin (par campagne)

Table `email_campaigns` + formulaire admin :

| Champ UI | Colonne DB | Type | Obligatoire |
|---|---|---|---|
| Nom interne | `name` | text | ✅ |
| Objet email | `subject` | text ≤ 150 | ✅ |
| Preview text (préheader) | `preheader` | text ≤ 200 | non |
| Contenu HTML | `html_content` | text | ✅ |
| Segment (règles) | `segment_id` FK | uuid | ✅ |
| Date d'envoi | `scheduled_at` | timestamptz nullable | non (NULL = envoi manuel) |
| Tag regroupement stats | `tag` | text nullable | non |

### Segment builder

UI séparée, réutilisable. Filtres sur `mailing_contacts_with_account` :
- `role IN (…)`
- `marketing_opted_in = true` (**toujours forcé**, non désactivable)
- `has_account = bool` (optionnel)
- `last_seen_at >= <date>` (optionnel)
- `first_source IN (…)` (optionnel)

Compteur live du nombre de contacts matchés. Sauvegardable comme segment
nommé (`email_campaign_segments` table).

### Boutons du formulaire

- `[Prévisualiser]` — modale avec rendu HTML + macros de test injectées
- `[Test send]` — envoi à l'email admin courant (ou input libre) sans passer par la queue
- `[Sauvegarder comme brouillon]` — `status = 'draft'`
- `[Programmer / Envoyer]` — `status = 'scheduled'` ou `'sending'`, cron de drain

## Paramètres NON exposés (décisions arrêtées)

- ❌ Personnalisation "Envoyer à" → auto `{{ contact.PRENOM }}` dans le template
- ❌ GA tracking manuel → UTM auto-injectés côté code
- ❌ Pièces jointes → jamais en mass mail (risque spam + rendu lent)
- ❌ Date d'expiration → pas de use case
- ❌ Formulaire de mise à jour profil Brevo → remplacé par notre page
  `/app/profile` → Security → Communications (Phase 4.5)
- ❌ Sender (From) par campagne → toujours `maria@hi.exclu.at`
  (une seule identité = meilleure warmup domaine)
- ❌ Reply-to par campagne → toujours `contact@exclu.at`
- ❌ Lien "Afficher dans le navigateur" → auto-injecté si HTML complet fourni

## Dépendances Phase 4.5 (déjà livrées)

- `POST /api/unsubscribe` accepte token HMAC ✅
- Page publique `/unsubscribe?token=<…>` FR + success/error states ✅
- Helpers partagés pour signer : `api/_shared/unsubscribeToken.ts` (Node)
  et `supabase/functions/_shared/unsubscribe_token.ts` (Deno) ✅
- Secret `UNSUBSCRIBE_HMAC_SECRET` set côté Supabase + Vercel ✅
- RPC `set_mailing_opt_in(p_opted_in)` pour le toggle settings ✅
- Colonnes traceability `marketing_opted_in_at`, `marketing_opt_in_source` ✅

Le token unique par destinataire est généré **à l'envoi de chaque campagne**
via `signUnsubscribeToken(email)` (Deno helper) et remplace le placeholder
`{{ unsubscribe }}` dans le HTML avant l'API call Brevo.

## Schéma DB (migration 139 à écrire)

```sql
-- 139_email_campaigns.sql

create table public.email_campaign_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rules jsonb not null,  -- { role: ['creator'], marketing_opted_in: true, … }
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  preheader text,
  html_content text not null,
  segment_id uuid references email_campaign_segments(id),
  tag text,
  status text check (status in ('draft','scheduled','sending','sent','cancelled','failed'))
    default 'draft',
  scheduled_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  total_recipients int,
  brevo_campaign_id bigint,  -- Brevo's internal ID
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references email_campaigns(id) on delete cascade,
  email text not null,
  status text check (status in
    ('queued','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed'))
    default 'queued',
  brevo_message_id text,
  sent_at timestamptz,
  last_event_at timestamptz,
  error text
);
create index on public.email_campaign_sends (campaign_id, status);
create index on public.email_campaign_sends (email);

create table public.email_campaign_events (
  id uuid primary key default gen_random_uuid(),
  send_id uuid references email_campaign_sends(id) on delete cascade,
  event_type text not null,  -- open, click, bounce, complaint, unsubscribe
  occurred_at timestamptz not null,
  meta jsonb
);
create index on public.email_campaign_events (send_id, occurred_at);

-- RLS admin-only partout via public.is_admin()
alter table public.email_campaign_segments enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_sends enable row level security;
alter table public.email_campaign_events enable row level security;

-- (policies admin-only comme pour mailing_contacts)
```

## Warmup ramp — algorithme

Cron d'envoi limite le nombre d'emails par jour glissant :

```
days_since_start = today() - EMAIL_WARMUP_START_DATE
if days_since_start <= 14:
  MAX_SENDS_PER_DAY = max(50, 100 * floor(days_since_start / 2))
  # J1=50, J2=50, J3=100, J5=200, J7=300, J9=400, J11=500, J13=600, J14=700
else:
  MAX_SENDS_PER_DAY = 5000  # augmentable via secret
```

Si une campagne dépasse le cap du jour, elle reprend automatiquement le
lendemain (queue persistante dans `email_campaign_sends`).

## Flux d'envoi

1. Admin crée campaign + segment → status `draft`
2. Admin clique "Programmer" → status `scheduled`, `scheduled_at` set
3. Admin clique "Envoyer" (ou scheduled_at atteint) → status `sending`,
   résolution segment → insert `email_campaign_sends` rows (status `queued`)
4. Cron Vercel (toutes les minutes) :
   - Lit les sends `queued`
   - Applique cap warmup du jour
   - Pour chaque send : générer `{{ unsubscribe }}` avec HMAC, injecter UTM,
     POST vers Brevo API
   - Update send status `sent` + `brevo_message_id`
5. Brevo webhook → `POST /api/brevo-webhook.ts` ingère open/click/bounce/
   complaint/unsubscribe events dans `email_campaign_events` + flip
   `mailing_contacts.marketing_opted_in=false` sur unsubscribe/complaint
6. 3-strike auto opt-out : 3 hard bounces ou 1 complaint → flip opted_in=false

## Checklist avant première campagne bulk prod

- [ ] Migration 139 appliquée
- [ ] `/admin/emails/campaigns` UI + segment builder livrés
- [ ] Cron Vercel `api/cron/drain-campaigns.ts` actif
- [ ] Webhook `api/brevo-webhook.ts` configuré dans Brevo dashboard
- [ ] Warmup ramp testé avec une mini-campagne interne (10 emails team)
- [ ] Test d'unsub end-to-end depuis un email de test
- [ ] Test de bounce (email invalide) → row flip dans `mailing_contacts`
- [ ] Feedback loops Gmail Postmaster + Microsoft SNDS enregistrés

## Ne JAMAIS faire

- Envoyer via Brevo's campaign UI directement (court-circuite notre registry)
- Inclure `{{ unsubscribe }}` Brevo natif → toujours le remplacer par notre URL HMAC
- Envoyer depuis un autre sender que `maria@hi.exclu.at` pendant warmup (= reset reputation)
- Dépasser 0.3% de complaint rate → si atteint, **suspendre toutes les campagnes**
  et investiguer
