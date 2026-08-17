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

## Statuts meeting

| Valeur API | Label UI | Rappels auto |
|------------|----------|--------------|
| `scheduled` | Planifié | gardés |
| `confirmed` | Confirmé | gardés |
| `bon_qualified` | Bon Qualified | gardés |
| `done` | Fait | annulés |
| `cancelled` | Annulé | annulés |
| `no_show` | No-show | annulés |

SQL : `sql/032-meeting-statuses-confirmed-bon-qualified.sql`
