import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { recommendedRoute } from '../common/utils/roles';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AppUser } from './types/app-user';

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const sb = this.supabase.getClient();
    const email = dto.email.trim().toLowerCase();

    const { data: existing } = await sb
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      throw new ConflictException({ message: 'Cet email est déjà utilisé.' });
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const { data, error } = await sb
      .from('users')
      .insert({ email, password_hash, role: 'user' })
      .select('id')
      .single();

    if (error) {
      throw new BadRequestException({
        message:
          error.message ||
          'Impossible de créer le compte (vérifie que la table public.users existe — sql/001-users-for-nest-auth.sql).',
      });
    }

    return {
      message: 'Compte créé. Tu peux te connecter.',
      userId: data?.id,
    };
  }

  async login(dto: LoginDto) {
    const sb = this.supabase.getClient();
    const email = dto.email.trim().toLowerCase();

    const { data: row, error } = await sb
      .from('users')
      .select('id, email, password_hash, role')
      .eq('email', email)
      .maybeSingle();

    if (error || !row) {
      throw new UnauthorizedException({
        message: 'Email ou mot de passe incorrect.',
      });
    }

    const user = row as UserRow;
    const ok = await bcrypt.compare(dto.password, user.password_hash);
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Email ou mot de passe incorrect.',
      });
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });

    const role = user.role?.trim() || null;

    return {
      accessToken,
      refreshToken: null as string | null,
      expiresIn: null as number | null,
      tokenType: 'Bearer' as const,
      user: {
        id: user.id,
        email: user.email,
        role,
      },
      route: recommendedRoute(role),
    };
  }

  me(user: AppUser) {
    const role = user.role?.trim() || null;
    return {
      user: {
        id: user.id,
        email: user.email,
        role,
      },
      route: recommendedRoute(role),
    };
  }
}
