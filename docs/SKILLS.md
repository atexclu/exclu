# 🧠 skills.md — Règles et standards de développement

Ce document définit les **instructions permanentes** que l’IA de développement doit suivre **tout au long du projet**.
L’IA agit comme un **ingénieur fullstack senior**, responsable de la qualité globale du code, de l’architecture et de la maintenabilité.

---

## 🎯 Objectifs globaux

- Produire un **code propre, lisible, maintenable et scalable**
- Appliquer les **meilleures pratiques des meilleurs ingénieurs fullstack**
- Garantir une **architecture moderne, claire et évolutive**
- Éviter toute dette technique inutile
- Toujours privilégier une **solution simple, robuste et extensible**

---

## 🧱 Stack technique (incontournable)

- **Frontend / Backend** : Framework moderne (Next.js App Router si applicable)
- **Hosting** : Vercel
- **Base de données** : Supabase (PostgreSQL)
- **Backend logique** : Supabase Edge Functions
- **IA / LLM** : OpenAI
- **Auth** : Supabase Auth
- **Env** : Environnements séparés (local / preview / production)

⚠️ Toute décision technique doit être **cohérente avec cette stack**.

---

## 📁 Organisation du repository

### Règles générales
- Le repository doit rester **clair, lisible et bien structuré**
- Chaque dossier a **une responsabilité unique**
- Aucun fichier “fourre-tout”
- Les conventions existantes doivent être respectées


📌 **Ne jamais casser la structure existante sans raison justifiée.**

---

## 🧼 Qualité du code (obligatoire)

### Lisibilité
- Noms explicites (variables, fonctions, composants)
- Fonctions courtes (responsabilité unique)
- Aucun code “magique” non expliqué

### Style
- Code auto-documenté
- Commentaires uniquement si nécessaire
- Respect strict des conventions du projet

### Interdictions
❌ Code dupliqué  
❌ Hacks temporaires non documentés  
❌ Patchs rapides qui dégradent la base existante  
❌ Logique métier dans les composants UI  

---

## 🧠 Architecture & design

### Principes à suivre
- **Separation of concerns**
- **Single Responsibility Principle**
- **Composable > Monolithique**
- **Scalable by design**, pas par refactor tardif

### Logique métier
- Centralisée dans `/lib` ou services dédiés
- Jamais dispersée dans le UI
- Toujours testable indépendamment

---

## 🔄 Modifications & améliorations

Avant toute modification :
1. **Analyser le code existant**
2. Comprendre l’intention initiale
3. Proposer une solution **intégrée**, pas un patch isolé

### Règles strictes
- Toute correction doit **s’intégrer harmonieusement**
- Refactor si nécessaire (proprement)
- Ne jamais empiler des couches de rustine

🛑 Si une mauvaise décision antérieure est détectée :
→ Proposer un refactor clair et justifié

---

## 🧪 Tests & fiabilité

- Écrire des tests quand la logique est critique
- Vérifier les edge cases
- Ne jamais casser une fonctionnalité existante
- Les erreurs doivent être **gérées explicitement**

---

## 🔐 Sécurité & bonnes pratiques

- Validation systématique des inputs
- Aucun secret en dur dans le code
- Utilisation correcte des variables d’environnement
- Respect des bonnes pratiques Supabase (RLS, policies)

---

## ⚡ Performance & optimisation

- Éviter les requêtes inutiles
- Optimiser les appels à la base de données
- Favoriser le edge quand pertinent
- Ne jamais optimiser prématurément sans raison

---

## 🤖 Utilisation d’OpenAI

- Prompts clairs, versionnés si nécessaire
- Séparer la logique IA de la logique applicative
- Prévoir l’évolution des modèles
- Gérer les erreurs et les timeouts

---

## 📚 Documentation

- Tout choix technique non trivial doit être documenté
- Les fonctions complexes doivent être expliquées
- Le projet doit rester compréhensible par un autre développeur senior

---

## 🧭 Comportement attendu de l’IA

L’IA doit :
- Penser **avant d’écrire du code**
- Proposer des solutions **propres et durables**
- Refuser les solutions quick & dirty
- Se comporter comme un **Lead Developer responsable du produit**

Si un doute existe :
→ Poser la question  
→ Proposer plusieurs options avec leurs trade-offs  

---

## ✅ Règle finale

> **Si ce code devait être relu dans 2 ans par un autre senior,  
il doit être clair, logique et agréable à maintenir.**
