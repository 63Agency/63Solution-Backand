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
import {
  isFullAdmin,
  isWhatsappAdmin,
  normalizeApiRole,
  recommendedRoute,
} from '../common/utils/roles';
import { getRolePermissions } from '../common/utils/permissions';
import {
  mapUserToMe,
  mapUserToTeamItem,
  USER_PUBLIC_COLUMNS,
  type TeamUserItem,
  type UserDbRow,
} from '../common/utils/user-response';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeService,
  ) {}

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

  private toTeamItem(row: UserDbRow): TeamUserItem {
    return mapUserToTeamItem(row, {
      online: this.presence.isOnline(row.id),
    });
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
    const teamItem = this.toTeamItem(data as UserDbRow);
    this.realtime.emitEmployeeUpdated(teamItem);

    return {
      user: mapped,
      route: recommendedRoute(mapped.role),
      permissions: getRolePermissions(mapped.role),
    };
  }

  /**
   * Liste équipe (lecture).
   * admin + admin_whatsapp (picker assignees RDV + page Employees).
   * fixed_meeting → 403 (utiliser GET /meetings/assignable-users si besoin).
   * `online` = présence socket en mémoire ; `lastSeen` = colonne DB.
   */
  async list(user: AppUser): Promise<TeamUserItem[]> {
    if (!isFullAdmin(user.role) && !isWhatsappAdmin(user.role)) {
      throw new ForbiddenException({
        message: 'Accès à la liste des utilisateurs non autorisé.',
      });
    }

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

    return (data ?? []).map((row) => this.toTeamItem(row as UserDbRow));
  }

  async create(actor: AppUser, dto: CreateUserDto): Promise<TeamUserItem> {
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
    const role = normalizeApiRole(dto.role);
    const { data, error } = await sb
      .from('users')
      .insert({
        email,
        password_hash,
        role,
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

    const item = this.toTeamItem(data as UserDbRow);
    this.realtime.emitEmployeeCreated(item);
    return item;
  }

  async update(
    actor: AppUser,
    targetId: string,
    dto: UpdateUserDto,
  ): Promise<TeamUserItem> {
    this.assertAdmin(actor);

    const sb = this.supabase.getClient();
    const { data: target, error: findError } = await sb
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .eq('id', targetId)
      .maybeSingle();

    if (findError || !target) {
      throw new NotFoundException({ message: 'Utilisateur introuvable.' });
    }

    const patch: Record<string, unknown> = {};

    if (dto.prenom !== undefined) patch.prenom = dto.prenom.trim();
    if (dto.nom !== undefined) patch.nom = dto.nom.trim();
    if (dto.telephone !== undefined) {
      patch.telephone =
        dto.telephone === null ? null : String(dto.telephone).trim();
    }
    if (dto.ville !== undefined) {
      patch.ville = dto.ville === null ? null : String(dto.ville).trim();
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== String(target.email).toLowerCase()) {
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
      }
      patch.email = email;
    }

    if (dto.role !== undefined) {
      const nextRole = normalizeApiRole(dto.role);
      const currentRole = normalizeApiRole(target.role as string);
      if (currentRole === 'admin' && nextRole !== 'admin') {
        await this.assertNotLastAdmin(targetId);
      }
      patch.role = nextRole;
    }

    if (dto.password !== undefined) {
      patch.password_hash = await bcrypt.hash(dto.password, 10);
    }

    const avatarUrl = this.resolveAvatarUrl(dto.avatarUrl);
    if (avatarUrl !== undefined) {
      patch.avatar_url = avatarUrl;
    }

    if (Object.keys(patch).length === 0) {
      return this.toTeamItem(target as UserDbRow);
    }

    const { data, error } = await sb
      .from('users')
      .update(patch)
      .eq('id', targetId)
      .select(USER_PUBLIC_COLUMNS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Mise à jour impossible.',
      });
    }

    const item = this.toTeamItem(data as UserDbRow);
    this.realtime.emitEmployeeUpdated(item);
    return item;
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
      await this.assertNotLastAdmin(targetId);
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

    this.realtime.emitEmployeeDeleted({ id: targetId });
  }

  private async assertNotLastAdmin(excludeUserId: string): Promise<void> {
    const { data: allUsers, error: listError } = await this.supabase
      .getClient()
      .from('users')
      .select('id, role');

    if (listError) {
      throw new NotFoundException({
        message: listError.message ?? 'Impossible de vérifier les admins.',
      });
    }

    const adminCount = (allUsers ?? []).filter(
      (u) =>
        u.id !== excludeUserId && isFullAdmin(u.role as string),
    ).length;

    // Count remaining admins AFTER removing/demoting excludeUserId
    if (adminCount < 1) {
      throw new ForbiddenException({
        message: 'Impossible de supprimer ou rétrograder le dernier administrateur.',
      });
    }
  }
}
