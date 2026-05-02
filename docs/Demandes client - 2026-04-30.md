Récap des nouvelles demandes — 2026-04-30

Voici un résumé de chaque demande, avec ce qui sera livré, l'estimation de temps de dev, et les questions à clarifier avant de commencer.

———

1. Vérification +18 KYC (Yoti) — 1 j

- Intégration API Yoti Identity Verification + webhook de retour
- Migration base de données : champs is_age_verified + age_verified_at sur le profil
- Étape optionnelle dans l'onboarding créateur (skippable)
- Gate bloquant sur la demande de retrait si gains > 50 $ et compte non vérifié
- UI de statut de vérification dans /app/settings
- Suppression du gate d'âge actuel sur la landing
- Coût Yoti absorbé par Exclu (rien à facturer au créateur)

Pas de question — prêt à démarrer.

———

2. Pending balance & payouts (justificatifs + dates) — 0,5 j

- Affichage d'un solde "Pending balance" à côté du "Current balance" (modèle inspiré de la capture transmise)
- Pour un nouveau créateur : 3 semaines de pending avant que les premiers gains soient disponibles
- Ensuite : cycle classique de 7 jours glissants (gains du jour J dispos à J+7)
- Tooltip d'explication directement sur la page (texte du modèle)
- Date du prochain virement affichée côté créateur, mise à jour manuellement par toi
- Côté admin, à la confirmation d'un payout : champ date + upload d'un justificatif (capture du virement)
- Côté créateur : date et justificatif visibles dans son historique de payouts (onglet Earnings)

Questions à valider :
- Les 3 semaines de pending pour un nouveau compte démarrent à partir de quel événement ? (création du compte / première vente / premier withdrawal demandé)
- Le justificatif est obligatoire ou facultatif quand tu confirmes un payout ?
- Email automatique au créateur à la confirmation du payout ?

———

3 + 4. Coupon code (1 mois Premium offert) + Upgrade/downgrade Premium depuis l'admin — 1 j

Coupon code :
- Saisie du code depuis la page abonnement créateur → 1 mois Premium offert
- Système d'admin pour générer et suivre les codes (création, expiration, utilisations)
- Logique d'activation différente selon que le créateur est déjà Premium ou non

Upgrade/downgrade Premium :
- Bouton dans la fiche admin du créateur pour basculer Free ↔ Premium sans paiement
- Trace de l'action (date + admin qui a déclenché)

