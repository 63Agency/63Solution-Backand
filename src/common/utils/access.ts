import { ForbiddenException } from '@nestjs/common';
import type { AppUser } from '../../auth/types/app-user';
import { isFullAdmin } from './roles';

export function assertFullAdmin(user: AppUser): void {
  if (!isFullAdmin(user.role)) {
    throw new ForbiddenException({
      message: 'Accès réservé aux administrateurs.',
    });
  }
}
