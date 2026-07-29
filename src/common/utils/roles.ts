export type ApiRole = 'admin' | 'admin_whatsapp';
export type AppRoute =
  | '/dashboard'
  | '/dashboard/conversations'
  | '/dashboard/leads'
  | '/dashboard/calendrier';

const FULL_ADMIN_ALIASES = new Set(['admin', 'superadmin', 'super_admin']);
const WHATSAPP_ADMIN_ALIASES = new Set([
  'admin_whatsapp',
  'adminwhatsapp',
  'user',
]);

/** Rôle API normalisé (2 valeurs). Legacy `user` → admin_whatsapp. */
export function normalizeApiRole(
  role: string | null | undefined,
): ApiRole {
  const r = String(role ?? '')
    .trim()
    .toLowerCase();
  if (FULL_ADMIN_ALIASES.has(r)) return 'admin';
  if (WHATSAPP_ADMIN_ALIASES.has(r)) return 'admin_whatsapp';
  return 'admin_whatsapp';
}

/** Administrateur complet (dashboard, clients, factures, gestion users). */
export function isFullAdmin(role: string | null | undefined): boolean {
  return normalizeApiRole(role) === 'admin';
}

/** @deprecated Utiliser isFullAdmin — conservé pour compat interne. */
export function isAdminRole(role: string | null | undefined): boolean {
  return isFullAdmin(role);
}

export function isWhatsappAdmin(role: string | null | undefined): boolean {
  return normalizeApiRole(role) === 'admin_whatsapp';
}

export function canAccessWhatsapp(role: string | null | undefined): boolean {
  const r = normalizeApiRole(role);
  return r === 'admin' || r === 'admin_whatsapp';
}

export function canAccessLeads(role: string | null | undefined): boolean {
  return canAccessWhatsapp(role);
}

/** Calendrier / meetings : admin + admin_whatsapp. */
export function canAccessMeetings(role: string | null | undefined): boolean {
  return canAccessWhatsapp(role);
}

export function recommendedRoute(
  role: string | null | undefined,
): AppRoute {
  return normalizeApiRole(role) === 'admin_whatsapp'
    ? '/dashboard/conversations'
    : '/dashboard';
}
