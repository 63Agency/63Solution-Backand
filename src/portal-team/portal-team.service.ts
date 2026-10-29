import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateTeamMemberDto } from './dto/create-team-member.dto';
import type { UpdateTeamMemberDto } from './dto/update-team-member.dto';

const PORTAL_CLIENTS_TABLE = 'portal.clients';
const PORTAL_TEAM_MEMBERS_TABLE = 'portal.team_members';

type TeamMemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function mapMember(r: TeamMemberRow, isYou = false) {
  const mapped: {
    id: string;
    name: string;
    email: string;
    role: 'owner' | 'member';
    is_you?: boolean;
  } = {
    id: String(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    role: r.role === 'owner' ? 'owner' : 'member',
  };
  if (isYou) {
    mapped.is_you = true;
  }
  return mapped;
}

@Injectable()
export class PortalTeamService {
  constructor(private readonly supabase: SupabaseService) {}

  private clientId(user: PortalClientUser): string {
    return user.clientId;
  }

  async list(user: PortalClientUser) {
    const clientId = this.clientId(user);

    const { data: client, error: clientError } = await this.supabase
      .getClient()
      .from(PORTAL_CLIENTS_TABLE)
      .select('id, company_name, email')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError) {
      throw new ConflictException({ message: clientError.message });
    }
    if (!client) {
      throw new NotFoundException({ message: 'Client introuvable.' });
    }

    const owner = mapMember(
      {
        id: String(client.id),
        name: String(client.company_name ?? ''),
        email: String(client.email ?? ''),
        role: 'owner',
      },
      true,
    );

    const { data: members, error } = await this.supabase
      .getClient()
      .from(PORTAL_TEAM_MEMBERS_TABLE)
      .select('id, name, email, role')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const collaborators = ((members ?? []) as TeamMemberRow[]).map((r) =>
      mapMember({ ...r, role: 'member' }),
    );

    return [owner, ...collaborators];
  }

  async create(dto: CreateTeamMemberDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();

    if (email === user.email.trim().toLowerCase()) {
      throw new ConflictException({
        message: 'Cet email est déjà celui du propriétaire du compte.',
      });
    }

    const { data: existing } = await this.supabase
      .getClient()
      .from(PORTAL_TEAM_MEMBERS_TABLE)
      .select('id')
      .eq('client_id', clientId)
      .eq('email', email)
      .maybeSingle();

    if (existing?.id) {
      throw new ConflictException({
        message: 'Un collaborateur avec cet email existe déjà.',
      });
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_TEAM_MEMBERS_TABLE)
      .insert({
        client_id: clientId,
        name,
        email,
        password_hash,
        role: 'member',
      })
      .select('id, name, email, role')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw new ConflictException({
          message: 'Un collaborateur avec cet email existe déjà.',
        });
      }
      throw new ConflictException({
        message: error?.message ?? 'Impossible d’ajouter le collaborateur.',
      });
    }

    return mapMember(data as TeamMemberRow);
  }

  async update(
    id: string,
    dto: UpdateTeamMemberDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);

    const { data: existing, error: findError } = await this.supabase
      .getClient()
      .from(PORTAL_TEAM_MEMBERS_TABLE)
      .select('id, name, email, role')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle();

    if (findError) {
      throw new ConflictException({ message: findError.message });
    }
    if (!existing) {
      throw new NotFoundException({
        message: 'Collaborateur introuvable.',
      });
    }

    const patch: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      patch.name = dto.name.trim();
    }

    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email === user.email.trim().toLowerCase()) {
        throw new ConflictException({
          message: 'Cet email est déjà celui du propriétaire du compte.',
        });
      }
      if (email !== String(existing.email).toLowerCase()) {
        const { data: dup } = await this.supabase
          .getClient()
          .from(PORTAL_TEAM_MEMBERS_TABLE)
          .select('id')
          .eq('client_id', clientId)
          .eq('email', email)
          .maybeSingle();
        if (dup?.id && String(dup.id) !== id) {
          throw new ConflictException({
            message: 'Un collaborateur avec cet email existe déjà.',
          });
        }
        patch.email = email;
      }
    }

    if (dto.password !== undefined && dto.password.trim().length > 0) {
      patch.password_hash = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException({
        message: 'Aucun champ à mettre à jour.',
      });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_TEAM_MEMBERS_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('client_id', clientId)
      .select('id, name, email, role')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException({
          message: 'Un collaborateur avec cet email existe déjà.',
        });
      }
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({
        message: 'Collaborateur introuvable.',
      });
    }

    return mapMember({ ...(data as TeamMemberRow), role: 'member' });
  }

  async remove(id: string, user: PortalClientUser): Promise<void> {
    const clientId = this.clientId(user);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_TEAM_MEMBERS_TABLE)
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({
        message: 'Collaborateur introuvable.',
      });
    }
  }
}
