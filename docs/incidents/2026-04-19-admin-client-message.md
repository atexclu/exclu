# Message pour admin Exclu (Paybuddy) — point complet

---

Hello,

Petit point important suite au week-end sur les paiements UG. Tout est propre maintenant, je résume.

## Ce qui s'est passé

Depuis l'activation du MID 103799 le 14 avril, notre handler `ConfirmURL` acceptait **tous les événements** remontés par UnicornGroup comme s'ils étaient des ventes — y compris les `Verify` (vérifications de carte, avant capture) et les verifies refusés. Résultat : nos tables étaient polluées par des "ventes fantômes" qui n'avaient jamais été encaissées par UG.

Bug identifié dimanche matin, hotfix déployé, audit complet, réconciliation exécutée. **La prod est maintenant alignée sur la réalité UG à 100%.**

## Ce qui a été réellement encaissé par UG

Sur la période 14–19 avril, **45 transactions réussies** côté UG dashboard (hors cartes test `4242…`), pour un total **net créatrice de $493.80** (après commission plateforme 10% et frais fan 5%). Voici la répartition réelle :

### Top ventes légitimes (conservées, wallet créditée correctement)

| Créatrice | Ventes réelles | Net encaissé |
|---|---|---|
| @sabbiesins | 7 | $126.00 |
| @kierathc | 3 | $94.50 |
| @jamaria-williams | 2 | $67.50 |
| @bellebaby | 1 | $49.50 |
| @nathaliahlamexicanaa | 2 | $36.00 |
| @maizells06 | 1 | $31.50 |
| @summer's.secret | 1 | $10.80 |
| @aria | 1 | $5.00 |
| @cass4x, @anaalves, @plusgymcandids, @sexyboy | 1 chacune | $4.50 × 4 |

Plus **8 tips légitimes** répartis sur 3 créatrices. **Aucun gift ni custom request réellement encaissé sur la période.**

Total activité vraie sur la plateforme depuis l'activation : **~$500 de gains créatrice légitimes**.

## Les corrections appliquées

**33 créatrices** ont eu un ajustement wallet. Débit total net : **-$2 542.89** (les crédits indus retirés, moins les montants re-crédités aux comptes dont on a annulé des payouts pending).

### Top cas corrigés (solde wallet ajusté)

| Créatrice | Avant | Ajusté | Après | Payout associé |
|---|---|---|---|---|
| @sen08 | $468 | -$1 377 | **$0** | Payout $909 **rejeté** |
| @analiciacabrera | $450 | -$900 | **$0** | Payout $450 **rejeté** |
| @fawl | $373.49 | -$395.99 | **$22.50** | Payout réduit $67.50 → $45 |
| @lunaparkerss-08 | $291.60 | -$291.60 | **$0** | Pas de payout |
| @misa | $0 | -$171 | **$0** (solde neutralisé) | Payout $171 **rejeté** |
| @sukizyra | $0 | -$165.60 | **$0** | Payout $165.60 **rejeté** |
| @sexyboy | $130.50 | -$162 | **$0** | Payout réduit $54 → $22.50 |
| @sabbiesins | $189 | -$135 | **$54** | Payout $72 **conservé** (legit) |

Et 23 autres créatrices avec des ajustements plus petits ($4.50 à $90).

### Les 2 comptes dev (@tbtbtb, @tbdevpro) — comptes Thomas

Reset à 0 sur wallet/earned/withdrawn, payouts en cours rejetés. Normal, ce sont les comptes de test.

## Bonne nouvelle financière

**Aucun virement réel n'est parti.** Tous les payouts basés sur des soldes pollués étaient encore en statut `pending` — en attente de ta validation sur `/admin/payments`. On les a directement rejetés ou réduits au bon montant. **Zéro perte cash pour la plateforme.**

Récap payouts :
- **5 rejetés entièrement** (sen08 $909, analicia $450, misa $171, sukizyra $165.60, tbtbtb $298.50 dev) → $2 003.60 de faux payouts évités
- **3 réduits** au montant réel (fawl $67.50→$45, sexyboy $54→$22.50, tbtbtb n/a) → $108.50 de vrais gains conservés
- **Autres payouts en attente** (jamaria-williams $67.50, sabbiesins $72, etc.) → 100% légitimes, à valider normalement

## Communication créatrices

J'ai drafté 2 templates d'email (un soft pour les petits ajustements, un détaillé pour les 7 cas à forte correction). Disponibles dans `docs/incidents/2026-04-19-creator-communication.md`. Quand tu veux les envoyer (via Brevo ou manuellement), fais-moi signe — ou je peux te préparer une Edge Function qui les envoie en batch.

