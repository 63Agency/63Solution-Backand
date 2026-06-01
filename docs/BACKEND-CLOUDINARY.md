# API Upload Cloudinary (Nest) — brief frontend

## Setup backend (ops)

1. Exécuter `sql/018-media-files-table.sql` dans Supabase.
2. Ajouter dans `.env` (serveur uniquement) :
   ```env
   CLOUDINARY_CLOUD_NAME=...
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   ```
3. Redémarrer Nest.

**Important :** ne jamais mettre `CLOUDINARY_API_SECRET` dans Next.js. Tous les uploads passent par l’API Nest avec JWT.

## Auth

Toutes les routes : `Authorization: Bearer <accessToken>` (même JWT que le dashboard).

Base URL : `NEXT_PUBLIC_API_URL` (ex. `http://localhost:3002`).

## Endpoints

| Méthode | Route | Body | Query |
|---------|--------|------|--------|
| POST | `/upload/image` | `multipart/form-data` champ **`file`** | `folder` (optionnel, défaut `63agency`) |
| POST | `/upload/video` | `multipart/form-data` champ **`file`** | `folder` |
| POST | `/upload/multiple` | champs **`files`** (max 10) | `folder` |
| GET | `/upload/media` | — | `folder` (filtre optionnel) |
| GET | `/upload/transform` | — | `publicId` + options transform |
| GET | `/upload/transform/:publicId` | — | options transform (voir encodage) |
| DELETE | `/upload` | — | `publicId` |
| DELETE | `/upload/:publicId` | — | — |

### Limites & types

- Images : max **10 Mo** — `jpg`, `jpeg`, `png`, `webp`, `gif`
- Vidéos : max **100 Mo** — `mp4`, `mov`, `avi`, `mkv`

### Réponse upload (exemple)

```json
{
  "publicId": "63agency/abc123",
  "secureUrl": "https://res.cloudinary.com/...",
  "resourceType": "image",
  "format": "jpg",
  "width": 1920,
  "height": 1080,
  "duration": null,
  "folder": "63agency",
  "optimizedUrl": "https://res.cloudinary.com/.../f_auto,q_auto/...",
  "thumbnailUrl": null,
  "media": {
    "id": "uuid",
    "publicId": "63agency/abc123",
    "secureUrl": "https://...",
    "resourceType": "image",
    "format": "jpg",
    "width": 1920,
    "height": 1080,
    "duration": null,
    "folder": "63agency",
    "userId": "uuid",
    "createdAt": "2026-06-01T12:00:00.000Z"
  }
}
```

Vidéo : `thumbnailUrl` = vignette JPG (frame 0). Utiliser `optimizedUrl` ou `secureUrl` pour le lecteur.

Upload multiple : `{ "items": [ /* UploadResponseDto[] */ ] }`.

### Transformations (GET)

Query params optionnels : `width`, `height`, `crop`, `quality` (`auto` | `80` | `90` | `100`), `format`, `gravity`.

```http
GET /upload/transform?publicId=63agency%2Fabc123&width=800
```

Réponse :

```json
{
  "publicId": "63agency/abc123",
  "url": "https://res.cloudinary.com/.../f_auto,q_auto,w_800,...",
  "thumbnailUrl": null,
  "breakpoints": [
    { "width": 320, "url": "..." },
    { "width": 640, "url": "..." },
    { "width": 1024, "url": "..." },
    { "width": 1920, "url": "..." }
  ]
}
```

`breakpoints` est renseigné pour les **images** (responsive `srcset`).

**publicId avec `/`** : encoder en un seul segment de path :

```ts
const id = encodeURIComponent('63agency/abc123');
await fetch(`${API}/upload/transform/${id}`, { headers: { Authorization: `Bearer ${token}` } });
```

Ou query : `?publicId=${encodeURIComponent(publicId)}`.

### Suppression

```http
DELETE /upload?publicId=63agency%2Fabc123
```

Supprime sur Cloudinary + ligne Supabase (uniquement si `user_id` = utilisateur connecté).

## Intégration Next.js (à implémenter côté front)

### Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
```

Pas de clés Cloudinary côté client pour l’upload.

### Hook `useCloudinaryUpload` (schéma)

```ts
export function useCloudinaryUpload() {
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function uploadFile(file: File, type: 'image' | 'video', folder?: string) {
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    const form = new FormData();
    form.append(type === 'image' ? 'file' : 'file', file);
    const path = type === 'image' ? '/upload/image' : '/upload/video';
    const qs = folder ? `?folder=${encodeURIComponent(folder)}` : '';

    // XMLHttpRequest pour progress (fetch ne expose pas upload progress)
    return new Promise<UploadResponseDto>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${process.env.NEXT_PUBLIC_API_URL}${path}${qs}`);
      xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else reject(new Error(JSON.parse(xhr.responseText).message ?? 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(form);
    });
  }

  return { uploadFile, progress, error, previewUrl };
}
```

### Affichage image optimisée

Préférer `optimizedUrl` de la réponse, ou construire `srcset` depuis `breakpoints` :

```tsx
<img
  src={data.optimizedUrl}
  srcSet={data.breakpoints?.map((b) => `${b.url} ${b.width}w`).join(', ')}
  sizes="(max-width: 768px) 100vw, 50vw"
  loading="lazy"
  alt=""
/>
```

### Vidéo

- Lecture directe : balise `<video src={secureUrl} controls />`
- Vignette : `thumbnailUrl`
- Player Cloudinary (optionnel, compte Cloudinary) : URL du type  
  `https://player.cloudinary.com/embed/?cloud_name=...&public_id=...`  
  avec `publicId` et `cloud_name` renvoyés côté back (ne pas hardcoder le secret).

### Galerie

```http
GET /upload/media
```

Liste les médias de l’utilisateur connecté → alimenter `<MediaGallery />`.

### Composants suggérés

| Composant | Rôle |
|-----------|------|
| `MediaUploader` | drag & drop → `uploadFile` / `POST /upload/multiple` |
| `MediaGallery` | `GET /upload/media` + grille `optimizedUrl` / `thumbnailUrl` |
| `VideoPlayer` | `<video>` ou embed player avec `publicId` |

## Photo de profil (avatar)

Flux recommandé côté front :

1. `POST /upload/image?folder=63agency/profiles` — champ `file` (JWT)
2. Utiliser `optimizedUrl` ou `secureUrl` de la réponse
3. `PATCH /users/me` avec le reste du profil :
   ```json
   {
     "prenom": "…",
     "nom": "…",
     "telephone": "…",
     "ville": "…",
     "avatarUrl": "https://res.cloudinary.com/…"
   }
   ```
4. Supprimer la photo : `PATCH /users/me` avec `"avatarUrl": null` ou `""`
5. Lire le profil : `GET /auth/me` → `user.avatarUrl`

Migration Supabase : `sql/019-users-avatar-url.sql`.

## Erreurs courantes

| HTTP | Cause |
|------|--------|
| 400 | Fichier manquant, type/taille invalide |
| 401 | JWT absent ou expiré |
| 404 | Delete : fichier pas à vous ou inconnu |
| 503 | Cloudinary non configuré sur le serveur |

## Sécurité

- Rotation des clés Cloudinary si elles ont été partagées en clair (chat, commit).
- CORS déjà ouvert pour `localhost:3000/3001` et `app.63agency.com` sur Nest.
