import { ForbiddenException } from '@nestjs/common';
import type { AppUser } from '../../auth/types/app-user';
import {
  canAccessLeads,
  canAccessMeetings,
  isFullAdmin,
  isWhatsappAdmin,
} from './roles';

export function assertFullAdmin(user: AppUser): void {
  if (!isFullAdmin(user.role)) {
    throw new ForbiddenException({
      message: 'Accès réservé aux administrateurs.',
    });
  }
}

export function assertCanAccessLeads(user: AppUser): void {
  if (!canAccessLeads(user.role)) {
    throw new ForbiddenException({
      message: 'Accès aux leads non autorisé.',
    });
  }
}

export function assertCanAccessMeetings(user: AppUser): void {
  if (!canAccessMeetings(user.role)) {
    throw new ForbiddenException({
      message: 'Accès au calendrier non autorisé.',
    });
  }
}

/** Préfixes API autorisés pour le rôle admin_whatsapp (hors routes publiques). */
const WHATSAPP_ADMIN_API_PREFIXES = [
  '/whatsapp',
  '/notifications',
  '/leads',
  '/meetings',
  '/clickup/sync',
  '/auth/me',
  '/auth/change-password',
] as const;

function normalizeApiPath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path;
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed || '/';
}

export function isWhatsappAdminApiAllowed(
  method: string,
  path: string,
): boolean {
  const normalized = normalizeApiPath(path);
  const verb = method.toUpperCase();

  if (normalized === '/users/me' && (verb === 'GET' || verb === 'PATCH')) {
    return true;
  }

  // Liste équipe (picker membres RDV) — lecture seule.
  if (normalized === '/users' && verb === 'GET') {
    return true;
  }

  for (const prefix of WHATSAPP_ADMIN_API_PREFIXES) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}

export function assertWhatsappAdminApiAccess(
  user: AppUser,
  method: string,
  path: string,
): void {
  if (!isWhatsappAdmin(user.role)) return;

  if (!isWhatsappAdminApiAllowed(method, path)) {
    throw new ForbiddenException({
      message: 'Accès réservé aux pages WhatsApp, Leads et Calendrier.',
    });
  }
}