À part @tbtbtb et @tbdevpro qui sont les comptes dev Thomas, toutes les 31 créatrices impactées devraient être prévenues avant qu'elles ne s'aperçoivent du changement sur leur dashboard.

### Cas particulier — bellabad (@bellabad)

Pas dans la liste des 33 (wallet à 0, non impactée par le bug Verify). Elle nous a écrit hier sur WhatsApp « Is you guys scamming me? » parce qu'elle voyait 12 "ventes pending" sur sa page de détail lien. C'était en fait 12 checkouts abandonnés (fans qui ont cliqué "Buy" sans valider). J'ai corrigé l'UI pour ne plus afficher que les ventes réellement validées, et nettoyé les 12 lignes en statut `failed`. Un template de réponse spécifique est dans le même doc. À lui envoyer dès possible pour désamorcer.

## Prévention (déjà en place)

1. Hotfix `ugp-confirm` déployé dimanche — ne réagit plus qu'aux `Sale` / `Authorize` / `Recurring`
2. UI `LinkDetail` corrigée — n'affiche que les `succeeded` / `refunded`, jamais les `pending`
3. Migration 148 — table `wallet_adjustments` avec audit trail pour toute correction future
4. Migration 149 — constraint étendue sur `purchases.status`

## À faire côté Unicorn (en parallèle)

On reste en QuickPay pour l'instant. Derek a activé la cascade 2D côté UG pour réduire les declines US. J'ai drafté un email à Derek avec 3 questions techniques :
- Est-ce que la cascade marche déjà sur notre flow QuickPay actuel ? (Si oui, pas besoin de tout migrer)
- Est-ce qu'UG propose des hosted fields / tokenization pour DirectSale (pour rester en PCI SAQ A)
- Comment obtenir les ACS/ECI/XID pour le 3DS challenge

Email prêt à partir dans `docs/incidents/2026-04-19-derek-email-draft.md`.

N'hésite pas si tu veux que je détaille quoi que ce soit. Tout est loggé dans `wallet_adjustments` si on doit refaire un audit dans 3 mois.

Thomas

---

## Pour l'admin (liste complète — 33 créatrices impactées)

Liste triée par montant ajusté. Toutes les corrections sont idempotentes et traçables dans `wallet_adjustments` (reason = `non-actionable-ug-state-Verify` ou `no-ugp-transaction-id` ou `ugp-txn-not-in-payment-events`).

1. @sen08 — Sen08 — débit $1 377 — payout $909 rejeté
2. @analiciacabrera — analiciacabrera — débit $900 — payout $450 rejeté
3. @tbtbtb — tbtbtb — dev account reset — payout $298.50 rejeté
4. @fawl — fawl — débit $395.99 — payout $67.50 → $45
5. @lunaparkerss-08 — lunaparkerss.08 — débit $291.60
6. @misa — misa — débit $171 — payout $171 rejeté
7. @sukizyra — Suki Zyra — débit $165.60 — payout $165.60 rejeté
8. @sexyboy — sexyboy — débit $162 — payout $54 → $22.50
9. @sabbiesins — Sabrina Sin 🖤 — débit $135 — payout $72 conservé (legit)
10. @jamaria-williams — jamaria williams — débit $90 — payout $67.50 conservé (legit)
11. @martymonesi — Martina Monesi 💅🏻 — débit $43.20
12. @sassysonia — Sassy Sonia ᥫ᭡ — débit $31.50
13. @lilisuccubu — lilisuccubu — débit $27
14. @kittyvixen — Kittyvixen😻🥹 — débit $27
15. @ninasterling — ninasterling — débit $27
16. @blackmamba07 — Black mamba — débit $25.20
17. @mila — Mila — débit $22.50
18. @nathaliahlamexicanaa — Nathali Ruiz — débit $18
19. @lanalovexox — Lanalovexox — débit $13.50
20. @lustychoex — lustychoex — débit $10.80
21. @asmar31 — Asmar31 — débit $9
22. @cgsantanaa — cgsantanaa — débit $9
23. @hottly_sarlia — Hottly_sarlia — débit $9
24. @arujanvip — Arujan the queen — débit $9
25. @shahrazad — Shahrazad — débit $9
26. @evoly91 — evoly91 — débit $5.40
27. @tbdevpro — tbdevpro — dev account reset
28. @couplehot — couplehot — débit $4.50
29. @karina_kairos — Karina_Kairos — débit $4.50
30. @g0dd3xx — g0dd3xx — débit $4.50
31. @iomy-cruz — iomy Cruz — débit $4.50
32. @havardkarleigh — havardkarleigh — débit $4.50
33. @skxxnguy — skxxnguy — débit $4.50
