# Communication créatrices — réconciliation du 2026-04-19

## 1. Bonne nouvelle avant d'agir

**Aucun retrait n'a été effectivement payé.** Tous les payouts demandés basés sur des soldes pollués sont encore `pending` dans l'admin. Aucune vraie perte financière pour Exclu — il suffit de rejeter ces payouts en attente avant/après la réconciliation.

## 2. Payouts en attente à rejeter (après --apply)

Ces demandes de retrait ont été faites sur des soldes pollués (crédits fantômes depuis Verify events). À rejeter sur `/admin/payments` :

| Créatrice | Demandé | Date | Wallet réel après reconcile | Action |
|---|---|---|---|---|
| @sen08 | **$909.00** | 2026-04-17 | $0 (tout était fake) | Rejeter — fake credits |
| @analiciacabrera | **$450.00** | 2026-04-16 | $0 | Rejeter — fake credits |
| @tbtbtb | $298.50 | 2026-04-03 | probable compte dev | Vérifier + rejeter |
| @misa | $171.00 | 2026-04-18 | $0 | Rejeter — fake credits |
| @sukizyra | $165.60 | 2026-04-19 | $0 | Rejeter — fake credits |
| @fawl | $67.50 | 2026-04-18 | voir wallet final | Rejeter, regénérer si crédit restant |
| @sexyboy | $54.00 | 2026-04-14 | $0 | Rejeter — fake credits |

**Total pseudo-payouts évités : $2 115.60**

## 3. Liste complète des créatrices impactées (33)

Liste triée par impact décroissant. `current_usd` = wallet avant correction, `debit_usd` = ce qu'on retire (crédits indus). `new_balance_usd < 0` = elle avait déjà un payout en attente sur ces crédits fake.

| # | Handle | Lignes | Avant | Débit | Après | Négatif |
|---|---|---|---|---|---|---|
| 1 | @sen08 | 6 | $468.00 | $1 377.00 | **-$909.00** | ⚠️ |
| 2 | @analiciacabrera | 2 | $450.00 | $900.00 | -$450.00 | ⚠️ |
| 3 | @tbtbtb | 11 | $249.20 | $411.70 | -$162.50 | ⚠️ dev |
| 4 | @fawl | 8 | $373.49 | $395.99 | -$22.50 | ⚠️ |
| 5 | @lunaparkerss-08 | 9 | $291.60 | $291.60 | $0.00 | — |
| 6 | @misa | 4 | $0.00 | $171.00 | -$171.00 | ⚠️ |
| 7 | @sukizyra | 4 | $0.00 | $165.60 | -$165.60 | ⚠️ |
| 8 | @sexyboy | 5 | $130.50 | $162.00 | -$31.50 | ⚠️ |
| 9 | @sabbiesins | 6 | $189.00 | $135.00 | $54.00 | — |
| 10 | @jamaria-williams | 3 | $90.00 | $90.00 | $0.00 | — |
| 11 | @sassysonia | 10 | $45.00 | $45.00 | $0.00 | — |
| 12 | @martymonesi | 1 | $43.20 | $43.20 | $0.00 | — |
| 13 | @lanalovexox | 6 | $27.00 | $27.00 | $0.00 | — |
| 14 | @lilisuccubu | 3 | $27.00 | $27.00 | $0.00 | — |
| 15 | @kittyvixen | 1 | $27.00 | $27.00 | $0.00 | — |
| 16 | @ninasterling | 6 | $27.00 | $27.00 | $0.00 | — |
| 17 | @blackmamba07 | 4 | $25.20 | $25.20 | $0.00 | — |
| 18 | @mila | 3 | $22.50 | $22.50 | $0.00 | — |
| 19 | @nathaliahlamexicanaa | 1 | $54.00 | $18.00 | $36.00 | — |
| 20 | @lustychoex | 1 | $10.80 | $10.80 | $0.00 | — |
| 21 | @asmar31 | 1 | $9.00 | $9.00 | $0.00 | — |
| 22 | @cgsantanaa | 1 | $9.00 | $9.00 | $0.00 | — |
| 23 | @hottly_sarlia | 1 | $9.00 | $9.00 | $0.00 | — |
| 24 | @arujanvip | 1 | $9.00 | $9.00 | $0.00 | — |
| 25 | @shahrazad | 2 | $9.00 | $9.00 | $0.00 | — |
| 26 | @evoly91 | 1 | $5.40 | $5.40 | $0.00 | — |
| 27 | @tbdevpro | 1 | $95.00 | $5.00 | $90.00 | — dev |
| 28 | @couplehot | 1 | $4.50 | $4.50 | $0.00 | — |
| 29 | @karina_kairos | 1 | $4.50 | $4.50 | $0.00 | — |
| 30 | @g0dd3xx | 1 | $4.50 | $4.50 | $0.00 | — |
| 31 | @iomy-cruz | 1 | $4.50 | $4.50 | $0.00 | — |
| 32 | @havardkarleigh | 1 | $4.50 | $4.50 | $0.00 | — |
| 33 | @skxxnguy | 1 | $4.50 | $4.50 | $0.00 | — |

