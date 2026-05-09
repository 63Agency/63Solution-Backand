import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { isAdminRole } from '../common/utils/roles';
import { SupabaseService } from '../supabase/supabase.service';
import type { UpdateClientDto } from './dto/update-client.dto';

export type ClientUpsertPayload = {
  clientNom: string;
  clientEmail?: string | null;
  clientTelephone?: string | null;
  clientIce?: string | null;
};

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
    const sb = this.supabase.getClient();
    let query = sb
      .from('clients')
      .select('id, client_nom, client_email, client_telephone, client_ice, created_by')
      .order('updated_at', { ascending: false });

    if (!isAdminRole(user.role)) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;
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

  private ensureClientAccess(row: ClientRow, user: AppUser): void {
    if (isAdminRole(user.role)) return;
    if (row.created_by !== user.id) {
      throw new ForbiddenException({ message: 'Interdit' });
    }
  }

  async update(id: string, dto: UpdateClientDto, user: AppUser) {
    const row = await this.byIdOr404(id);
    this.ensureClientAccess(row, user);

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
    const row = await this.byIdOr404(id);
    this.ensureClientAccess(row, user);

    /**
     * Les devis/factures ne portent pas de FK `client_id` : suppression autorisée.
     * Les champs client sur les documents existants ne sont pas modifiés.
     */
    const { error } = await this.supabase.getClient().from('clients').delete().eq('id', id);
    if (error) {
      const msg = error.message ?? 'Suppression impossible';
      if (
        msg.toLowerCase().includes('foreign key') ||
        msg.toLowerCase().includes('constraint')
      ) {
        throw new ConflictException({
          message:
            'Suppression impossible: ce client est encore référencé par une autre ressource.',
        });
      }
      throw new ConflictException({ message: msg });
    }

    return { message: 'Client supprimé.', id };
  }

  /**
   * Met à jour ou crée un client pour le propriétaire du document (devis/facture).
   * Ne propage pas d'erreur HTTP si la table est absente ou autre souci DB.
   */
  async upsertFromDocument(createdBy: string, p: ClientUpsertPayload): Promise<void> {
    const nom = clean(p.clientNom);
    if (!nom) return;

    const emailRaw = clean(p.clientEmail);
    const emailNorm = emailRaw ? emailRaw.toLowerCase() : '';
    const ice = clean(p.clientIce) || null;
    const phone = clean(p.clientTelephone) || null;

    try {
      const sb = this.supabase.getClient();
      let existingId: string | null = null;

      if (emailNorm) {
        const { data } = await sb
          .from('clients')
          .select('id')
          .eq('created_by', createdBy)
          .eq('client_email', emailNorm)
          .maybeSingle();
        if (data?.id) existingId = String(data.id);
      }

      if (!existingId && ice) {
        const { data } = await sb
          .from('clients')
          .select('id')
          .eq('created_by', createdBy)
          .eq('client_ice', ice)
          .maybeSingle();
        if (data?.id) existingId = String(data.id);
      }

      if (!existingId) {
        const { data } = await sb
          .from('clients')
          .select('id')
          .eq('created_by', createdBy)
          .eq('client_nom', nom)
          .is('client_email', null)
          .is('client_ice', null)
          .maybeSingle();
        if (data?.id) existingId = String(data.id);
      }

      const now = new Date().toISOString();
      const row = {
        client_nom: nom,
        client_email: emailNorm || null,
        client_telephone: phone,
        client_ice: ice,
        updated_at: now,
      };

      if (existingId) {
        const { error } = await sb.from('clients').update(row).eq('id', existingId);
        if (error) this.logger.warn(`clients update: ${error.message}`);
        return;
      }

      const { error } = await sb.from('clients').insert({
        ...row,
        created_by: createdBy,
        created_at: now,
      });
      if (error) this.logger.warn(`clients insert: ${error.message}`);
    } catch (e) {
      const err = e as Error;
      this.logger.warn(`clients upsert: ${err.message}`);
    }
  }
}
