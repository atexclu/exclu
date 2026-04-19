Plan d'amélioration Exclu

Ce doc liste toutes les features à implémenter, corriger ou améliorer. Chaque demande est décrite avec son contexte et les questions à trancher avant de coder.

---

 1. Vérification +18 (ProveMyAge / Yoti)

On veut intégrer une vraie vérification d'âge (+18) via un prestataire externe, pas juste le popup actuel.

Prestataires envisagés :
- ProveMyAge : https://www.provemyage.com/
- API Yoti (Identity Verification) : https://developers.yoti.com/identity-verification-api

Questions à trancher :
-  À quel moment la vérif est déclenchée ? Plusieurs options :
  - Dès qu'un visiteur accède à un profil créateur (gate globale, comme le `AgeVerificationGate` actuel mais avec vrai KYC)
  - Au moment du paiement (avant checkout)
  - À l'inscription du fan
  - À l'inscription du créateur uniquement
-  C'est obligatoire pour tous les visiteurs ou seulement ceux qui achètent/créé un compte ?

Juste pour le créateur. 
Seulement ceux qui crée un compte, on affiche ça en option le temps qu’ils découvrent l’app et on rend ça obligatoire au moment du premier paiement. Dès que les premiers 50$ ont été géneré.

TB : Ok donc je le rajoute en étape de l’onboarding et je rends ça facultatif Oui ✅, et côté créateur si la vérification n’a pas été faite dans l’onboarding, on la rends obligatoire pour faire la demande de cashout ? (>50$ de gains) Oui ✅
Et côté fan, vérification à l’inscription également, et si il la skip avant son premier paiement pour pouvoir le placer. Ok pour toi? Non on ne demande pas la Carte d’identité au fan, pour le fan aucune vérification n’est nécessaire à part un avertissement -18.  


-  On garde le popup actuel à l’arrivée sur la landing en plus, ou on le remplace ?
Le popup +18 on va l’enlever et

-  La vérif est one-time (cookie/session) ou liée à un compte utilisateur ?

One-time et liée à un compte créateur

-  Coût par vérification chez ProveMyAge/Yoti doit être absorbé par Exclu

---

 2. Refonte du Pricing

On change le modèle de pricing pour s'aligner sur LinkMe.

