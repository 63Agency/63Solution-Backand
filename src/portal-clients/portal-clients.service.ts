import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { AppUser } from '../auth/types/app-user';
import { assertFullAdmin } from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreatePortalClientDto } from './dto/create-portal-client.dto';

/** Table qualifiée — schéma portal uniquement (jamais public.clients). */
export const PORTAL_CLIENTS_TABLE = 'portal.clients';

type PortalClientRow = {
  id: string;
  company_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const PORTAL_CLIENT_PUBLIC_COLUMNS =
  'id, company_name, email, is_active, created_at, updated_at';

function mapPortalClient(r: PortalClientRow) {
  return {
    id: String(r.id),
    companyName: String(r.company_name ?? ''),
    email: String(r.email ?? ''),
    isActive: Boolean(r.is_active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

@Injectable()
export class PortalClientsService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(dto: CreatePortalClientDto, user: AppUser) {
    assertFullAdmin(user);

    const companyName = dto.companyName.trim();
    const email = dto.email.trim().toLowerCase();
    const sb = this.supabase.getClient();

    const { data: existing } = await sb
      .from(PORTAL_CLIENTS_TABLE)
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (existing?.id) {
      throw new ConflictException({
        message: 'Un compte portail avec cet email existe déjà.',
      });
    }

    const password_hash = await bcrypt.hash(dto.password, 10);
    const { data, error } = await sb
      .from(PORTAL_CLIENTS_TABLE)
      .insert({
        company_name: companyName,
        email,
        password_hash,
        is_active: true,
      })
      .select(PORTAL_CLIENT_PUBLIC_COLUMNS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message:
          error?.message ?? 'Impossible de créer le compte portail client.',
      });
    }

    return mapPortalClient(data as PortalClientRow);
  }

  async list(user: AppUser) {
    assertFullAdmin(user);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_CLIENTS_TABLE)
      .select(PORTAL_CLIENT_PUBLIC_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as PortalClientRow[]).map(mapPortalClient),
    };
  }

  async setActive(id: string, isActive: boolean, user: AppUser) {
    assertFullAdmin(user);

    const { data: existing, error: findError } = await this.supabase
      .getClient()
      .from(PORTAL_CLIENTS_TABLE)
      .select(PORTAL_CLIENT_PUBLIC_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (findError || !existing) {
      throw new NotFoundException({ message: 'Client portail introuvable.' });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_CLIENTS_TABLE)
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(PORTAL_CLIENT_PUBLIC_COLUMNS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Mise à jour impossible.',
      });
    }

    return mapPortalClient(data as PortalClientRow);
  }
}
