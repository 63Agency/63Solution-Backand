# API Propositions (backend Nest)

Authentification JWT sur toutes les routes (`Authorization: Bearer <token>`).

Base URL locale : `http://localhost:3002`

Table : `public.propositions` — champs structurés en **JSONB** (`emetteur`, `introduction`, `strategie`, `tarifs`, `contact`, etc.). Aucune migration SQL n’est requise pour ajouter un champ dans `tarifs.lignes[]` : il est persisté dans le JSON à `POST` / `PATCH`.

---

## Routes principales

| Méthode | Chemin | Statut | Description |
|---------|--------|--------|-------------|
| `GET` | `/propositions` | 200 | Liste |
| `POST` | `/propositions` | 201 | Créer |
| `PATCH` | `/propositions/:id` | 200 | Modifier |
| `DELETE` | `/propositions/:id` | 200 | Supprimer (`:id` = uuid **ou** numéro `PROP-…`) |
| `DELETE` | `/propositions/by-numero/:numero` | 200 | Supprimer par numéro officiel |
| `POST` | `/propositions/:id/delete` | 200 | Alias suppression (uuid ou numéro) |
| `POST` | `/propositions/by-numero/:numero/delete` | 200 | Alias suppression par numéro |
| `GET` | `/propositions/:id/pdf` | 200 | PDF binaire |
| `POST` | `/propositions/:id/send-email` | 200 | Envoi email (+ alias `/email`, `/send`) |

---

## Bloc `tarifs` (POST / PATCH)

```json
{
  "tarifs": {
    "lignes": [
      {
        "service": "Gestion Publicitaire (Facebook & Instagram)",
        "detail": "Gestion et optimisation des campagnes",
        "prixInitial": "5 550 / mois",
        "prixOffert": "4 000 / mois"
      }
    ],
    "noteMetaAds": "Note optionnelle sous le tableau…"
  }
}
```

### Champs `tarifs.lignes[]`

| Champ | Type | Requis | Max | Notes |
|--------|------|--------|-----|--------|
| `service` | string | oui | 500 | Colonne **Service** du PDF |
| `detail` | string | non | 500 | Colonne **Détail** du PDF ; `**mot**` → gras (comme l’intro) |
| `prixInitial` | string | oui | 200 | Colonne **Prix Initial (MAD)** |
| `prixOffert` | string | oui | 200 | Colonne **Prix Offert (MAD)** |
| `noteMetaAds` | string | oui (bloc) | 2000 | Texte sous le tableau |

**Rétrocompatibilité** : les propositions sans `detail` restent valides ; le PDF affiche **—** dans la colonne Détail.

**Exemple avec gras dans le détail** :

```json
{
  "detail": "Gestion et **optimisation** des campagnes"
}
```

---

## Bloc `strategie.section2CampagnesPublicitaires` (POST / PATCH)

L’ancien champ unique `texte` est remplacé par une structure structurée (stockée dans le JSONB `strategie`).

```json
{
  "strategie": {
    "section2CampagnesPublicitaires": {
      "intro": "Mise en place de campagnes Meta Ads…",
      "approcheIntro": "Notre approche repose sur **deux volets essentiels…** :",
      "blocs": [
        {
          "titre": "1. Création & Paramétrage des campagnes",
          "intro": "Mise en place stratégique…",
          "points": [
            "Paramétrage précis…",
            "Création des messages…",
            "Structuration…"
          ]
        },
        {
          "titre": "2. Optimisation continue des performances",
          "intro": "Suivi et optimisation…",
          "points": [
            "Améliorer la qualité…",
            "Ajuster les audiences…",
            "Garantir un flux…"
          ]
        }
      ],
      "conclusion": "Les campagnes seront ainsi optimisées… **flux régulier et maîtrisé…**"
    }
  }
}
```

### Champs

| Champ | Type | Requis | Notes |
|--------|------|--------|--------|
| `intro` | string | oui | Paragraphe(s) d’introduction (séparés par `\n\n` si besoin) |
| `approcheIntro` | string | oui | Peut être vide ; `**mot**` → gras dans le PDF |
| `blocs` | array | oui | 0 à 10 blocs |
| `blocs[].titre` | string | oui | Titre en gras dans le PDF |
| `blocs[].intro` | string | oui | Paragraphe sous le titre |
| `blocs[].points` | string[] | oui | Liste à puces |
| `conclusion` | string | oui | Peut être vide ; `**mot**` → gras |

### PDF `GET /propositions/:id/pdf` (page 2)

Rendu section **2. Campagnes Publicitaires** :

1. Paragraphe(s) `intro`
2. `approcheIntro` avec gras `**…**`
3. Pour chaque bloc : titre en gras, paragraphe `intro`, puces `points[]`
4. `conclusion` avec gras `**…**`