**Total débits : $4 454.99 • Créatrices impactées : 33 (dont 2 dev → @tbtbtb et @tbdevpro)**

## 4. Templates d'email

### 4.1 Email standard (creators avec correction sans négatif)
À envoyer aux ~23 créatrices dont le solde ne passe pas négatif après correction.

**Subject** : `Important — ajustement de ton solde Exclu`

```
Hey {display_name},

Un point important sur ton espace créateur sur Exclu.

On a détecté cette semaine un problème technique sur notre processeur de paiement (UnicornGroup), qui a affiché certaines tentatives de paiement comme si elles étaient des ventes validées. En réalité, pour ces tentatives, la carte du fan n'a pas été effectivement débitée — donc tu n'as pas encaissé ces sommes.

On vient de faire le ménage dans les comptes concernés. Dans ton cas, on a retiré de ton wallet les crédits qui ne correspondaient pas à des ventes réelles.

**Ton solde a été ajusté de -${{debit_usd}} USD**

Ton wallet Exclu affiche désormais uniquement les ventes réellement validées par ton moyen de paiement. Les prochaines ventes, elles, sont maintenant sécurisées par un correctif déployé ce week-end : on ne crédite plus ton wallet tant que le paiement n'a pas été effectivement capturé.

Si tu as une question, réponds à ce mail, on est là.

Merci pour ta patience et désolé pour la confusion,

L'équipe Exclu
```

### 4.2 Email pour les 7 cas à solde négatif (`@sen08`, `@analiciacabrera`, `@fawl`, `@misa`, `@sukizyra`, `@sexyboy`, `@lunaparkerss-08`)

**Subject** : `Important — ajustement de ton solde et retrait Exclu`

```
Hey {display_name},

Un point important concernant ton compte Exclu.

Cette semaine, on a détecté un bug technique sur notre processeur de paiement (UnicornGroup). Pendant plusieurs jours, notre système a comptabilisé certaines tentatives de paiement comme si elles étaient des ventes, alors que la carte du fan n'avait en réalité pas été débitée. Autrement dit : ces "ventes" n'ont jamais eu lieu et aucun paiement n'a été encaissé par Exclu.

On a rectifié ce bug et remis ton wallet à l'état qui reflète la réalité : uniquement les ventes pour lesquelles un paiement a été effectivement capturé sur ta carte de fan.

Concrètement pour toi :
• **Solde avant correction : ${{current_usd}} USD**
• **Ajustement : -${{debit_usd}} USD** (crédits qui ne correspondaient à aucun vrai paiement)
• **Nouveau solde : ${{new_balance_usd}} USD**

{{IF_PENDING_PAYOUT}}
Ta demande de retrait de ${{payout_requested_usd}} USD du {{payout_date}} va être annulée — elle était basée sur ce solde erroné qui ne correspond pas à des fonds réellement encaissés. Aucun virement n'a été effectué (les retraits étaient encore en attente de validation de notre part, donc aucun mouvement n'est arrivé sur ton IBAN).
{{END_IF}}

On est sincèrement désolés pour cette confusion. Le bug est corrigé, et on a mis en place un contrôle journalier pour que ça ne puisse plus se reproduire. Tes futures ventes seront créditées uniquement quand le paiement sera réellement capturé.

Si tu penses avoir reçu des ventes qui n'apparaissent plus, ou si tu as besoin d'explications, réponds à ce mail — on regardera ton cas en détail.

Merci de ta compréhension,

L'équipe Exclu
```

### 4.3 Notes pour l'envoi
- **Ne PAS mentionner le nom du bug (`TransactionState`, `Verify`, etc.)** — rester simple
- **Ne PAS donner de détails sur le volume global** (nombre de créatrices, $$$ total)
- **Utiliser Brevo** via `send-creator-reconciliation` Edge Function à créer, OU via dashboard Brevo manuellement
- **Envoyer avant la réconciliation** serait idéal mais si on applique d'abord, prévenir dans les 24h suivantes
- **Les créatrices sans solde négatif** : email doux (4.1). Celles à solde négatif : email plus détaillé avec chiffres (4.2)
- **@tbtbtb et @tbdevpro sont des comptes dev** — ne pas envoyer d'email

## 5. Cas bellabad

Pas dans la liste (pas impactée par le bug Verify — wallet à $0). Son cas : 12 checkouts abandonnés qui seront nettoyés par la partie "abandoned" de la réconciliation (status → `failed`). Son message WhatsApp ("Is you guys scamming me") mérite une réponse individuelle :

```
Hey {display_name},

Aucun scam — on t'explique.

Ce que tu voyais dans la liste "BUYERS" ce sont des fans qui ont cliqué sur "Buy" mais qui ont quitté la page avant de valider le paiement sur leur carte. Ce n'était pas des ventes effectives, juste des tentatives interrompues. La carte de Ryan (et des autres) n'a jamais été débitée, donc aucun fonds n'est arrivé dans ton wallet.

On a corrigé l'UI : la liste BUYERS n'affiche plus que les vraies ventes encaissées. Désolés pour la confusion, c'était trompeur.

Si tu vois une activité sur ton profil qui te semble louche, dis-le nous — on regarde avec toi.

L'équipe Exclu
```
