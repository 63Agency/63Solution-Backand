# API WhatsApp / Wati (backend Nest)

## Architecture

```
N8N (1er message) → Wati API
Wati webhooks     → POST /whatsapp/webhooks/wati (public, 200 rapide)
Nest              → Supabase (whatsapp_conversations, whatsapp_messages)
Front (JWT)       → GET/POST /whatsapp/...
Front envoi       → Nest → Wati sendSessionMessage (pas d’appel Wati depuis le navigateur)
```

## Setup

1. Exécuter `sql/014-whatsapp-tables.sql` dans Supabase.
2. `.env` :
   - `WATI_API_URL` — endpoint depuis **Wati → Settings → API Docs**
   - `WATI_API_TOKEN` — token Bearer (secret)
   - `WATI_CHANNEL_NUMBER` — optionnel
3. Wati dashboard → Webhooks :
   - URL : `https://<ton-api>/whatsapp/webhooks/wati`
   - Events : messages received, sent, status updates
4. Redémarrer Nest.

## Webhook (public)

`POST /whatsapp/webhooks/wati` — **sans JWT**, répond `{ "ok": true }` immédiatement.

Gère :

- Message entrant (`owner: false` / `eventType: message`) → conversation + message `inbound`, `unread_count++`
- Message envoyé N8N/Wati (`sessionMessageSent`, `owner: true`) → conversation si absente + message `outbound`
- Statut (`eventType` contient `status`) → maj `whatsapp_messages.status` par `whatsappMessageId`

## API front (JWT)

| Méthode | Route | Description |
|---------|--------|-------------|
| GET | `/whatsapp/conversations` | Liste `last_message_at` DESC |
| GET | `/whatsapp/conversations/:id` | Détail |
| GET | `/whatsapp/conversations/:id/messages?limit=200&cursor=` | Messages chronologiques |
| POST | `/whatsapp/conversations/:id/messages` | Body `{ "text": "..." }` → Wati + save outbound |
| PATCH | `/whatsapp/conversations/:id/read` | `unread_count = 0` |

### Exemple conversation

```json
{
  "id": "uuid",
  "phoneNumber": "212612345678",
  "contactName": "Younes",
  "lastMessageText": "Bonjour",
  "lastMessageAt": "2026-05-18T10:00:00.000Z",
  "unreadCount": 2,
  "status": "open",
  "source": "wati"
}
```

### Exemple message

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "direction": "inbound",
  "body": "Bonjour",
  "type": "text",
  "status": "delivered",
  "watiMessageId": "wamid...",
  "createdAt": "2026-05-18T10:00:00.000Z"
}
```

Liste messages : `{ "items": [...], "nextCursor": null }`.

## Envoi Wati

`POST {WATI_API_URL}/api/v1/sendSessionMessage/{whatsappNumber}?messageText=...`  
Header : `Authorization: Bearer {WATI_API_TOKEN}`

## Polling front

Polling ~3 s sur `GET /whatsapp/conversations` et messages. SSE/WebSocket possible plus tard.

## Fichiers

- `src/whatsapp/whatsapp.service.ts`
- `src/whatsapp/wati.service.ts`
- `src/whatsapp/whatsapp.controller.ts`
- `src/whatsapp/whatsapp-webhook.controller.ts`
- `sql/014-whatsapp-tables.sql`
