import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Accepte uniquement les JWT portail (role === 'client' + is_active).
 * Un token CRM interne est rejeté — isolation tenant via client_id JWT.
 */
@Injectable()
export class ClientJwtGuard extends AuthGuard('client-jwt') {}
