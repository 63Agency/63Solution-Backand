import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { assertFullAdmin } from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

type ClientRow = {
  id: string;
  client_nom: string;
  client_email: string | null;
  client_telephone: string | null;
  client_ice: string | null;
  created_by: string;
};

function mapClientRow(r: ClientRow) {
  return {
    id: String(r.id),
    clientNom: String(r.client_nom ?? ''),
    clientEmail: String(r.client_email ?? ''),
    clientTelephone: String(r.client_telephone ?? ''),
    clientIce: String(r.client_ice ?? ''),
  };
}

@Injectable()
export class ClientsService {
  private readonly logger = new Logger(ClientsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async list(user: AppUser) {
    assertFullAdmin(user);
    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('clients')
      .select('id, client_nom, client_email, client_telephone, client_ice, created_by')
      .order('updated_at', { ascending: false });
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const items = (data ?? []).map((r) => ({
      id: String(r.id),
      clientNom: String(r.client_nom ?? ''),
      clientEmail: String(r.client_email ?? ''),
      clientTelephone: String(r.client_telephone ?? ''),
      clientIce: String(r.client_ice ?? ''),
    }));

    return { items };
  }

  async create(dto: CreateClientDto, user: AppUser) {
    assertFullAdmin(user);
    const nom = clean(dto.clientNom);
    if (!nom) {
      throw new ConflictException({ message: 'clientNom requis' });
    }

    const emailRaw = clean(dto.clientEmail);
    const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
    const ice = clean(dto.clientIce) || null;
    const phone = clean(dto.clientTelephone) || null;
    const sb = this.supabase.getClient();
    const ownerId = user.id;

    if (emailNorm) {
      const { data: dup } = await sb
        .from('clients')
        .select('id')
        .eq('created_by', ownerId)
        .eq('client_email', emailNorm)
        .maybeSingle();
      if (dup?.id) {
        throw new ConflictException({
          message: 'Un client avec cet email existe déjà.',
        });
      }
    }

    if (ice) {
      const { data: dupIce } = await sb
        .from('clients')
        .select('id')
        .eq('created_by', ownerId)
        .eq('client_ice', ice)
        .maybeSingle();
      if (dupIce?.id) {
        throw new ConflictException({
          message: 'Un client avec cet ICE existe déjà.',
        });
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from('clients')
      .insert({
        client_nom: nom,
        client_email: emailNorm,
        client_telephone: phone,
        client_ice: ice,
        created_by: ownerId,
        created_at: now,
        updated_at: now,
      })
      .select('id, client_nom, client_email, client_telephone, client_ice, created_by')
      .single();

    if (error || !data) {
      const msg = error?.message ?? 'Création impossible';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        throw new ConflictException({
          message: 'Conflit: email ou ICE déjà utilisé pour un autre client.',
        });
      }
      throw new ConflictException({ message: msg });
    }

    return mapClientRow(data as ClientRow);
  }

  private async byIdOr404(id: string): Promise<ClientRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from('clients')
      .select('id, client_nom, client_email, client_telephone, client_ice, created_by')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      throw new NotFoundException({ message: 'client introuvable' });
    }
    return data as ClientRow;
  }

  async update(id: string, dto: UpdateClientDto, user: AppUser) {
    assertFullAdmin(user);
    const row = await this.byIdOr404(id);

    const nom = clean(dto.clientNom);
    if (!nom) {
      throw new ConflictException({ message: 'clientNom requis' });
    }

    const emailRaw = clean(dto.clientEmail);
    const emailNorm = emailRaw ? emailRaw.toLowerCase() : null;
    const ice = clean(dto.clientIce) || null;
    const phone = clean(dto.clientTelephone) || null;

    const sb = this.supabase.getClient();

    if (emailNorm) {
      const { data: dup } = await sb
        .from('clients')
        .select('id')
        .eq('created_by', row.created_by)
        .eq('client_email', emailNorm)
        .neq('id', id)
        .maybeSingle();
      if (dup?.id) {
        throw new ConflictException({
          message: 'Un autre client utilise déjà cet email.',
        });
      }
    }

    if (ice) {
      const { data: dupIce } = await sb
        .from('clients')
        .select('id')
        .eq('created_by', row.created_by)
        .eq('client_ice', ice)
        .neq('id', id)
        .maybeSingle();
      if (dupIce?.id) {
        throw new ConflictException({
          message: 'Un autre client utilise déjà cet ICE.',
        });
      }
    }

    const now = new Date().toISOString();
    const { data, error } = await sb
      .from('clients')
      .update({
        client_nom: nom,
        client_email: emailNorm,
        client_telephone: phone,
        client_ice: ice,
        updated_at: now,
      })
      .eq('id', id)
      .select('id, client_nom, client_email, client_telephone, client_ice, created_by')
      .single();

    if (error || !data) {
      const msg = error?.message ?? 'Mise à jour impossible';
      if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
        throw new ConflictException({
          message: 'Conflit: email ou ICE déjà utilisé pour un autre client.',
        });
      }
      throw new ConflictException({ message: msg });
    }

    return mapClientRow(data as ClientRow);
  }

  async remove(id: string, user: AppUser) {
    assertFullAdmin(user);
    await this.byIdOr404(id);

    /** Indépendant de devis / factures / propositions : suppression du client seule. */
    const { error } = await this.supabase.getClient().from('clients').delete().eq('id', id);
    if (error) {
      throw new ConflictException({
        message: error.message ?? 'Suppression impossible',
      });
    }

    return { message: 'Client supprimé.', id };
  }
}
