import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { AppUser } from '../auth/types/app-user';
import { assertFullAdmin } from '../common/utils/access';
import { isFullAdmin, normalizeApiRole, recommendedRoute } from '../common/utils/roles';
import { getRolePermissions } from '../common/utils/permissions';
import {
  mapUserToMe,
  mapUserToTeamItem,
  USER_PUBLIC_COLUMNS,
  type UserDbRow,
} from '../common/utils/user-response';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly supabase: SupabaseService) {}

  private assertAdmin(user: AppUser): void {
    assertFullAdmin(user);
  }

  private resolveAvatarUrl(
    raw: string | null | undefined,
  ): string | null | undefined {
    if (raw === undefined) return undefined;
    const trimmed = raw === null ? '' : String(raw).trim();
    if (!trimmed) return null;
    if (!/^https?:\/\//i.test(trimmed)) {
      throw new BadRequestException({
        message: 'avatarUrl doit être une URL http(s) valide.',
      });
    }
    return trimmed;
  }

  async updateMe(user: AppUser, dto: UpdateProfileDto) {
    const prenom = dto.prenom.trim();
    const nom = dto.nom.trim();
    const telephone =
      dto.telephone === undefined ? null : String(dto.telephone).trim();
    const ville = dto.ville === undefined ? null : String(dto.ville).trim();

    const patch: Record<string, unknown> = {
      prenom,
      nom,
      telephone,
      ville,
    };
    const avatarUrl = this.resolveAvatarUrl(dto.avatarUrl);
    if (avatarUrl !== undefined) {
      patch.avatar_url = avatarUrl;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .update(patch)
      .eq('id', user.id)
      .select(USER_PUBLIC_COLUMNS)
      .single();

    if (error || !data) {
      throw new NotFoundException({
        message: error?.message ?? 'Mise à jour du profil impossible.',
      });
    }

    const mapped = mapUserToMe(data as UserDbRow);
    return {
      user: mapped,
      route: recommendedRoute(mapped.role),
      permissions: getRolePermissions(mapped.role),
    };
  }

  async list(user: AppUser) {
    this.assertAdmin(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .order('created_at', { ascending: true });

    if (error) {
      throw new NotFoundException({
        message: error.message ?? 'Impossible de lister les utilisateurs.',
      });
    }

    const items = (data ?? []).map((row) =>
      mapUserToTeamItem(row as UserDbRow),
    );
    return items;
  }

  async create(actor: AppUser, dto: CreateUserDto) {
    this.assertAdmin(actor);

    const sb = this.supabase.getClient();
    const email = dto.email.trim().toLowerCase();
    const prenom = dto.prenom.trim();
    const nom = dto.nom.trim();
    const telephone =
      dto.telephone === undefined ? null : String(dto.telephone).trim();
    const ville = dto.ville === undefined ? null : String(dto.ville).trim();

    const { data: existing } = await sb
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing) {
      throw new ConflictException({
        message: 'Cet email est déjà utilisé.',
      });
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const { data, error } = await sb
      .from('users')
      .insert({
        email,
        password_hash,
        role: dto.role,
        prenom,
        nom,
        telephone,
        ville,
      })
      .select(USER_PUBLIC_COLUMNS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible de créer l’utilisateur.',
      });
    }

    return mapUserToTeamItem(data as UserDbRow);
  }

  async remove(actor: AppUser, targetId: string): Promise<void> {
    this.assertAdmin(actor);

    if (actor.id === targetId) {
      throw new ForbiddenException({
        message: 'Vous ne pouvez pas supprimer votre propre compte.',
      });
    }

    const sb = this.supabase.getClient();

    const { data: target, error: findError } = await sb
      .from('users')
      .select('id, role')
      .eq('id', targetId)
      .maybeSingle();

    if (findError || !target) {
      throw new NotFoundException({ message: 'Utilisateur introuvable.' });
    }

    if (normalizeApiRole(target.role as string) === 'admin') {
      const { data: allUsers, error: listError } = await sb
        .from('users')
        .select('id, role');

      if (listError) {
        throw new NotFoundException({
          message: listError.message ?? 'Impossible de vérifier les admins.',
        });
      }

      const adminCount = (allUsers ?? []).filter((u) =>
        isFullAdmin(u.role as string),
      ).length;

      if (adminCount <= 1) {
        throw new ForbiddenException({
          message: 'Impossible de supprimer le dernier administrateur.',
        });
      }
    }

    const { error: deleteError } = await sb
      .from('users')
      .delete()
      .eq('id', targetId);

    if (deleteError) {
      throw new NotFoundException({
        message: deleteError.message ?? 'Suppression impossible.',
      });
    }
  }
}
