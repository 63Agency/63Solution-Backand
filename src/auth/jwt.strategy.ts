import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SupabaseService } from '../supabase/supabase.service';
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
      .select('id, email, role')
      .eq('id', payload.sub)
      .maybeSingle();

    if (error || !data) {
      throw new UnauthorizedException();
    }

    return {
      id: data.id as string,
      email: data.email as string,
      role: (data.role as string) ?? 'user',
    };
  }
}
