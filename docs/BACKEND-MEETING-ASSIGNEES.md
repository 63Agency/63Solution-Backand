# Meeting assignees — visibilité calendrier

## Concept

| Champ | Sens |
|-------|------|
| `members` | Leads **clients** (rappels WhatsApp / email) |
| `assignedUserIds` / `assignees` | Staff **interne** (`users`) — qui voit le RDV |

Les mentions (`assignedUserIds`) servent surtout à **donner l’accès à `fixed_meeting`**, pas à cacher les RDV aux admins.

---

## Visibilité `GET /meetings` (+ `/today`, `/upcoming`, `/stats`)

| Rôle | Règle |
|------|--------|
| `admin` | **Tous** les RDV (y compris legacy / `assignedUserIds` vide) |
| `admin_whatsapp` | **Tous** les RDV (idem) |
| `fixed_meeting` | Uniquement si `userId ∈ assignedUserIds` — **exclut** les legacy sans assignees |

---

## Create / Update

```json
{
  "assignedUserIds": ["uuid-sara", "uuid-billel"]
}
```

- Remplace la liste à l’update.
- Le **créateur** est toujours inclus (auto côté Nest).
- `fixed_meeting` : Nest force `[creatorId]` (pas de picker UI).
- `admin` / `admin_whatsapp` : peuvent mentionner l’équipe.

Réponse lecture :

```json
{
  "assignedUserIds": ["…"],
  "assignees": [
    { "userId": "…", "prenom": "…", "nom": "…", "email": "…", "role": "…" }
  ],
  "createdBy": "…",
  "members": []
}
```

---

## Picker équipe

1. `GET /users` — OK pour `admin` et `admin_whatsapp` (lecture)
2. Fallback : `GET /meetings/assignable-users`

---

## SQL

Voir `sql/031-meeting-assignees.sql` :

- `meetings.created_by`
- table `meeting_assignees (meeting_id, user_id)`

---

## Titres meeting (liste fixe)

Champ `title` (string) — valeurs exactes à la création / édition :

- `Audit Performance Marketing` (défaut front)
- `Audit Performance Marketing présentiel`
- `Audit Performance Marketing online`

Les RDV legacy avec un autre titre restent lisibles ; un `PATCH` doit forcer une des 3 valeurs.  
WhatsApp / email utilisent `meeting.title` tel quel.

---

## Filtre équipe (tableau RDV)

Select « Toute l’équipe » / Saad / Sara… — UI **admin** + **admin_whatsapp** uniquement (`fixed_meeting` ne le voit pas).

Option serveur :

```http
GET /meetings?assignedUserId=<uuid>
```

- Renvoie les RDV où cet user est dans `assignedUserIds`
- Autorisé pour `admin` + `admin_whatsapp` seulement (`fixed_meeting` → 403)
- Absent = pas de filtre équipe

Picker options : `GET /users` ou `GET /meetings/assignable-users`

---

## Statuts meeting

| Valeur API | Label UI | Rappels auto |
|------------|----------|--------------|
| `scheduled` | Planifié | gardés |
| `confirmed` | Confirmé | gardés |
| `bon_qualified` | Bon Qualified | gardés |
| `no_answer` | No answer | gardés |
| `done` | Fait | annulés |
| `cancelled` | Annulé | annulés |
| `reported` | Reported | annulés |
| `no_show` | No-show | annulés |

SQL : `sql/032-…`, `sql/034-meeting-statuses-no-answer-reported.sql`
