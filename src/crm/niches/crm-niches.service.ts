import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../../auth/types/app-user';
import { assertCanAccessLeads } from '../../common/utils/access';
import { SupabaseService } from '../../supabase/supabase.service';
import type { CreateCrmNicheDto } from './dto/create-crm-niche.dto';
import type { UpdateCrmNicheDto } from './dto/update-crm-niche.dto';

export type CrmNiche = {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
};

const NICHE_SELECT = 'id, name, color, position, created_at';

type NicheRow = {
  id: string;
  name: string;
  color: string;
  position: number;
  created_at: string;
};

function mapNiche(row: NicheRow): CrmNiche {
  return {
    id: String(row.id),
    name: String(row.name),
    color: String(row.color || 'gray'),
    position: Number(row.position) || 0,
    created_at: String(row.created_at),
  };
}

@Injectable()
export class CrmNichesService {
  constructor(private readonly supabase: SupabaseService) {}

  async list(user: AppUser): Promise<CrmNiche[]> {
    assertCanAccessLeads(user);
    const { data, error } = await this.supabase
      .getClient()
      .from('crm_niches')
      .select(NICHE_SELECT)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return ((data ?? []) as NicheRow[]).map(mapNiche);
  }

  async create(
    user: AppUser,
    dto: CreateCrmNicheDto,
  ): Promise<{ id: string }> {
    assertCanAccessLeads(user);
    const name = (dto.name ?? '').trim();
    if (!name) {
      throw new ConflictException({ message: 'name requis' });
    }
    const color = (dto.color ?? 'gray').trim() || 'gray';

    const { data: maxRow } = await this.supabase
      .getClient()
      .from('crm_niches')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const position =
      maxRow && typeof (maxRow as { position?: number }).position === 'number'
        ? Number((maxRow as { position: number }).position) + 1
        : 0;

    const { data, error } = await this.supabase
      .getClient()
      .from('crm_niches')
      .insert({ name, color, position })
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new ConflictException({ message: 'Échec création niche.' });
    }
    return { id: String((data as { id: string }).id) };
  }

  async update(
    user: AppUser,
    id: string,
    dto: UpdateCrmNicheDto,
  ): Promise<CrmNiche> {
    assertCanAccessLeads(user);
    const nicheId = (id ?? '').trim();
    if (!nicheId) {
      throw new NotFoundException({ message: 'Niche introuvable.' });
    }

    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new ConflictException({ message: 'name requis' });
      patch.name = name;
    }
    if (dto.color !== undefined) {
      patch.color = dto.color.trim() || 'gray';
    }
    if (Object.keys(patch).length === 0) {
      throw new ConflictException({ message: 'Aucun champ à mettre à jour.' });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('crm_niches')
      .update(patch)
      .eq('id', nicheId)
      .select(NICHE_SELECT)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Niche introuvable.' });
    }
    return mapNiche(data as NicheRow);
  }

  async remove(user: AppUser, id: string): Promise<void> {
    assertCanAccessLeads(user);
    const nicheId = (id ?? '').trim();
    if (!nicheId) {
      throw new NotFoundException({ message: 'Niche introuvable.' });
    }

    // ON DELETE SET NULL sur crm_lead_meta.niche_id
    const { data, error } = await this.supabase
      .getClient()
      .from('crm_niches')
      .delete()
      .eq('id', nicheId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Niche introuvable.' });
    }
  }
}
