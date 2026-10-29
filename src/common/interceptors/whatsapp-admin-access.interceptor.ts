import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AppUser } from '../../auth/types/app-user';
import {
  assertFixedMeetingApiAccess,
  assertWhatsappAdminApiAccess,
} from '../utils/access';
import { isPortalClientRole } from '../utils/roles';

type AuthedRequest = Request & { user?: AppUser & { role?: string } };

@Injectable()
export class WhatsappAdminAccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.user) {
      // Portail client : hors filtres CRM (isolation JWT role=client).
      if (isPortalClientRole(req.user.role)) {
        return next.handle();
      }
      const path = req.originalUrl || req.url || req.path;
      assertWhatsappAdminApiAccess(req.user, req.method, path);
      assertFixedMeetingApiAccess(req.user, req.method, path);
    }
    return next.handle();
  }
}
