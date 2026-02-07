# OG Preview Edge Function

Cette Edge Function génère des previews Open Graph dynamiques pour les profils créateurs et les liens payants sur les réseaux sociaux (Twitter, WhatsApp, Facebook, etc.).

## Fonctionnalités

### Détection des Bots
- Détecte automatiquement les bots des réseaux sociaux (Twitter, Facebook, WhatsApp, Telegram, LinkedIn, etc.)
- Redirige les utilisateurs normaux vers l'application React
- Génère du HTML avec meta tags Open Graph pour les bots

### Preview Profil Créateur (`/@handle`)
**Design** :
- Fond noir (#0A0A0F)
- Avatar du créateur (120px, rond)
- Handle (@username)
- Bio du créateur
- Bouton "Access my profile" (vert)

**Meta Tags** :
- `og:type`: profile
- `og:title`: Nom du créateur (@handle)
- `og:description`: Bio du créateur
- `og:image`: Avatar du créateur
- `twitter:card`: summary_large_image

### Preview Lien Payant (`/l/slug`)
**Design** :
- Fond avec image floutée (preview du contenu)
- Titre du contenu
- Footer : "Exclu — Sell your content with 0% commission"

**Meta Tags** :
- `og:type`: article
- `og:title`: Titre du contenu
- `og:description`: "Unlock exclusive content on Exclu"
- `og:image`: Image de preview du contenu
- `twitter:card`: summary_large_image

## Déploiement

### 1. Déployer la fonction
```bash
supabase functions deploy og-preview
```

### 2. Configurer le routing

Vous devez configurer votre hébergement pour rediriger les requêtes vers cette Edge Function.

#### Option A : Netlify
Ajoutez dans `netlify.toml` :

```toml
[[redirects]]
  from = "/@:handle"
  to = "/.netlify/functions/og-preview/@:handle"
  status = 200
  force = false
  conditions = {User-Agent = ["bot", "crawler", "spider", "facebook", "twitter", "whatsapp", "telegram", "linkedin", "pinterest", "slack", "discord"]}

[[redirects]]
  from = "/l/:slug"
  to = "/.netlify/functions/og-preview/l/:slug"
  status = 200
  force = false
  conditions = {User-Agent = ["bot", "crawler", "spider", "facebook", "twitter", "whatsapp", "telegram", "linkedin", "pinterest", "slack", "discord"]}
```

#### Option B : Vercel
Ajoutez dans `vercel.json` :

```json
{
  "rewrites": [
    {
      "source": "/@:handle",
      "destination": "/api/og-preview/@:handle",
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
      "destination": "/api/og-preview/l/:slug",
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

#### Option C : Configuration manuelle
Si votre hébergeur ne supporte pas les redirects conditionnels, vous pouvez :
1. Utiliser un reverse proxy (Cloudflare Workers, etc.)
2. Modifier votre serveur web (nginx, Apache) pour détecter les bots

## Amélioration Future : Génération d'Images OG Dynamiques

Pour des previews encore plus belles, vous pouvez implémenter la génération d'images OG dynamiques :

### Option 1 : Utiliser Deno Canvas
```typescript
import { createCanvas, loadImage } from 'https://deno.land/x/canvas/mod.ts';

async function generateCreatorOGImage(profile: CreatorProfile): Promise<string> {
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');
  
  // Fond noir
  ctx.fillStyle = '#0A0A0F';
  ctx.fillRect(0, 0, 1200, 630);
  
  // Avatar (centré)
  const avatar = await loadImage(profile.avatar_url);
  ctx.drawImage(avatar, 475, 150, 250, 250);
  
  // Handle
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`@${profile.handle}`, 600, 450);
  
  // Bio
  ctx.fillStyle = '#A0A0B0';
  ctx.font = '24px sans-serif';
  ctx.fillText(profile.bio || '', 600, 500);
  
  // Sauvegarder et uploader vers Supabase Storage
  const buffer = canvas.toBuffer('image/png');
  const fileName = `og-images/creator-${profile.handle}.png`;
  
  await supabase.storage
    .from('public')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: true });
  
  return supabase.storage.from('public').getPublicUrl(fileName).data.publicUrl;
}
```

### Option 2 : Utiliser un service externe
- [Vercel OG Image](https://vercel.com/docs/concepts/functions/edge-functions/og-image-generation)
- [Cloudinary](https://cloudinary.com/documentation/image_transformations)

## Test

### Tester localement
```bash
supabase functions serve og-preview
```

### Tester les meta tags
1. **Twitter Card Validator** : https://cards-dev.twitter.com/validator
2. **Facebook Sharing Debugger** : https://developers.facebook.com/tools/debug/
3. **LinkedIn Post Inspector** : https://www.linkedin.com/post-inspector/

### Exemple de requête
```bash
# Simuler un bot Twitter
curl -H "User-Agent: Twitterbot/1.0" https://exclu.at/@gaylord75fr

# Simuler un utilisateur normal
curl https://exclu.at/@gaylord75fr
```

## Monitoring

Surveillez les logs de la fonction :
```bash
supabase functions logs og-preview
```

## Performance

- **Cache** : Les réponses sont cachées pendant 1 heure (`Cache-Control: public, max-age=3600`)
- **Coût** : Gratuit jusqu'à 500K requêtes/mois sur Supabase
- **Latence** : ~100-300ms par requête (selon la base de données)

## Troubleshooting

### Les previews ne s'affichent pas
1. Vérifiez que le routing est correctement configuré
2. Testez avec les outils de validation (Twitter Card Validator, etc.)
3. Vérifiez les logs de la fonction
4. Assurez-vous que les images sont accessibles publiquement

### Les images ne s'affichent pas
1. Vérifiez que les URLs des images sont publiques
2. Vérifiez que les images respectent les dimensions recommandées (1200x630px)
3. Assurez-vous que les images sont en HTTPS

### La fonction est lente
1. Ajoutez un cache en base de données pour les meta tags
2. Pré-générez les images OG lors de la création du profil/lien
3. Utilisez un CDN pour les images
