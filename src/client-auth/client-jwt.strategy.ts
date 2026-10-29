import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PORTAL_CLIENTS_TABLE } from '../portal-clients/portal-clients.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { PortalClientUser } from './types/portal-client-user';

export type ClientJwtPayload = {
  sub: string;
  role: string;
  client_id: string;
};

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(
  Strategy,
  'client-jwt',
) {
  constructor(
    private readonly supabase: SupabaseService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET manquant dans .env');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: ClientJwtPayload): Promise<PortalClientUser> {
    const role = String(payload.role ?? '').trim().toLowerCase();
    const clientId = String(payload.client_id ?? '').trim();
    const sub = String(payload.sub ?? '').trim();

    if (role !== 'client' || !clientId || !sub || clientId !== sub) {
      throw new UnauthorizedException({
        message: 'Token client invalide.',
      });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_CLIENTS_TABLE)
      .select('id, company_name, email, is_active')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !data) {
      throw new UnauthorizedException({
        message: 'Session client invalide.',
      });
    }

    if (!data.is_active) {
      throw new UnauthorizedException({
        message: 'Compte client désactivé.',
      });
    }

    return {
      id: String(data.id),
      clientId: String(data.id),
      companyName: String(data.company_name ?? ''),
      email: String(data.email ?? ''),
      role: 'client',
      isActive: true,
    };
  }
}
