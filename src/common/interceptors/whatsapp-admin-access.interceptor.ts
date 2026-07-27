import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import type { AppUser } from '../../auth/types/app-user';
import { assertWhatsappAdminApiAccess } from '../utils/access';

type AuthedRequest = Request & { user?: AppUser };

@Injectable()
export class WhatsappAdminAccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (req.user) {
      assertWhatsappAdminApiAccess(req.user, req.method, req.path);
    }
    return next.handle();
  }
}
