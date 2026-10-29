import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';
import type { UpdateLeadOwnerDto } from './dto/update-lead-owner.dto';
import type { UpdateLeadStageDto } from './dto/update-lead-stage.dto';

const PORTAL_LEADS_TABLE = 'portal.leads';
const PORTAL_PIPELINES_TABLE = 'portal.pipelines';

const LEAD_SELECT =
  'id, name, phone, email, campaign, owner, estimated_value, stage, pipeline_id, created_at';

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  campaign: string | null;
  owner: string | null;
  estimated_value: string | number | null;
  stage: string;
  pipeline_id: string | null;
  created_at: string;
};

/** Shape frontend PipelineLead. */
function mapLead(r: LeadRow) {
  const rawValue = r.estimated_value;
  let estimated_value: number | null = null;
  if (rawValue !== null && rawValue !== undefined && rawValue !== '') {
    const n = Number(rawValue);
    estimated_value = Number.isFinite(n) ? n : null;
  }

  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    phone: r.phone != null ? String(r.phone) : null,
    email: r.email != null ? String(r.email) : null,
    campaign: r.campaign != null ? String(r.campaign) : null,
    owner: r.owner != null ? String(r.owner) : null,
    estimated_value,
    date: r.created_at,
    stage: String(r.stage ?? 'nouveau'),
    pipeline_id: r.pipeline_id != null ? String(r.pipeline_id) : null,
  };
}

function cleanOptional(value: string | undefined): string | null {
  if (value === undefined) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

@Injectable()
export class PortalLeadsService {
  constructor(private readonly supabase: SupabaseService) {}

  private clientId(user: PortalClientUser): string {
    return user.clientId;
  }

  private async assertPipelineOwned(
    pipelineId: string,
    clientId: string,
  ): Promise<void> {
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_PIPELINES_TABLE)
      .select('id')
      .eq('id', pipelineId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({
        message: 'Pipeline introuvable.',
      });
    }
  }

  async list(user: PortalClientUser, query: ListLeadsQueryDto) {
    const clientId = this.clientId(user);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 100);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let qb = this.supabase
      .getClient()
      .from(PORTAL_LEADS_TABLE)
      .select(LEAD_SELECT, { count: 'exact' })
      .eq('client_id', clientId);

    const pipelineFilter = query.pipeline_id?.trim();
    if (pipelineFilter && pipelineFilter !== 'all') {
      qb = qb.eq('pipeline_id', pipelineFilter);
    }

    if (query.stage) {
      qb = qb.eq('stage', query.stage);
    }

    const { data, error, count } = await qb
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      data: ((data ?? []) as LeadRow[]).map(mapLead),
      total: count ?? 0,
      page,
      limit,
    };
  }

  async create(dto: CreateLeadDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    await this.assertPipelineOwned(dto.pipeline_id, clientId);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEADS_TABLE)
      .insert({
        client_id: clientId,
        pipeline_id: dto.pipeline_id,
        name: dto.name.trim(),
        phone: cleanOptional(dto.phone),
        email: cleanOptional(dto.email)?.toLowerCase() ?? null,
        campaign: cleanOptional(dto.campaign),
        estimated_value:
          dto.estimated_value !== undefined ? dto.estimated_value : null,
        stage: 'nouveau',
      })
      .select(LEAD_SELECT)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible de créer le lead.',
      });
    }

    return mapLead(data as LeadRow);
  }

  async update(id: string, dto: UpdateLeadDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.phone !== undefined) patch.phone = cleanOptional(dto.phone);
    if (dto.email !== undefined) {
      patch.email = cleanOptional(dto.email)?.toLowerCase() ?? null;
    }
    if (dto.campaign !== undefined) {
      patch.campaign = cleanOptional(dto.campaign);
    }
    if (dto.estimated_value !== undefined) {
      patch.estimated_value = dto.estimated_value;
    }

    const fieldKeys = Object.keys(patch).filter((k) => k !== 'updated_at');
    if (fieldKeys.length === 0) {
      throw new BadRequestException({
        message: 'Aucun champ à mettre à jour.',
      });
    }

    return this.updateOwned(id, clientId, patch);
  }

  async updateStage(
    id: string,
    dto: UpdateLeadStageDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);
    return this.updateOwned(id, clientId, {
      stage: dto.stage,
      updated_at: new Date().toISOString(),
    });
  }

  async updateOwner(
    id: string,
    dto: UpdateLeadOwnerDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);
    const owner = dto.owner.trim();
    return this.updateOwned(id, clientId, {
      owner: owner.length > 0 ? owner : null,
      updated_at: new Date().toISOString(),
    });
  }

  async remove(id: string, user: PortalClientUser): Promise<void> {
    const clientId = this.clientId(user);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEADS_TABLE)
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }
  }

  private async updateOwned(
    id: string,
    clientId: string,
    patch: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEADS_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('client_id', clientId)
      .select(LEAD_SELECT)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }

    return mapLead(data as LeadRow);
  }
}
