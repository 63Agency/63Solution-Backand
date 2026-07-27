import { isFullAdmin, type AppRoute } from './roles';

export type LeadsPermissions = {
  list: boolean;
  detail: boolean;
  sync: boolean;
  meta: boolean;
  stats: boolean;
};

export type RolePermissions = {
  /** Routes frontend autorisées dans la sidebar / router. */
  pages: AppRoute[];
  whatsapp: boolean;
  leads: boolean;
  /** Droits détaillés sur la page Leads (identiques admin / admin_whatsapp). */
  leadsPermissions: LeadsPermissions;
  dashboard: boolean;
  clients: boolean;
  devis: boolean;
  factures: boolean;
  propositions: boolean;
  meetings: boolean;
  users: boolean;
  upload: boolean;
};

const FULL_LEADS_PERMISSIONS: LeadsPermissions = {
  list: true,
  detail: true,
  sync: true,
  meta: true,
  stats: true,
};

const FULL_ADMIN_PERMISSIONS: RolePermissions = {
  pages: ['/dashboard', '/dashboard/conversations', '/dashboard/leads'],
  whatsapp: true,
  leads: true,
  leadsPermissions: FULL_LEADS_PERMISSIONS,
  dashboard: true,
  clients: true,
  devis: true,
  factures: true,
  propositions: true,
  meetings: true,
  users: true,
  upload: true,
};

const WHATSAPP_ADMIN_PERMISSIONS: RolePermissions = {
  pages: ['/dashboard/conversations', '/dashboard/leads'],
  whatsapp: true,
  leads: true,
  leadsPermissions: FULL_LEADS_PERMISSIONS,
  dashboard: false,
  clients: false,
  devis: false,
  factures: false,
  propositions: false,
  meetings: false,
  users: false,
  upload: false,
};

export function getRolePermissions(
  role: string | null | undefined,
): RolePermissions {
  return isFullAdmin(role)
    ? FULL_ADMIN_PERMISSIONS
    : WHATSAPP_ADMIN_PERMISSIONS;
}