Nouveau pricing :
- Free : frais côté fan (en plus du prix fixé par le créateur ? Oui  + 15% commission fixe prélevée au créateur sur chaque vente
- Pro Monthly : 39,99 $/mois, +15% frais côté fan + 5% commission créateur
- Pro Annual : 239,99 $/an, mêmes conditions que le monthly

Pour comparaison, actuellement :
- Free = +5% fan fee + 10% commission créateur
- Pro = +5% fan fee + 0% commission
- Donc le Pro passe de 0% à 5% de commission → il faudra mettre à jour le wording/marketing? 

Justifier ça via frais bancaire dans les conditions générales. Il faudra préciser jusqu’à 5.5% de frais bancaire en fonction du pays et devise pour avoir de la marge.

-> Attention on peut pas trop mentire dans les cgu, autant rester flou je pense car ça explique pas le 5->15% de comission en plus côté fan qui sont censés absorber le frais de paiement. Ok j’ajusterai ✅

TB : La proposition de valeur forte de la plateforme c’est 0% de commission comme c’est mit en avant partout, sur ce nouveau modèle on est plus à 0% ducoups. Dois-je changer ce wording? 

Ils sont toujours à 0% côté créateur. on va ajuster ça au fûr et à mesure. Ce sera plus “Sell more oustide your Onlyfans at 0% commission ”  ✅
Ou tu souhaite faire un ajustement de pricing de ce type (ce que je ferai car le wording de 0% de commission je pense que c’est ça aussi qui contribue à la bonne conversion) :

Nouveau pricing :
- Free : frais côté fan (en plus du prix fixé par le créateur ? + 15% commission fixe prélevée au créateur sur chaque vente Oui ✅
- Pro Monthly : 39,99 $/mois, +15% frais côté fan + 0% commission créateur Oui ✅
- Pro Annual : 239,99 $/an, mêmes conditions que le monthly Oui ✅



Questions à trancher :
-  Les 15% de frais fan s'appliquent sur tous les types de vente ? (links, tips, custom requests, wishlist gifts) Oui  
-  En free, 15% commission créateur sur le prix total qu’il indique + 15% frais fan en plus du prix indiqué par le créateur pour un link par exemple ? indiquer Guarantee & Protection 
-  Pour le code promo 1 mois d'essai gratuit au plan Pro : comment on le distribue ? (lien unique, code saisi manuellement, automatique à l'inscription ?)
-  Le pricing annual nécessite un nouveau produit côté UG Payment. Est-ce que UGP supporte les recurring annuels ? → À voir avec Derek
-  Popup "Subscribe to Pro" affichée 1 fois par semaine aux créateurs free → on stocke le dernier affichage en localStorage ou DB, je vais réfléchir à ce qui est plus propre.


---

 3. Système d'abonnement Fan → Créateur (Discover)

On veut ajouter un abonnement payant par profil créateur côté fan, inspiré d'Unlockt.me. Le fan doit s'abonner pour accéder au contenu.

Comment ça marche :
1. On remplace le message "No public content" par une grille de photos floutées + bouton "Discover" Oui
2. Le bouton ouvre une popup : "Discover all [Name]'s exclusive contents" Oui 
3. La popup affiche le plan d'abonnement (minimum 5 $/mois) Oui et mettre ça par défaut, même si la modèle n’a pas de contenu. Ça incitera la modèle à en mettre et elle peut mettre 1 contenu en preview par défaut.
4. Le fan doit s'abonner pour débloquer le contenu ? A quel contenu as-il accès via cette abonnement ? Non il peut toujours payer les liens de paiements.  Il a accès au feed de la modèle (contenu par défaut qu’elle souhaite afficher sur son profil)

-> Ok donc les contenus privés restent privés, les contenus publiques s’intègrent dans ce feed en liste avec blurred effect si pas d’abonnement ou pas connecté Oui ✅, si fan connecté mais pas d’abonnement ces contenus restent blurred, et si il est connecté et avec l’abonnement les contenus sont affichés normalement.


5. Côté créateur : où fixer le prix de l'abonnement ? A quoi cela donne accès cet abonnement côté fan ? le prix de l’abonnement est automatiquement fixé à 5$, elle pourra le modifier sur son profil.

Réf :
- https://unlockt.me/v/c9246c6f91
- https://link.me/sophieraiin

Questions à trancher :
-  C'est un vrai abonnement récurrent (mensuel) ? Oui
-  Si récurrent : via UGP recurring ? Il faudra un nouveau type d’abonnement recurring qui nous laisse set le prix nous même.  
-  Que voit un fan abonné vs non abonné ? Tout le contenu non publique est débloqué ? ou juste le "feed" qui est à implémenter ? le non abonné n’a pas accès à son contenu feed qui est situé ic mais vient s’ajouter aussi dans le dashboard fan.i. 
TB ; Que doit-être affiché sur le dashboard fan? Dans quel onglet? Ajouter un bouton feed, quand le fan chat avec la modèle, il faut lui proposer la possibilité de consulter le feed.  Dans Au niveau du dashboard ✅










L’abonné a accès à ce contenu feed quand il se connecte et peut visualiser ça dans une nouvelle section à côté du chat. Inclure aussi les liens de paiements présent dans le link in bio dans le feed in-app chat.

- Ok donc l’onglet “Content” devient une liste de posts avec ce système de blurred/non blurred, il peut scroller dedans comme les exemples que tu m’as envoyé, les contenus affichés sont les content publique uploadés par le créateur. Et pour “ Inclure aussi les liens de paiements présent dans le link in bio dans le feed in-app chat.” -> Il faut que les links avec les contenus à acheter apparaissent dans le feed avec ces contenus blurred ? Pas sûr d’avoir bien compris celle ci déso. Oui on double la visibilité des liens de paiements et  on les propose par défaut en format blurred post





-  Les liens payants restent payants individuellement en plus de l'abo, ou l'abo donne accès à tout ? Ils restent payants , l’abo donne accès à un feed TB : Ok clair
-  Le créateur peut choisir quels contenus sont "discover only" vs toujours accessibles comme pour visible publique ou non visible publique actuellement ? Oui mais pour l’instant elle ne pourra en proposer qu’un seul par défaut. TB : On peut garder le fonctionnement de content sur ça, où elle switch ses contenus en privé et publique, t’en penses quoi? Tu veux que la créatrice puisse proposer des contenus dans ce feed qui soient débloquables. On met 1 image maximum en public pour inciter les gens à s’abonner, j’aimerais qu’elle puisse switch privé et public mais qu’elle puisse aussi proposer du contenu payant sur ce feed. ✅







-  Photos floutées : si pas de content on met une image placeholder blurred. oui 
TB : Ok donc si pas de content en publique visible on met juste un image par défaut blurred dans ce feed. Oui ✅
-  Résiliation côté fan : accès coupé immédiatement ou jusqu'à la fin de la période payée ? jusqu'à la fin de la période payée 
TB : Ok
---

 4. Feed / Fil d'actualité

Ajouter un fil d'actualité sur le profil public du créateur, style LinkMe, avec des éléments floutés pour inciter à l'abo ou à l'achat. 








La partie contenue doit se transformer en partie feed avec un post preview et le reste flouté 


Laisser la possibilité de mettre un message au dessus de la photo
TB : Ok c’est clair

Réf : https://link.me/sophieraiin

Questions à trancher :
-  Le feed a un système de likes / vues / commentaires ? Ou c'est juste une grille de posts visuels ? Juste une grille de posts avec un message, pas de likes, ni de commentaires.  
-  Les "posts" cela devrait être un nouveau type d'entité en DB
TB : si pas de likes etc je pense que je peux conserver l’entité content en DB
-  Le feed est lié au système d'abonnement "Discover" (point 3) ? C'est-à-dire flouté pour les non-abonnés ? C’est ça, flouté pour les non abonnés, excepté 1 post en preview que la modèle choisie.
-  Le créateur poste depuis où ? Un nouvel onglet dans le dashboard ? Ou ce feed doit être généré automatiquement à partir de ses liens/contenus ? Automatiquement à partir du contenu que la modèle upload et valide en tant que feed. 
TB : Ok sur ça ma recommandation est que la partie “Content” alimente ce feed car le fonctionnement est similaire (visible / non visible)
-  Quand un fan clique sur un post flouté, il se passe quoi ? Popup d'abo ? Renvoi vers la page de paiement du lien ? Popup abo

—

Ajout de feature in-app chat : explorer page. 

Pour les creators en pro il pourront être feature automatiquement et en prioritédans une partie “discovery” située tout en bas dans le feed. Les créateurs free arriveront par la suite. Il faudra aussi mettre en place un filtre créateur masculin / féminim et feature que les féminim pour commencer .  

TB : Donc dans le feed de “posts” d’un créateur, tout en bas on a une section en plus avec des recommandations de profil publique créateurs ayant l’abonnement premium, et si on scroll là dedans on défile tous les profils premium, jusqu’aux profils free.


Oui mais pas directement dans le lien en bio. La partie discovery sera visible seulement dans la partie feed “in-app”, catégorie à côté du chat.

https://unlockt.me/v/c9246c6f91



Cette feature pourra être proposer également 



 5. Custom Request sans inscription obligatoire

Aujourd'hui le fan est redirigé vers `/fan/signup?creator=lounasmodels` avant de pouvoir faire quoi que ce soit. On veut qu'il puisse écrire et payer sa custom request sans être obligé de créer un compte avant. 

Il faut faire une autorisation bancaire où les forcer à faire un deposit de 20$ minimum pour les custom request sinon la modèle va se retrouver avec pleins de demandes de personnes qui ne paieront jamais.

-> Là actuellement on demande à l’user de se connecter pour placer sa custom request (pour associer la demande à un compte pour le déblocage si elle est acceptée), mais dans le flux actuel une fois connecté l’user paye bien sa custom request avant qu’elle soit transmise à la créatrice donc pas de demandes de personnes qui ne paieront jamais.

Parcours UX envisagé (à confirmer) :
1. Le fan arrive sur le profil public du créateur
2. Il clique sur "Custom Request"
3. Il écrit sa demande + voit le prix
4. Il paie (checkout UGP)
5. Après paiement → création de compte obligatoire pour finaliser sa custom request Oui , juste si le fan ne veut pas créer son compte on lui envoie un mail avec la custom. 
-> Ca marche


Questions à trancher :
-  On valide ce parcours ? Oui on valide ce parcours. Le fan crée un compte après paiement, ou jamais ? Si jamais, comment lui permettre de suivre sa custom request sans compte? si le fan ne veut pas créer son compte on lui envoie un mail avec la custom. En indiquant un mail post checkout comme pour les liens ? Oui
-  Si pas de compte : comment le créateur répond ? Email avec la réponse ? Ou on force la création de compte après paiement pour donner accès au chat ? S’il veut parler avec la modèle il s’inscrira. On peut mettre un call-to-action pour qu’il crée son compte dans l’email une fois qu’il a reçu la custom.
TB : Ok
---

 6. Liens de paiement depuis la Content Library

Permettre au créateur de sélectionner plusieurs contenus dans la Content Library et de générer un lien de paiement directement. Le chatter peut déjà le faire depuis le chat avec les contenus du créateur sous gestion — on veut rendre ça possible aussi pour le créateur lui-même.

Fonctionnement :
- Sélection multiple dans ContentLibrary
- Bouton "Créer un lien de paiement" → pré-remplit CreateLink avec les assets sélectionnés
- Rendre cette feature accessible aussi depuis le chat créateur (pas seulement côté chatter) ok

---

 7. Fusion Dashboard + Earnings

Fusionner les pages `/app/dashboard` et `/app/earnings` en une seule.

Questions à trancher :
-  Quel layout ? Les deux sections empilées sur une seule page ? Ou des sous-onglets (Overview / Earnings) dans la même page ?
-  Quels éléments du dashboard actuel on garde ? (stats, graphiques, activité récente)
-  Quels éléments d'Earnings on garde ? (wallet balance, historique transactions, withdrawals)
-  La page fusionnée reste à `/app/dashboard` ou /app/earnings ?

Intègre les deux de sorte à ce que ce soit plus propre et qu’il y est qu’une seule section liée aux earnings.

---

 8. Delete Account + Rétention

Ajouter un bouton "Delete Account" dans les settings. Au clic, afficher un message de rétention du style "We are sad to see you leaving" avec une offre de 1 mois d'essai gratuit Pro. Oui on lui propose 50% de réduction plutôt que 1 mois d’essai autrement il va y avoir des abus.


Questions à trancher :
-  Le bouton est bien à placer dans dans `/app/settings` ?
-  On applique la même logique de rétention quand le créateur tente de résilier son abo Pro (pas seulement la suppression de compte) ? On lui propose 50% de réduction.
TB : OK 
-  Le free trial offert passe par UGP recurring avec période d'essai ? → Vérifier avec UGP si le free trial est supporté sur les recurring payments, à voir avec derek
-  Suppression = soft delete (désactivation) ou hard delete (suppression totale des données) ? Soft delete et on lui laisse 6 mois pour revenir. Hard delete à partir de 6 mois.

---

 9. Landing Page — Améliorations Mobile

Rendre la landing page principale (`Index.tsx`) plus adaptée au mobile.

Changements demandés :
- Slider/carousel horizontal pour les étapes 1→5 au lieu du scroll vertical
- Carrousel de photos créateurs : les 2 lignes doivent avoir des créateurs distincts, pas de doublons
- Ajouter une vidéo sur la landing page -> A me fournir, idem pour la vidéo mentionnée au debut de l’onboarding

Questions à trancher :
-  La vidéo : on utilise un des fichiers existants (`exclu-demo.mp4`, `exclu-teaser.mp4`) ou il faut en fournir une nouvelle ? Je vais t’en envoyer une nouvelle 
-  Le slider des étapes : swipe mobile uniquement, ou aussi sur desktop ? mobile seulement
-  Le carrousel créateurs sur la landing : j’utilise les photos initiales que tu m’avais fourni (comme actuellement), ou bien on prends maintenant des photos des vrais créateurds ?
On garde les photos actuelles, juste on fait en sorte que les 2 listes de photos qui défilent soient distinctes 
TB : OK

---

 10. SEO, URLs Directory + FAQs + Contenu

Optimiser le SEO des pages directory : changement d'URLs, ajout de contenu (FAQs, texte), meta descriptions. Objectif : minimum 1200 mots par page.

Changements d'URLs :
- `/directory/agencies` → `/directory/onlyfans-agency-review`
- `/directory/creators` → `/directory/best-onlyfans-creators`
- `/directory/agencies/lounas-models` → `/directory/agencies/lounas-models-review`

Contenu à ajouter :
- FAQs pour chaque page directory (agencies, creators, tools, pages individuelles)
- Texte SEO avec mots-clés ciblés
- Meta descriptions optimisées
- Ajouter "OnlyFans agency" dans les URLs et titres

Questions à trancher :
-  Les anciennes URLs redirigent (301) vers les nouvelles ? non pas besoin 
-  Le suffixe `-review` s'applique à toutes les agences ? oui
-  Le contenu des FAQs est fourni par toi, ou je doit le génèrer ? Je vais les fournir.
J’aimerais créer une FAQs et du text également pour chaque agence histoire que ça rank. Après il y a 300 agences donc un peu compliqué, à considérer.

-> Pour les text agences peux extraire toutes les agences en bdd, faire tourner un script avec un llm qui se charge de générer du texte pour chaque agence et derrière injecter ça en bdd, il me faudrait juste des exemples pour avoir une base. Et faire en sorte que ce soit bien référencé sur ces texts. Tu veux ?



-  Les meta descriptions sont fournies ou à rédiger ? oui 

-  Il faut aussi modifier les slugs en DB pour les agences existantes ? il faut des slug style nomd’agence-review 
TB : OK
---

 11. Custom Domain pour Link-in-Bio

Permettre au créateur d'acheter un custom domain en .com pour son link-in-bio (profil publique créateur). Exclu suggère 3 noms de domaines et prend une marge de 65% (ex : domain à 10$ → vendu 16.50$).

Cette feature est vraiment vraiment complexe techniquement, cela demande d’intégrer une api d’achat de nom de domaine, set un produit récurrent en plus de l’abonnement premium du prix du nom de domaine choisi, une configuration automatique du DNS, attribution dynamique du domaine… 
Il y a minimum 4 jours de travail juste pour celle ci
-> Me confirmer qu'elle est réellement souhaitée avant de se lancer.



Questions à trancher si feature souhaitée :
-  Quel registrar en backend ? (Namecheap API, Cloudflare Registrar API, autre ?) aucune idée


-  Comment gérer le DNS ? Le domain doit pointer vers Vercel → CNAME/A record automatique
-  Vercel supporte les custom domains par projet, mais ici chaque créateur aurait son propre domain sur la même app → il faut soit du wildcard hosting, soit ajouter les domains dynamiquement via l'API Vercel

-  Renouvellement annuel automatique ? automatique avec la possibilité de cancel
 Exclu gère le renouvellement et facture le créateur ? 

-  Que se passe-t-il si le créateur ne renouvelle pas ? Fallback vers `exclu.at/handle` ? oui 

-  SSL automatique via Vercel pour les custom domains ? aucune idée

-> TB : Feature non retenu (whatsapp 14 avril)

---

 12. Referral — Bouton distinctif

Ajouter un bouton plus visible/distinctif dans la section Referral (`/app/referral`).

Questions à trancher :
Ce qui a été ajouté auj est ok ? Oui , juste j’aimerais ajouter une landing page referral de ce type:  oui c’est mieux 



J’aimerais juste qu’on ajoute un call to action

“Refer friends and grow together” avec un rappel de l’affli et une image qui rend la chose plus attractif. Je te l’enverrai.

TB : Ca marche

Pour la partie affiliate : Il faudra créer une page similaire à https://taap.it/fr/affiliate . exclu.at/affiliate 
Je vais la générer sur claude avec le style et quelques images et je te l’enverrai cette semaine 


---

 13. Mode Jour (Light Mode)

Ajouter un mode jour (thème clair) à l'app. Le `ThemeContext` existe déjà. 

Questions à trancher :
-  Le mode jour doit s’appliquer où en plus sur l’app ? J’aimerais repartir sur une mode jour blanc avec police noir, il y a un peu de marron

TB : On garde pas le jaune en mode clair ?  Non on repart sur du blanc ✅

TB : Pour la landing page également (elle existe juste en mode sombre) ? 
Je vais ducoups switcher sur le mode clair par défaut pour l’app, en gardant quand même le mode sombre pour ceux qui préfèrent ok? Oui on garde mode jour/nuit


---

 14. Preview Link-in-Bio - Pour le link in bio on le fait flouté en background avec une photo de profil centrale et username comme : https://x.com/deadinsid3x/status/2041845901199622407

Essayer de garder de la couleur

 — Mode flouté

Ajouter un mode "preview floutée" pour les link-in-bio et les liens de paiement partagés sur les réseaux.

Réf :
- https://x.com/deadinsid3x/status/2041845901199622407
- https://x.com/7lenawln/status/2041620812625506323




Questions à trancher :
-  C'est pour l'OG preview (image de partage Twitter/Insta) ou pour la page elle-même quand on la visite ?
-  Si OG preview : on génère une image floutée automatiquement à partir du contenu réel ou on peut mettre toujours la même image floutée ?

TB : Je vais devoir prendre une image floutée random pour cette preview (pas celle réellement associée au link sinon ça risque de permettre à des gens de la récupérer sans payer). Il nous faut un système un système qui floute automatiquement comme unlockt.
---

 15. Email / Mailing

Demande : "Reprendre le contrôle du mailing."

Aujourd'hui, on peut extraire en CSV tous les users et gérer le mailing dans Brevo indépendamment de l'app.

Questions à trancher :
-  Ça veut dire quoi concrètement "reprendre le contrôle" ? Oui j’aimerais pouvoir envoyer des emails automatiques de newsletter et ajuster les mails automatiques de notifications.

TB : Ok donc ce qui est souhaité c’est un configurateur pour les templates de mail automatique qui soit intégré directement sur la plateforme (type brevo), que quand tu modifies les templates depuis la partie admin cela s’applique sur la plateforme (stockage des mails transactionnels à déplacer vers la base de données et possibilité d’édition). Et également un module permettant d’envoyer des mails ponctuels sur des listes d’users à définir selon des critères (rôle, activité..), directement depuis la partie admin. N’hésites pas si tu veux ajouter des précisions sur cette partie. Ok c’est clair, faisons ça ✅


  - Un outil de mailing intégré dans l'admin panel ?
  - Des emails automatiques (drip campaigns) déclenchés par des events dans l'app ?
  - Supprimer l'email d'onboarding actuel ? -> Il faut une confirmation par email sinon des bots vont spammer le SaaS, et niveau rgpd c’est obligatoire.

Test l’onboarding de https://hoo.be/ , ils proposent aucun email de confirmation.

L’email met parfois quelques minutes à s’afficher, ça freine l’onboarding pour pleins de modèles. Il faut supprimer ce mail de confirmation comme https://hoo.be/ 
RGPD on met de côté pour l’instant, la majorité (90%) de la clientèle va se situer aux USA 

Dans ma V1 quand j’étais sur bubble j’étais sans email de validation et j’ai eu aucun problème.

TB : Ok je vais creuser ça pour simplifier, il faut que je comprenne ce qu’ont setup hoo.be mais je t’alerte néanmoins sur le fait que avec ce fonctionnement n’importe qui peut créer des comptes sur des emails qui ne sont pas les leurs. Exemple : si demain plus de vérification par mail, je peux créer un compte avec le mail de quelqu’un d’autre (connu éventuellement), et potentiellement l’impersonnifier pour faire de l’argent. Je vois pas mal de dérives de ce type, mais je vais creuser le sujet pour appliquer ta demande tout en prenant toutes les mesures de sécurités nécéssaire (rate limiting, contrôle ip..)


Je comprends et je prends en compte les risques liés à ça, malheureusement les créateurs / fans ont de moins en moins d’attention donc je peux pas les faire patienter. Il faut donc s’insipirer de hoo.be 








  - Autre chose ?




---

 16. Ajustements Design divers

Corrections design mentionnées en vrac, à préciser.

Liste :
- Fusion de catégories (lesquelles ? Le `ModelCategoryDropdown` a déjà été supprimé de l'onboarding)
- Popup(s) à ajuster (lesquelles ?)

Vérifie que la localisation / residency a été enlevé  



https://www.reddit.com/media?url=https%3A%2F%2Fpreview.redd.it%2Ftop-4-5-on-onlyfans-makes-1-5k-per-week-v0-w2smfqugzzjf1.jpeg%3Fauto%3Dwebp%26s%3D94bf03747cfaeeae8b1bd0df18dcf4dfefb3eaaf




À considérer pour la suite
notes: considérer un pricing dynamique où plus le fans paye plus ça descend. Style jusqu’à 24$ -> 20% de frais , 15% jusqu’à 100$ , 200$ -> 10% de frais)

TB : ça marche, il faut me dire si je la considère pour la suite seulement ou si je l’implémente dans cette phase 

À considérer pour la suite 
