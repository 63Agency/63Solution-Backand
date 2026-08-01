# API WhatsApp / Meta Cloud (backend Nest)

## Architecture

```
N8N → Meta Graph API (envoi direct)
Meta webhooks → POST /whatsapp/webhooks/meta (public)
Nest            → Supabase (whatsapp_conversations, whatsapp_messages)
Front (JWT)     → GET/POST /whatsapp/...
Front envoi     → Nest → Meta Graph API (pas d’appel Meta depuis le navigateur)
```

## Setup

1. Exécuter dans Supabase (ordre) :
   - `sql/014-whatsapp-tables.sql`
   - `sql/017-whatsapp-reply-to.sql` / `sql/018-whatsapp-media-fields.sql` si besoin
   - `sql/017-notifications-table.sql`
   - `sql/028-whatsapp-message-edit-delete.sql` (edit / soft-delete)
2. `.env` :
   - `META_VERIFY_TOKEN` — chaîne aléatoire (même valeur dans Meta Developer → Webhook)
   - `META_ACCESS_TOKEN` — token Graph API (celui utilisé dans N8N)
   - `META_PHONE_NUMBER_ID` — ex. `115716589414850`
   - `META_GRAPH_API_VERSION` — optionnel, défaut `v18.0`
3. Meta for Developers → WhatsApp → Configuration → Webhook :
   - URL callback : `https://<ton-api>/whatsapp/webhooks/meta`
   - Verify token : valeur de `META_VERIFY_TOKEN`
   - Champs : `messages` (et statuts si proposé)
4. Redémarrer Nest.

## Webhook Meta (public)

### Vérification (GET)

`GET /whatsapp/webhooks/meta?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`

- Compare `hub.verify_token` à `META_VERIFY_TOKEN`
- Répond avec le `hub.challenge` en texte brut (200)

### Messages (POST)

`POST /whatsapp/webhooks/meta` — **sans JWT**, répond `{ "ok": true }` immédiatement.

Traite le payload `whatsapp_business_account` :

- **messages** → conversation + message `inbound`, `unread_count++`
- **statuses** → maj `whatsapp_messages.status` via `wati_message_id` (id Meta `wamid...`)

## API front (JWT)

| Méthode | Route | Description |
|---------|--------|-------------|
| GET | `/whatsapp/conversations` | Liste |
| GET | `/whatsapp/conversations/:id` | Détail |
| GET | `/whatsapp/conversations/:id/messages` | Messages (inclut `editedAt` / `isDeleted` / `deletedAt`) |
| POST | `/whatsapp/conversations/:id/messages` | `{ "text": "..." }` → Meta + save outbound |
| PATCH | `/whatsapp/conversations/:id/messages/:messageId` | Éditer le texte (**CRM only**) |
| DELETE | `/whatsapp/conversations/:id/messages/:messageId?forEveryone=` | Soft-delete CRM (+ Meta si `true`) |
| PATCH | `/whatsapp/conversations/:id/read` | `unread_count = 0` + notifications liées lues |

Chaque message **inbound** (webhook Meta) met à jour `last_message_text`, `last_message_at`, incrémente `unread_count`, et crée une ligne `notifications` (`type: whatsapp.message`). Les messages **outbound** (POST messages) ne touchent pas `unread_count`.

### PATCH message (édition)

```http
PATCH /whatsapp/conversations/:id/messages/:messageId
Authorization: Bearer <token>
Content-Type: application/json

{ "text": "nouveau contenu" }
```

- Uniquement messages **outbound** de type `text`.
- `text` vide → `400`.
- Message / conversation inconnus → `404`.
- Persiste `body` + `edited_at` ; réponse = objet message complet (`editedAt` inclus).
- Met à jour `lastMessageText` / `lastMessageAt` si le message édité est le plus récent.
- **CRM only** : Meta Cloud API n’offre pas d’édition fiable — le contact voit toujours le texte d’origine sur son téléphone.

### DELETE message (soft-delete)

```http
DELETE /whatsapp/conversations/:id/messages/:messageId?forEveryone=false
Authorization: Bearer <token>
```

| Query | Effet |
|-------|--------|
| `forEveryone=false` (défaut) | Soft-delete CRM (`is_deleted`, `deleted_at`) |
| `forEveryone=true` | Soft-delete CRM **+** tentative de révocation Meta (outbound only) |

- La ligne est **conservée** ; GET messages renvoie `isDeleted: true` / `deletedAt`.
- Inbound + `forEveryone=true` → `400`.
- Si Meta refuse la révocation → `400` clair (toast front + rollback optimistic) ; pas de soft-delete côté CRM.
- Si le message supprimé était le dernier, le preview conversation est recalculé.

> **Note Meta** : la Cloud API ne documente pas de delete/revoke stable. Nest tente `status: "deleted"` sur l’endpoint messages ; en cas d’échec, utiliser « Supprimer pour moi ».

## API Notifications (JWT)

Exécuter `sql/017-notifications-table.sql` dans Supabase.

| Méthode | Route | Description |
|---------|--------|-------------|
| GET | `/notifications?limit=50` | `{ unreadCount, items[] }` |
| PATCH | `/notifications/:id/read` | Marquer une notification lue |
| PATCH | `/notifications/read-all` | Tout marquer lu |

Exemple item : `type: whatsapp.message`, `href: /dashboard/conversations?c={uuid}`, `meta: { conversationId, phoneNumber, messageId? }`.

## Envoi Meta Graph API

```http
POST https://graph.facebook.com/v18.0/{META_PHONE_NUMBER_ID}/messages
Authorization: Bearer {META_ACCESS_TOKEN}
Content-Type: application/json

{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "212612345678",
  "type": "text",
  "text": { "preview_url": false, "body": "Bonjour" }
}
```

## Fichiers

- `src/whatsapp/meta.service.ts`
- `src/whatsapp/whatsapp.service.ts`
- `src/whatsapp/whatsapp.controller.ts`
- `src/whatsapp/whatsapp-webhook.controller.ts`
- `sql/014-whatsapp-tables.sql`
- `sql/028-whatsapp-message-edit-delete.sql`
