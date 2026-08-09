import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseService } from '../supabase/supabase.service';
import { normalizeApiRole } from '../common/utils/roles';
import { USER_PUBLIC_COLUMNS } from '../common/utils/user-response';
import type { AppUser } from './types/app-user';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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

  async validate(payload: { sub: string }): Promise<AppUser> {
    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .eq('id', payload.sub)
      .maybeSingle();

    if (error || !data) {
      throw new UnauthorizedException();
    }

    return {
      id: data.id as string,
      email: data.email as string,
      // Toujours le slug API (admin | admin_whatsapp | fixed_meeting), jamais un label UI.
      role: normalizeApiRole(data.role as string),
      prenom: (data.prenom as string | null) ?? null,
      nom: (data.nom as string | null) ?? null,
      telephone: (data.telephone as string | null) ?? null,
      ville: (data.ville as string | null) ?? null,
      avatarUrl: (data.avatar_url as string | null)?.trim() || null,
    };
  }
}
