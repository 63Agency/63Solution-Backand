export type ApiRole = 'admin' | 'admin_whatsapp' | 'fixed_meeting';
export type AppRoute =
  | '/dashboard'
  | '/dashboard/conversations'
  | '/dashboard/leads'
  | '/dashboard/calendrier';

const FULL_ADMIN_ALIASES = new Set([
  'admin',
  'superadmin',
  'super_admin',
  'administrateur',
]);
const WHATSAPP_ADMIN_ALIASES = new Set([
  'admin_whatsapp',
  'adminwhatsapp',
  'user',
]);
const FIXED_MEETING_ALIASES = new Set([
  'fixed_meeting',
  'fixedmeeting',
  'fixed_meating',
  'fixed meeting',
]);

/** Rôle API normalisé. Legacy `user` → admin_whatsapp. */
export function normalizeApiRole(
  role: string | null | undefined,
): ApiRole {
  const r = String(role ?? '')
    .trim()
    .toLowerCase();
  if (FULL_ADMIN_ALIASES.has(r)) return 'admin';
  if (FIXED_MEETING_ALIASES.has(r)) return 'fixed_meeting';
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

export function isFixedMeeting(role: string | null | undefined): boolean {
  return normalizeApiRole(role) === 'fixed_meeting';
}

export function canAccessWhatsapp(role: string | null | undefined): boolean {
  const r = normalizeApiRole(role);
  return r === 'admin' || r === 'admin_whatsapp';
}

export function canAccessLeads(role: string | null | undefined): boolean {
  return canAccessWhatsapp(role);
}

/** Calendrier / meetings : admin + admin_whatsapp + fixed_meeting. */
export function canAccessMeetings(role: string | null | undefined): boolean {
  const r = normalizeApiRole(role);
  return r === 'admin' || r === 'admin_whatsapp' || r === 'fixed_meeting';
}

/** Mentionner l’équipe (assignedUserIds) : admin + admin_whatsapp uniquement. */
export function canAssignMeetingUsers(
  role: string | null | undefined,
): boolean {
  const r = normalizeApiRole(role);
  return r === 'admin' || r === 'admin_whatsapp';
}

export function recommendedRoute(
  role: string | null | undefined,
): AppRoute {
  const r = normalizeApiRole(role);
  if (r === 'fixed_meeting') return '/dashboard/calendrier';
  if (r === 'admin_whatsapp') return '/dashboard/conversations';
  return '/dashboard';
}
