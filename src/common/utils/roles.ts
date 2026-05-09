const ADMIN_ROLES = new Set(['admin', 'superadmin', 'super_admin']);

export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ADMIN_ROLES.has(role.trim().toLowerCase());
}

export function recommendedRoute(
  role: string | null | undefined,
): '/dashboard' | '/home' {
  return isAdminRole(role) ? '/dashboard' : '/home';
}