Questions à valider :
- Codes à usage unique (un code = une activation) ou réutilisables avec quota global ?
- Codes nominatifs (lié à un créateur précis) ou génériques ?
- À la fin du mois offert : facturation auto à 39 $/mois (carte demandée à l'activation) ou retour automatique en Free ?
- Lors d'un upgrade gratuit côté admin, on définit une date de fin ("offert jusqu'au …") ou Premium illimité tant que tu ne le retires pas ?
- En cas de downgrade Premium → Free : annulation immédiate, ou on laisse tourner jusqu'à la fin de la période payée ?

———

5 + 6. Bouton "demande de plus de contenu" depuis l'admin + Onglet Home avec posts feed (style OnlyFans) — 1 j

Bouton de relance contenu :
- Bouton sur la fiche admin du créateur qui envoie un email de relance
- Trace des envois (date + admin) pour éviter le spam

Onglet Home + feed :
- Nouvel onglet "Home" côté créateur qui affiche la preview de son profil public
- Sur cette preview, zone interactive "nouveau post" qui ouvre une interface de création identique à celle de OnlyFans
- Les posts vont alimenter le feed déjà géré dans le profil — aucun changement pour le fan, qui voit le feed exactement comme aujourd'hui
- Posts en consultation seule, accès sur abonnement si publiés en non-public (logique actuelle du feed inchangée — pas de like ni de commentaire)

Question à valider :
- Pour la relance contenu : un seul template email, ou plusieurs au choix (relance soft, relance ferme, rappel d'avatar manquant…) ?
- D'autres types de relances à prévoir en même temps (compléter la bio, configurer le wallet, etc.) ?

———

7. Améliorer le design de classification de contenus — durée à valider avec précisions reçues

- Refonte UI de la zone de classification / catégories

Questions à valider :
- Quel écran exactement ?
  - Bibliothèque de contenu côté créateur (fichiers, dossiers, tags)
  - Directory public (catégories par niche)
  - Sélection de catégorie quand on crée un lien
- Tu m'avais évoqué un compte OnlyFans en référence visuelle, je n'ai rien reçu pour l'instant — tu peux me le repartager ?

———

8 + 9. Top classement créateurs + Popup toutes les 5 connexions — 0,5 j

Top classement :
- Mise en avant d'un classement des "tops" créateurs

Popup 5 connexions :
- Popup affiché au créateur tous les 5 logins, modèle déjà fourni, à reproduire à l'identique

Questions à valider :
- Top classement basé sur quoi exactement ? (revenus générés ?)
- Visible publiquement dans la partie earnings ?
- Mis à jour en temps réel, ou figé sur une période (semaine, mois) ?

———

10. SEO Directory + FAQs + Contenu — 1 j

- Changement des URLs directory (sans redirect 301) :
  - /directory/agencies → /directory/onlyfans-agency-review
  - /directory/creators → /directory/best-onlyfans-creators
  - /directory/agencies/:slug → /directory/agencies/:slug-review
- Migration SQL des slugs agences existantes (ajout suffixe -review)
- Template FAQs par page (agencies / creators / tools / page individuelle)
- Script LLM one-shot : extraction des ~300 agences, génération de ~1 200 mots par agence, injection en DB
- Meta descriptions optimisées par page
- Mise à jour de directory-ssr.ts pour injecter FAQs + contenu SEO côté serveur
- Ajout des nouvelles URLs au sitemap

Pas de question — prêt à démarrer.

———

11. Refonte du fonctionnement Chatter + Chat (email facultatif et notification de réponse) — durée à valider une fois précisions reçues

Chatter — décidé :
- On retire la question "souhaitez-vous activer le chatting AI/Humain ?" de l'onboarding créatrice → toutes les créatrices sont éligibles par défaut
- On garde le flux actuel : un chatter postule → la créatrice valide → accès accordé
- Bouton maison (retour vers le feed du créateur) en haut à droite des conversations

Chat email facultatif :
- Au premier message d'un fan invité (guest chat), demande d'email facultatif
- Si email renseigné, notification email à chaque réponse de la créatrice / chatter, avec lien direct vers la conversation

Questions à valider :
- Si on retire la question de l'onboarding mais qu'on garde la validation par la créatrice, comment la créatrice sait-elle qu'elle peut accepter des chatters ?
  - Option A : on ajoute un toggle "accepter les candidatures de chatters" dans ses settings (par défaut activé) — la créatrice peut le couper si elle ne veut pas être listée côté chatters
  - Option B : pas de toggle, toutes les créatrices apparaissent automatiquement dans le feed des chatters disponibles à postuler — c'est uniquement la validation au cas par cas qui filtre
- Rétribution : on garde le modèle actuel (commission par conversation attribuée au chatter) ou tu veux changer la formule ?
- Notifs chat : logique uniquement pour les guests (visiteurs sans compte), ou aussi pour les fans connectés sans notifs email activées ?
- Fréquence : un email pour chaque réponse, ou un seul email puis silence pendant X minutes pour éviter le spam ?

———

12 + 13. Referral + Light mode — 0,5 j

- Bouton CTA distinctif sur /app/referral
- Landing /affiliate (inspirée taap.it) — en attente du contenu de ta part
- Audit complet des tokens Tailwind : repasser le light mode en blanc/noir (suppression du jaune en mode clair)
- Application sur toutes les routes app + landing page
- Dark mode conservé en option (toggle accessible)

Question à valider :
- Tu peux m'envoyer le contenu rédactionnel de la landing /affiliate (titres, sections, arguments) quand tu l'as ?

———

15. Admin du directory créateurs (curation manuelle + drag & drop) — 0,5 j

Objectif :
- Donner à Louna un dashboard admin qui ressemble visuellement à la page publique /directory/creators (mêmes cartes, mêmes catégories), depuis lequel elle peut décider en un clic qui est mis en avant, qui est masqué, dans quel ordre et dans quelles catégories.
- Garder les nouveaux créateurs visibles automatiquement (en bas du feed) pour ne pas casser l'acquisition. Louna fait un "nettoyage" manuel hebdomadaire pour faire remonter ce qui mérite d'être mis en avant.

UI admin (nouvelle route /admin/directory) :
- Reproduction fidèle du layout actuel de /directory/creators (réutilise les mêmes composants de carte créatrice — pas de redesign).
- En tête : sélecteur de catégorie (tabs ou dropdown) — par défaut, vue "Featured" globale.
- Pour chaque catégorie :
  - Carrousel "Mises en avant" en haut (créatrices marquées featured pour cette catégorie, ordre figé par drag & drop).
  - Grille en dessous avec toutes les créatrices rattachées à la catégorie (visibles + masquées, avec un overlay grisé sur les masquées).
- Actions disponibles sur chaque carte (au survol ou via menu kebab) :
  - Toggle "Featured" (épingle) : ajoute / retire du carrousel de la catégorie courante.
  - Toggle "Visible / Masqué" : retire la créatrice du directory public pour cette catégorie.
  - Bouton "Catégories" : ouvre une modale pour rattacher / détacher la créatrice à plusieurs catégories d'un coup (multi-select).
  - Lien direct vers son profil public et vers sa fiche admin.
- Drag & drop (lib `@dnd-kit/core`, déjà utilisée dans le repo pour le link-in-bio) :
  - Réordonnancement intra-carrousel (featured) avec persistance immédiate (optimistic update).
  - Réordonnancement intra-grille pour la position curée des non-featured.
- Recherche / filtre dans la barre supérieure (par handle, nom, statut Premium / Free, date d'inscription).
- Indicateurs visuels par carte : badge "Premium", badge "Nouveau" (< 7 jours), nombre de liens payants, vues 30 j — pour aider Louna à arbitrer rapidement.

Modèle de données — nouvelle table `directory_curation` :
- `id` uuid pk
- `creator_id` uuid fk → profiles
- `category_id` uuid fk → directory_categories (nullable pour la curation globale "Featured")
- `position` integer (ordre dans le carrousel ou la grille curée, NULL si non curé)
- `is_featured` boolean default false
- `is_hidden` boolean default false
- `updated_by` uuid fk → profiles (admin qui a fait l'action)
- `updated_at` timestamptz default now()
- Contrainte unique `(creator_id, category_id)` (NULL = curation globale).
- Index sur `(category_id, is_featured, position)` pour le rendu directory.
- RLS : SELECT public, INSERT/UPDATE/DELETE réservé au rôle admin (via `is_admin(auth.uid())`).

Algo d'affichage par défaut (appliqué dans `directory-ssr.ts` + côté React pour la pagination) :
1. Créatrices marquées `is_featured = true` pour la catégorie demandée (ordre = `position` ASC).
2. Puis créatrices avec `position` non null et `is_hidden = false` (ordre curé manuellement par Louna).
3. Puis fallback automatique pour celles sans curation (`directory_curation` row absente) :
   a. Premium en premier (`profiles.is_premium = true`), triées par `profile_views_30d` DESC.
   b. Puis Free ayant au moins 1 lien payant publié (`COUNT(links WHERE is_paid AND published) > 0`), triées par date d'inscription DESC.
   c. Puis le reste, triées par date d'inscription DESC.
4. Filtrer systématiquement les `is_hidden = true` (ne s'affichent jamais publiquement).

Edge function / RPC :
- RPC `admin_set_directory_curation(creator_id, category_id, patch)` qui upsert la ligne et trace `updated_by` automatiquement (via `auth.uid()`).
- RPC `admin_reorder_directory(category_id, ordered_creator_ids[])` qui réécrit en batch les `position` (transaction).
- Nouvelle vue SQL `v_directory_creators` qui matérialise l'algo ci-dessus pour simplifier la requête côté SSR.

Mise à jour `directory-ssr.ts` :
- Remplacer la requête actuelle par un SELECT sur `v_directory_creators` filtré par `category_slug` + `is_hidden = false`.
- Conserver le caching SSR existant (revalidation toutes les 5 min déjà en place).
- Sitemap : aucun changement (toutes les créatrices restent indexables sauf si `is_hidden = true` — auquel cas on les retire du sitemap aussi).

Routing & permissions :
- Route `/admin/directory` ajoutée dans `App.tsx` **avant** le catch-all `/:handle`.
- Garde `RequireAdmin` (déjà existante dans le code admin) appliquée.

Tests :
- Vitest sur l'algo de tri (cas : 0 curé, mix curé/auto, hidden, Premium vs Free + liens, nouveau créateur sans curation).
- Test E2E rapide du drag & drop (réordonnancement persistant après reload).

Migration & rollout :
- Migration numérotée à la suite (prochain numéro libre `190_directory_curation.sql`).
- À la première exécution : table vide → l'algo de fallback prend le relais et le directory ressemble exactement à aujourd'hui (zéro régression visuelle).
- Louna peut commencer à curer dès le déploiement, sans deadline.

Pas de question — prêt à démarrer.

———

14 + 16. Preview floutée Link-in-Bio + Design divers — 0,5 j

- Blur automatique sur le link-in-bio (/:handle)
- Blur automatique dans la génération OG des liens de paiement (/l/:slug)
- Image floutée placeholder en background + avatar central + handle (style deadinsid3x)
- Utilisation d'une image aléatoire sécurisée (pas l'image réelle du contenu)
- Vérification que localisation / résidence est bien retirée partout
- Fusion des catégories (à préciser au moment de l'implémentation)
- Ajustements des popups listées (à préciser au moment de l'implémentation)

Pas de blocage — précisions à donner au moment de l'impl.

———

Récap — temps de dev estimé

- 1.  Vérification +18 KYC (Yoti) : 1 j
- 2.  Pending balance & payouts : 0,5 j
- 3+4. Coupon code + Upgrade/downgrade Premium admin : 1 j
- 5+6. Bouton relance contenu + Onglet Home/feed : 1 j
- 7.  Design classification de contenus : à valider après précisions
- 8+9. Top classement + Popup 5 connexions : 0,5 j
- 10. SEO Directory + FAQs + Contenu : 1 j
- 11. Refonte Chatter + Chat email/notifs : à valider après précisions
- 12+13. Referral + Light mode : 0,5 j
- 15. Admin du directory créateurs : 0,5 j
- 14+16. Preview floutée + design divers : 0,5 j

Total chiffré à ce stade : 6,5 j (les points 7 et 11 sont à chiffrer après clarifications).

———

Récap — questions prioritaires à clarifier avant chiffrage final

1. Classification de contenus (point 7) — Quel écran exactement, et référence visuelle (compte OnlyFans annoncé) ?
2. Chatter (point 11) — Toggle dans les settings créatrice, ou toutes les créatrices listées automatiquement ?
3. Pending balance (point 2) — Justificatif obligatoire ou facultatif, et point de départ des 3 semaines pour les nouveaux comptes ?
4. Coupons (point 3) — Que se passe-t-il à la fin du mois offert (auto-renew payant ou retour Free) ?
5. Top classement (point 8) — Critère exact et visibilité (publique côté earnings, ou interne) ?

———

Une fois ces points clarifiés, je chiffre les features restantes (7 et 11) et je te propose un ordre de réalisation par priorité d'impact business.
