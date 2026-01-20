
Cahier des Charges – Plateforme Exclu.at

Contexte et objectifs
• Concept : Développer une plateforme de monétisation de contenu (photos,
vidéos, etc.) équivalente à OnlyFans, où les créateurs conservent l’essentiel de
leurs revenus. L’inspiration vient de solutions comme Exclu (un « OnlyFans
alternative ») qui mettent en avant des liens payants d’accès immédiat et 0 % de
commission pour le créateur.
• Public cible : Exclusivement des créateurs de contenu adultes (modèles,
influenceurs, etc.) souhaitant vendre du contenu directement à leur audience.
Pas de comptes professionnels ou entreprises, uniquement des profils
individuels.

• Objectifs principaux :
• Permettre aux créateurs de s’inscrire et de gérer leur profil de manière
autonome.
• Leur offrir un dashboard pour télécharger du contenu (photos, vidéos, fichiers)
et fixer des tarifs (abonnements ou paiements à la pièce).
• Concevoir une interface de consommateurs (fans) simple : pas de création de
compte nécessaire, juste une carte bleue pour débloquer les contenus.
• Intégrer un système de paiement sécurisé (Authorize.Net) pour gérer les
transactions CB et les abonnements.
• Prévoir un programme de parrainage : toute personne parrainant un nouveau
créateur ou fan gagne 40 % de commission sur les ventes générées (cf.
Commission affiliation).
• Respecter un design sombre (thème violet/rose comme sur my.club) avec
contenu flouté en aperçu, et une UX soignée, épurée et intuitive (inspiration
my.club et reveal.me).
Architecture technique et hébergement
• Base de données (Supabase) : On utilisera Supabase (PostgreSQL + Auth +
Storage).
• Plan gratuit : adapté au lancement, offre 50 000 utilisateurs actifs mensuels
(MAU) et 500 Mo de base (PostgreSQL). Ce plan gratuit comprend aussi 1 Go de
stockage de fichiers et 5 Go de bande passante sortante, suffisant pour une
petite charge initiale. (À noter : les projets gratuits sont mis en pause après 7
jours d’inactivité.)
• Plan Pro : pour le scale, Supabase propose un plan Pro « à partir de \$25/mois »
qui inclut 8 Go de base de données, 100 Go de stockage de fichiers et 250 Go de
bande passante. Il autorise aussi 100 000 MAU (au-delà, facturation à l’usage).
Ce plan sera envisagé une fois que les limites du free plan sont atteintes.
• Fonctionnalités Supabase : gestion native des utilisateurs (authentification),
API REST automatique, stockage de fichiers (pour les contenus) et notification
en temps réel. Les données sensibles (profil, transactions) seront protégées via
SSL/TLS et RLS (Row-Level Security) de PostgreSQL.
• Frontend (Vercel) : L’interface web sera développée en React/Next.js et
déployée sur Vercel.
• Plan Hobby : gratuit, permet déployer l’application avec CI/CD, CDN mondial,
WAF, TLS/SSL, etc. Parfait pour démarrage.
• Plan Pro (\$20/mois) : pour plus de ressources (CPU, build plus rapides,
collaboration team). Le plan Hobby gratuit inclut déjà des fonctionnalités
avancées (firewall, CDN).
• Remarque : Vercel gère nativement les frontends statiques/dynamiques, et
s’intègre bien avec Supabase pour l’auth et l’API (ex: NextAuth ou supabase-js
pour les requêtes).
• Backend (Railway, optionnel) : Si besoin d’un service serveur dédié (par ex.
une API Node.js/Express pour orchestrer les paiements ou opérations backend
spécifiques), Railway est une option simple.
• Plan Free ($0) : 0,5 Go de RAM, 1 vCPU par service, 0,5 Go stockage persistant.
Comprend 30 jours d’essai avec \$5 de crédit. Pratique pour prototypage.
• Plan Hobby ($5/mois) et Pro ($20/mois) : montent jusqu’à 8 Go/8 vCPU et 32 Go/
32 vCPU par service respectivement. Ils incluent des crédits d’utilisation (¥5 et
¥20) couvrant une portion d’usage mensuel.
• Usage : Ce backend serait utile si l’on a besoin de logique serveur (par exemple,
orchestration des chats, webhooks de paiement Authorize, etc.). Sinon,
l’essentiel peut être géré « serverless » via Supabase Functions ou Next.js API
routes sur Vercel.
• Système de paiement (Authorize.Net) : Utiliser le service Authorize.Net pour
les transactions par carte bancaire.
• Offre recommandée « All-in-one » à \$25/mois + 2,9% + \$0,30/transaction. Ce
plan fournit un compte marchand intégré (merchant account) et la passerelle de
paiement (gateway).
• Sécurité : Authorize.Net propose une suite avancée de détection de fraude
(« Advanced Fraud Detection Suite ») récompensée par Forbes 2025, assurant
des transactions CB sécurisées.
• Débouché UX : Les utilisateurs (fans) n’ont pas besoin de créer un compte sur
la plateforme pour payer. Ils saisissent directement leurs coordonnées CB dans
un formulaire Authorize.Net intégré (checkout sécurisé).
Fonctionnalités du côté Créateur
1. Inscription / Onboarding : Le créateur s’inscrit par email et mot de passe (ou
OAuth social), valide son compte (email). Un espace de profil est créé pour
stocker ses infos (pseudo, bio, photo de profil). On pourra prévoir une vérification
manuelle de son identité (optionnel selon réglementations).
2. Dashboard Créateur : Après connexion, le créateur accède à un tableau de
bord clair :
3. Gestion des contenus : bouton “Ajouter un contenu” permettant d’uploader des
fichiers (photos, vidéos, audio, ebooks, etc.). Chaque contenu devient un post ou
un lien privé payant. On peut organiser en dossiers/collections.
4. Tarification : Pour chaque contenu, le créateur définit un prix de vente (montant
minimum \$5). Les paiements pourront être à l’acte (pay-per-view) ou récurrents
(abonnements mensuels) selon le modèle souhaité.
5. Liens payants : Génération de liens monétisés (« paid links ») : chaque lien
correspond à un accès unique à un contenu (similaire au système d’Exclu). Ces
liens peuvent être partagés sur les réseaux sociaux, Telegram, etc.
6. Statistiques : Affichage du nombre de vues de ses contenus, du nombre de
ventes, des revenus générés. Exclu met en avant des « high conversion rates »
(15–20%) grâce aux liens payants – on suivra ce KPI.
7. Gestion des abonnements : Tableau de bord listant les abonnés récurrents
(fans abonnés, virements automatiques). Le créateur peut activer/désactiver des
promotions (ex : essai gratuit) si souhaité.
Fonctionnalités du côté Fan (utilisateur)
1. Découverte du créateur et de son contenu : Sur la page publique de chaque
créateur, on affiche ses contenus de manière stylisée : vidéos/images miniatures
floutées (effet « tease »), titre court, prix en surimpression partielle. Ce rendu doit
s’inspirer des pages « link-in-bio » floutées comme on le voit sur des outils de
teasers (par ex. reveal.me). Aucun contenu sensible n’est montré sans paiement.
2. Achat sans compte : Pour débloquer un contenu, le fan clique sur l’icône/
miniature floutée ; il est alors invité à entrer ses informations de carte bancaire
dans le formulaire Authorize.Net. Après validation, l’accès au contenu devient
instantané (déblocage du lien, lecture en streaming ou téléchargement). Le fan
peut ensuite éventuellement chatter avec le créateur (via le chat intégré). Il n’y a
pas besoin de créer un compte utilisateur sur la plateforme.
3. Retour à la carte bleue : Les informations CB sont traitées par Authorize.Net
(sécurisé). On appliquera les frais de transaction standard (2,9%+0,30$, inclus
dans les 5% prévus côté fan). Exemple de tarification : pour un achat de \$10, le
fan paie \$10 + \$0,50 (5% supplémentaire) et le créateur reçoit \$9.50 (moins \
$0,30 de frais Authorize).
4. Abonnement aux créateurs : Si un créateur propose des abonnements
mensuels, le fan peut également s’abonner via Authorize.Net (virement
récurrent). L’interface doit permettre l’annulation facile de l’abonnement.
5. Interactivité post-achat : Après chaque achat, le fan est redirigé vers le profil du
créateur
Système de parrainage (Referral)
• Pour encourager la croissance, tout utilisateur (créateur ou simple promoteur)
peut parrainer d’autres utilisateurs.
• Commission de 40% : Le parrain reçoit 40% de commission sur chaque
transaction réalisée par le filleul (que le filleul soit fan ou créateur). Par exemple,
si un fan parrainé effectue un achat de \$10, le parrain gagne \$4. La plateforme
se charge de suivre ces références via des codes ou liens de parrainage dans
l’URL. (Cette pratique est similaire à de nombreux programmes affiliés pour
créateurs, bien que le taux de 40% soit particulièrement généreux.)
Modèle économique et commissions
• Abonnement (\$39/mois) : Ce plan permet au créateur de ne payer aucune
commission sur ses ventes. Seuls les frais de transaction CB (≈5%) sont
prélevés sur chaque achat. Cela s’apparente au modèle d’Exclu qui vante le
« 0% commission – you keep 100% of your revenue ».
• Plan Gratuit : Le créateur n’a pas d’abonnement fixe, mais la plateforme prélève
une commission de 10% sur ses ventes. Les fans payent toujours 5% de frais de
transaction à leur niveau (cumulant ~15% de frais total). Par exemple, pour une
vente de \$20, le créateur reçoit \$18 (10% soit \$2 retenus) et le fan paie \$21 (\
$20 + 5% soit \$1 de frais carte).
• Minimum de paiement : Chaque lien payant ou post à la pièce doit être d’au
moins \$5, pour assurer la rentabilité des transactions (frais de CB fixes à \
$0,30).
• Frais de plateforme : En résumé, le plan payant (\$39) offre 0% de commission
+ 5% de frais CB (prise en charge par le fan), tandis que le plan gratuit impose
10% de commission + 5% frais CB. Ces chiffres sont cohérents avec des
pratiques de la concurrence (ex. Exclu à 0%, OnlyFans à 20%).
Design et ergonomie (UI/UX)
• Palette de couleurs : Thème sombre (noir/anthracite) avec accents violets et
roses (cf. https://my.club, https://reveal.me pour l’ambiance). L’idée est d’associer
la sensualité (violet/rose) à une interface élégante et moderne.
• Typographie & Iconographie : Simples et lisibles. Éviter les designs trop
chargés. Les boutons d’action (paiement, s’abonner) seront bien visibles, de
couleur contrastée (rose vif ou orange clair).
• Images floutées (blur) : Sur la page du créateur, les contenus affichés en avant-
première seront floutés ou pixélisés (effet blur). Lorsqu’un fan survole ou clique,
un overlay explique « Débloquez pour voir » ou « Unlock to view ». (On vise un
style proche de reveal.me/lolabellucci où l’image est volontairement floutée tant
qu’on n’a pas payé.)
• Maquette d’inspiration : L’UX générale s’inspire des pages de fans type
My.Club (ex: my.club/twin/XnicoleanistonX), avec un grid de miniatures floutées
et un bouton d’achat clair.
• Responsive : L’application sera pleinement responsive (desktop, mobile,
tablette). Il sera crucial que le tunnel de paiement soit optimisé pour mobile (la
majorité des utilisateurs sera peut-être sur smartphone).
Sécurité et conformité
• Hébergement et données : Supabase et Vercel assurent l’hébergement
sécurisé (certificats SSL, sauvegardes quotidiennes en plan Pro). Les données
critiques (mots de passe, infos de paiement) sont stockées de manière chiffrée
(sous-jacente dans Supabase et Authorize.net). Supabase paie ses serveurs
PostgreSQL avec RLS et TLS par défaut.
• Paiements sécurisés : Toutes les transactions CB passent par Authorize.Net,
certifié PCI DSS. Le formulaire de paiement est hébergé sur les serveurs
d’Authorize (pas de stockage de numéros CB sur nos serveurs).
• Protection anti-fraude : Nous activerons les outils de détection de fraude
d’Authorize.net. De plus, chaque nouvel utilisateur (créateur/fan) sera validé par
email pour éviter les faux comptes.
• RGPD et confidentialité : L’application doit respecter le RGPD : politique de
confidentialité claire, consentement aux cookies, possibilité de suppression des
données personnelles. Seuls les emails et infos minimales sont collectés.
Synthèse des technologies et références
• Supabase (DB & Auth) : plan Free jusqu’à 50k MAU, 500MB DB puis plan Pro (\
$20) avec 8GB DB, 100GB stockage.
• Vercel (Frontend) : plan Hobby gratuit (CI/CD, CDN).
• Authorize.Net (Paiement) : forfait \$25/mois + 2,9%+0,30$ par transaction, avec
fraude détectée (« Award winning fraud protection »).
• Références d’inspiration : Exclu (monétisation par liens, 0% commission),
My.Club (design sombre + teasers floutés), Reveal.me (contenu déflouté après
paiement).
Ce cahier des charges constitue un plan détaillé de l’expérience utilisateur et de
l’architecture technique pour le projet. Il permettra de cadrer le développement du
SaaS, en respectant les exigences business (monétisation, commissions, parrainage)
et les contraintes techniques (stack Supabase/Vercel, paiement Authorize.net, chat
humain). Chaque étape de l’interface doit être testée pour garantir une expérience
fluide tant pour le créateur que pour le fan, tout en assurant la sécurité et la pérennité
de la plateforme.