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

1. Exécuter `sql/014-whatsapp-tables.sql` puis `sql/017-notifications-table.sql` dans Supabase.
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

## API front (JWT) — inchangée

| Méthode | Route | Description |
|---------|--------|-------------|
| GET | `/whatsapp/conversations` | Liste |
| GET | `/whatsapp/conversations/:id` | Détail |
| GET | `/whatsapp/conversations/:id/messages` | Messages |
| POST | `/whatsapp/conversations/:id/messages` | `{ "text": "..." }` → Meta + save outbound |
| PATCH | `/whatsapp/conversations/:id/read` | `unread_count = 0` + notifications liées lues |

Chaque message **inbound** (webhook Meta) met à jour `last_message_text`, `last_message_at`, incrémente `unread_count`, et crée une ligne `notifications` (`type: whatsapp.message`). Les messages **outbound** (POST messages) ne touchent pas `unread_count`.

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
