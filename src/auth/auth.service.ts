import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { recommendedRoute } from '../common/utils/roles';
import { getRolePermissions } from '../common/utils/permissions';
import {
  mapUserToMe,
  USER_PUBLIC_COLUMNS,
  type UserDbRow,
} from '../common/utils/user-response';
import { SupabaseService } from '../supabase/supabase.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AppUser } from './types/app-user';

type UserRow = UserDbRow & {
  password_hash: string;
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
      .insert({ email, password_hash, role: 'admin_whatsapp' })
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
      .select(`${USER_PUBLIC_COLUMNS}, password_hash`)
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

    const mapped = mapUserToMe(user);

    return {
      accessToken,
      refreshToken: null as string | null,
      expiresIn: null as number | null,
      tokenType: 'Bearer' as const,
      user: mapped,
      route: recommendedRoute(mapped.role),
      permissions: getRolePermissions(mapped.role),
    };
  }

  async me(user: AppUser) {
    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();

    if (error || !data) {
      throw new UnauthorizedException({
        message: 'Session invalide.',
      });
    }

    const mapped = mapUserToMe(data as UserDbRow);
    return {
      user: mapped,
      route: recommendedRoute(mapped.role),
      permissions: getRolePermissions(mapped.role),
    };
  }

  async changePassword(user: AppUser, dto: ChangePasswordDto): Promise<void> {
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException({
        message:
          'Le nouveau mot de passe doit être différent de l’actuel.',
      });
    }

    const { data: row, error } = await this.supabase
      .getClient()
      .from('users')
      .select('password_hash')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !row) {
      throw new UnauthorizedException({
        message: 'Mot de passe actuel incorrect.',
      });
    }

    const ok = await bcrypt.compare(
      dto.currentPassword,
      row.password_hash as string,
    );
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Mot de passe actuel incorrect.',
      });
    }

    const password_hash = await bcrypt.hash(dto.newPassword, 10);
    const { error: updateError } = await this.supabase
      .getClient()
      .from('users')
      .update({ password_hash })
      .eq('id', user.id);

    if (updateError) {
      throw new BadRequestException({
        message: updateError.message ?? 'Changement de mot de passe impossible.',
      });
    }
  }
}
