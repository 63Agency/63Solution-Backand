import { normalizeApiRole } from './roles';

/** Colonnes publiques (sans password_hash). */
export const USER_PUBLIC_COLUMNS =
  'id, email, role, prenom, nom, telephone, ville, avatar_url, created_at, last_seen';

export type UserDbRow = {
  id: string;
  email: string;
  role: string;
  prenom?: string | null;
  nom?: string | null;
  telephone?: string | null;
  ville?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  last_seen?: string | null;
};

export type TeamUserItem = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  ville: string;
  role: ReturnType<typeof normalizeApiRole>;
  avatarUrl: string | null;
  createdAt?: string;
  lastSeen: string | null;
  online: boolean;
};

export function mapUserToMe(row: UserDbRow) {
  const avatarRaw = row.avatar_url?.trim() ?? '';
  return {
    id: row.id,
    email: row.email,
    role: normalizeApiRole(row.role),
    prenom: row.prenom?.trim() ?? '',
    nom: row.nom?.trim() ?? '',
    telephone: row.telephone?.trim() ?? '',
    ville: row.ville?.trim() ?? '',
    avatarUrl: avatarRaw || null,
  };
}

export function mapUserToTeamItem(
  row: UserDbRow,
  opts?: { online?: boolean },
): TeamUserItem {
  const avatarRaw = row.avatar_url?.trim() ?? '';
  return {
    id: row.id,
    prenom: row.prenom?.trim() ?? '',
    nom: row.nom?.trim() ?? '',
    email: row.email,
    telephone: row.telephone?.trim() ?? '',
    ville: row.ville?.trim() ?? '',
    role: normalizeApiRole(row.role),
    avatarUrl: avatarRaw || null,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
    lastSeen: row.last_seen
      ? new Date(row.last_seen).toISOString()
      : null,
    online: opts?.online === true,
  };
}
