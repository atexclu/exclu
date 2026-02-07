# 🚀 Guide de Déploiement : OG Preview

Ce guide explique comment déployer la solution de previews Open Graph pour Exclu.

## 📋 Prérequis

- Compte Supabase configuré
- Application déployée sur Netlify/Vercel (ou autre)
- Accès au CLI Supabase

## 🛠️ Étape 1 : Déployer l'Edge Function

### 1.1 Installer le CLI Supabase (si pas déjà fait)

```bash
npm install -g supabase
```

### 1.2 Se connecter à Supabase

```bash
supabase login
```

### 1.3 Lier votre projet

```bash
supabase link --project-ref YOUR_PROJECT_ID
```

### 1.4 Déployer la fonction

```bash
supabase functions deploy og-preview
```

### 1.5 Vérifier le déploiement

```bash
supabase functions list
```

Vous devriez voir `og-preview` dans la liste.

## 🌐 Étape 2 : Configurer le Routing

### Option A : Netlify (Recommandé)

#### 2.1 Trouver votre URL Supabase

Votre URL de fonction est :
```
https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/og-preview
```

Remplacez `YOUR_SUPABASE_PROJECT_ID` par votre vrai ID de projet.

#### 2.2 Modifier `netlify.toml`

Le fichier `netlify.toml` a déjà été créé. Vous devez juste :

1. Ouvrir `netlify.toml`
2. Remplacer `YOUR_SUPABASE_PROJECT_ID` par votre vrai ID de projet Supabase
3. Commit et push les changements

```bash
git add netlify.toml
git commit -m "Add OG preview routing"
git push
```

#### 2.3 Redéployer sur Netlify

Netlify va automatiquement redéployer avec la nouvelle configuration.

### Option B : Vercel

Si vous utilisez Vercel, créez un fichier `vercel.json` :

```json
{
  "rewrites": [
    {
      "source": "/@:handle",
      "destination": "https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/og-preview/@:handle",
      "has": [
        {
          "type": "header",
          "key": "user-agent",
          "value": ".*(bot|crawler|spider|facebook|twitter|whatsapp|telegram|linkedin).*"
        }
      ]
    },
    {
      "source": "/l/:slug",
      "destination": "https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/og-preview/l/:slug",
      "has": [
        {
          "type": "header",
          "key": "user-agent",
          "value": ".*(bot|crawler|spider|facebook|twitter|whatsapp|telegram|linkedin).*"
        }
      ]
    }
  ]
}
```

## ✅ Étape 3 : Tester

### 3.1 Tester en local

```bash
# Simuler un bot Twitter
curl -H "User-Agent: Twitterbot/1.0" https://exclu.at/@votrehandle

# Vous devriez voir du HTML avec les meta tags Open Graph
```

### 3.2 Tester avec les outils officiels

1. **Twitter Card Validator**
   - Aller sur : https://cards-dev.twitter.com/validator
   - Entrer : `https://exclu.at/@votrehandle`
   - Vérifier que la preview s'affiche correctement

2. **Facebook Sharing Debugger**
   - Aller sur : https://developers.facebook.com/tools/debug/
   - Entrer : `https://exclu.at/@votrehandle`
   - Cliquer sur "Scrape Again" pour forcer le rafraîchissement

3. **LinkedIn Post Inspector**
   - Aller sur : https://www.linkedin.com/post-inspector/
   - Entrer : `https://exclu.at/@votrehandle`

### 3.3 Tester sur les réseaux sociaux

1. **Twitter/X**
   - Créer un nouveau tweet
   - Coller le lien `https://exclu.at/@votrehandle`
   - La preview devrait s'afficher automatiquement

2. **WhatsApp**
   - Envoyer le lien dans une conversation
   - La preview devrait s'afficher après quelques secondes

3. **Telegram**
   - Envoyer le lien dans une conversation
   - La preview devrait s'afficher instantanément

## 🎨 Étape 4 : Améliorer les Previews (Optionnel)

### 4.1 Créer des images OG par défaut

Créez des images par défaut pour les cas où l'avatar ou l'image de preview n'existe pas :

1. **Pour les profils** : `public/default-avatar.png` (1200x630px)
2. **Pour les liens** : `public/default-link-og.png` (1200x630px)

### 4.2 Générer des images OG dynamiques

Pour des previews encore plus belles, vous pouvez implémenter la génération d'images OG dynamiques (voir `supabase/functions/og-preview/README.md`).

## 📊 Étape 5 : Monitoring

### 5.1 Vérifier les logs

```bash
supabase functions logs og-preview --tail
```

### 5.2 Surveiller les performances

Dans le dashboard Supabase :
1. Aller dans "Edge Functions"
2. Cliquer sur "og-preview"
3. Voir les métriques (requêtes, latence, erreurs)

## 🐛 Troubleshooting

### Problème : Les previews ne s'affichent pas

**Solution** :
1. Vérifier que la fonction est bien déployée : `supabase functions list`
2. Vérifier les logs : `supabase functions logs og-preview`
3. Tester avec curl : `curl -H "User-Agent: Twitterbot/1.0" https://exclu.at/@handle`
4. Vérifier que le routing est correctement configuré dans `netlify.toml`

### Problème : Les images ne s'affichent pas

**Solution** :
1. Vérifier que les URLs des images sont publiques
2. Vérifier que les images sont en HTTPS
3. Vérifier que les images respectent les dimensions (1200x630px recommandé)

### Problème : La fonction est lente

**Solution** :
1. Ajouter un cache en base de données
2. Pré-générer les images OG lors de la création du profil/lien
3. Utiliser un CDN pour les images

### Problème : Erreur 500

**Solution** :
1. Vérifier les logs : `supabase functions logs og-preview`
2. Vérifier que les variables d'environnement sont correctes
3. Vérifier que la base de données est accessible

## 🎯 Checklist de Déploiement

- [ ] Edge Function déployée sur Supabase
- [ ] `netlify.toml` configuré avec le bon PROJECT_ID
- [ ] Application redéployée sur Netlify
- [ ] Testé avec Twitter Card Validator
- [ ] Testé avec Facebook Sharing Debugger
- [ ] Testé sur Twitter/X
- [ ] Testé sur WhatsApp
- [ ] Images par défaut créées
- [ ] Monitoring configuré

## 📚 Ressources

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Facebook Sharing](https://developers.facebook.com/docs/sharing/webmasters)

## 💡 Prochaines Étapes

1. **Générer des images OG dynamiques** pour des previews encore plus belles
2. **Ajouter un cache** pour améliorer les performances
3. **Personnaliser les previews** selon le thème du créateur
4. **Ajouter des analytics** pour suivre les partages

---

**Besoin d'aide ?** Consultez les logs avec `supabase functions logs og-preview --tail`
