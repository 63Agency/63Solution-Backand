# Front — supprimer une proposition en base (obligatoire)

Si la ligne disparaît dans l’UI mais **reste dans Supabase**, le front ne appelle **pas** l’API Nest (suppression localStorage seulement).

## Fonction à brancher sur le bouton 🗑️

```ts
const API = process.env.NEXT_PUBLIC_API_URL; // ex. http://localhost:3002

export async function deleteProposition(
  ref: string,
  headers: HeadersInit,
): Promise<void> {
  // ref = id uuid renvoyé par POST /propositions, OU numero PROP-2026-012
  const res = await fetch(`${API}/propositions/${encodeURIComponent(ref)}`, {
    method: 'DELETE',
    headers,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof body.message === 'string'
        ? body.message
        : `Suppression impossible (${res.status})`,
    );
  }
}
```

Alternative si `DELETE` est bloqué :

```ts
await fetch(`${API}/propositions/${encodeURIComponent(ref)}/delete`, {
  method: 'POST',
  headers,
});
```

Par numéro uniquement :

```ts
await fetch(
  `${API}/propositions/by-numero/${encodeURIComponent(numero)}/delete`,
  { method: 'POST', headers },
);
```

## Règles

1. Après `POST /propositions`, garder `response.id` (uuid) dans le state / localStorage.
2. Au clic supprimer → appeler `deleteProposition(row.id, buildAuthHeaders())`.
3. Retirer la ligne du tableau **seulement** si la réponse est 200.
4. Ne pas supprimer seulement `localStorage` sans l’appel API.

## Vérification

- Network : `DELETE …/propositions/<uuid>` → **200**
- Terminal Nest : `proposition supprimée id=… numero=PROP-…`
- Supabase Table Editor : la ligne a disparu

## Symptôme : le bouton supprimer ne fait rien / la ligne revient au refresh

1. **Onglet Network** : si la réponse est **404**, l’`id` envoyé n’existe **pas** dans Supabase (souvent une entrée **localStorage** créée hors ligne ou un ancien uuid).
2. **Terminal Nest** : vous voyez `DELETE /propositions/…` mais **pas** `proposition supprimée` → la ligne n’était pas en base.
3. **Test** : `GET http://localhost:3002/propositions` (avec JWT) — si la proposition n’y est pas, elle n’est pas en base.

**Correctif front** : après `POST /propositions`, enregistrer `response.id` (uuid serveur). Au delete, un **seul** appel (`DELETE` ou `POST …/delete`), pas trois en parallèle. Si **200** avec message « déjà supprimée / introuvable », retirer quand même la ligne du state **et** du localStorage.
