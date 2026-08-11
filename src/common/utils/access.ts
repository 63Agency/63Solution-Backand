import { ForbiddenException } from '@nestjs/common';
import type { AppUser } from '../../auth/types/app-user';
import {
  canAccessLeads,
  canAccessMeetings,
  isFixedMeeting,
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

/** Préfixes API autorisés pour le rôle fixed_meeting (calendrier uniquement). */
const FIXED_MEETING_API_PREFIXES = [
  '/meetings',
  '/auth/me',
  '/auth/change-password',
] as const;

function normalizeApiPath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? path;
  const trimmed = withoutQuery.replace(/\/+$/, '');
  return trimmed || '/';
}

function isPathAllowed(
  method: string,
  path: string,
  prefixes: readonly string[],
): boolean {
  const normalized = normalizeApiPath(path);
  const verb = method.toUpperCase();

  if (normalized === '/users/me' && (verb === 'GET' || verb === 'PATCH')) {
    return true;
  }

  for (const prefix of prefixes) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}

export function isWhatsappAdminApiAllowed(
  method: string,
  path: string,
): boolean {
  const normalized = normalizeApiPath(path);
  // Lecture seule pour le picker assignees (création / édition RDV).
  if (normalized === '/users' && method.toUpperCase() === 'GET') {
    return true;
  }
  return isPathAllowed(method, path, WHATSAPP_ADMIN_API_PREFIXES);
}

export function isFixedMeetingApiAllowed(
  method: string,
  path: string,
): boolean {
  return isPathAllowed(method, path, FIXED_MEETING_API_PREFIXES);
}

export function assertWhatsappAdminApiAccess(
  user: AppUser,
  method: string,
  path: string,
): void {
  // admin : aucun filtre d’API (GET/POST/DELETE /users, etc.).
  if (isFullAdmin(user.role) || !isWhatsappAdmin(user.role)) return;

  if (!isWhatsappAdminApiAllowed(method, path)) {
    throw new ForbiddenException({
      message: 'Accès réservé aux pages WhatsApp, Leads et Calendrier.',
    });
  }
}

export function assertFixedMeetingApiAccess(
  user: AppUser,
  method: string,
  path: string,
): void {
  // admin : non restreint. fixed_meeting : calendrier uniquement (pas Users / WhatsApp / Leads).
  if (isFullAdmin(user.role) || !isFixedMeeting(user.role)) return;

  if (!isFixedMeetingApiAllowed(method, path)) {
    throw new ForbiddenException({
      message: 'Accès réservé à la page Calendrier.',
    });
  }
}