**Rétrocompatibilité** : les lignes encore au format `{ "texte": "…" }` sont converties à la lecture (`intro` = ancien `texte`, autres champs vides). La conversion s’applique au `GET`, à l’enregistrement et au PDF.

Référence front : `PropositionPdfPreview.tsx` (section 2).

---

## PDF — tableau « Tarifs Proposés » (page 3)

Quatre colonnes, dans l’ordre :

1. **Service**
2. **Détail** (nouveau)
3. **Prix Initial (MAD)**
4. **Prix Offert (MAD)**

Règles de rendu (`src/propositions/proposition.pdf.ts`) :

- `detail` : même traitement que les paragraphes d’introduction — segments entre `**` en gras ; noms établissement / objectif peuvent aussi être mis en évidence.
- `detail` absent ou vide → cellule **—**.
- Largeurs colonnes approximatives : 26 % / 34 % / 20 % / 20 %.

Génération : `GET /propositions/:id/pdf` après enregistrement.

---

## Exemple cURL (extrait tarifs)

```bash
curl -s -X PATCH "http://localhost:3002/propositions/PROP_UUID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "tarifs": {
      "lignes": [{
        "service": "Gestion Publicitaire (Facebook & Instagram)",
        "detail": "Gestion et optimisation des campagnes",
        "prixInitial": "5 550 / mois",
        "prixOffert": "4 000 / mois"
      }],
      "noteMetaAds": ""
    }
  }'
```

*(Le PATCH complet exige en pratique le corps validé par `UpsertPropositionDto` ; en production le front envoie l’objet proposition entier.)*

---

## DELETE `/propositions/:id`

- JWT obligatoire
- Ownership : non-admin → seulement ses propositions (`created_by`)
- Succès **200** : `{ "message": "Proposition supprimée.", "id": "uuid" }`
- Erreurs : `404` introuvable, `403` interdit, `409` si aucune ligne supprimée ou contrainte DB

**Important front** : après `POST /propositions`, utiliser l’`id` **uuid** de la réponse pour supprimer. Ne pas utiliser un id localStorage temporaire ni le `numero` (PROP-2026-001).

Si la ligne disparaît à l’écran mais réapparaît au refresh → le front n’a probablement pas appelé l’API DELETE (suppression **localStorage** seulement).

### Cause n°1 (la plus fréquente) — front encore en localStorage

Le dashboard propositions a été développé d’abord en **localStorage**. Tant que le handler supprimer ne fait pas :

```ts
await fetch(`${NEXT_PUBLIC_API_URL}/propositions/${id}`, {
  method: 'DELETE',
  headers: buildAuthHeaders(),
});
```

la ligne reste dans **Supabase** même si elle disparaît à l’écran.

`id` = **uuid** renvoyé par `POST /propositions` (ex. `1763a637-6977-40ae-a6d0-1c8a39aa2825`), **pas** `PROP-2026-011` ni un id local du type `prop-123`.

### Vérification rapide

1. Onglet **Network** du navigateur → supprimer une proposition.
2. Tu dois voir `DELETE …/propositions/<uuid>` → **200**.
3. Dans le terminal Nest : `DELETE /propositions/<uuid> (user …)`.
4. Si rien dans Network → corriger le **front**, pas Supabase.

### Alias POST (si DELETE bloqué)

`POST /propositions/:id/delete` — même effet que `DELETE /propositions/:id`.

### SQL optionnel

Si RLS est activé sur la table : `sql/013-propositions-rls-service.sql`

---

## Checklist intégration front

- [ ] Envoyer `detail` dans chaque ligne de `tarifs.lignes` à la création / édition
- [ ] Prévisualisation alignée sur 4 colonnes (`PropositionPdfPreview.tsx`)
- [ ] Anciennes propositions sans `detail` : pas d’erreur API ; PDF avec **—**
- [ ] Après déploiement backend, redémarrer Nest et regénérer le PDF pour vérifier la colonne Détail
- [ ] Suppression : `DELETE /propositions/{id}` avec l’uuid serveur ; retirer la ligne du tableau seulement après succès 200

---

## Fichiers source

| Fichier | Rôle |
|---------|------|
| `src/propositions/dto/upsert-proposition.dto.ts` | Validation `detail` optionnel |
| `src/propositions/types/proposition.types.ts` | Types TypeScript |
| `src/propositions/propositions.service.ts` | Persistance JSONB Supabase |
| `src/propositions/proposition.pdf.ts` | Tableau 4 colonnes + gras sur `detail` |
| `sql/010-propositions-table.sql` | Schéma table (`tarifs jsonb`) |
