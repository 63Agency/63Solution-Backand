import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreatePipelineDto } from './dto/create-pipeline.dto';
import type { UpdatePipelineDto } from './dto/update-pipeline.dto';

const PORTAL_PIPELINES_TABLE = 'portal.pipelines';

type PipelineRow = {
  id: string;
  name: string;
  color: string;
};

function mapPipeline(r: PipelineRow) {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    color: String(r.color ?? 'gold'),
  };
}

@Injectable()
export class PortalPipelinesService {
  constructor(private readonly supabase: SupabaseService) {}

  /** client_id = JWT only — never from body/query. */
  private clientId(user: PortalClientUser): string {
    return user.clientId;
  }

  async list(user: PortalClientUser) {
    const clientId = this.clientId(user);
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_PIPELINES_TABLE)
      .select('id, name, color')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as PipelineRow[]).map(mapPipeline);
  }

  async create(dto: CreatePipelineDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    const name = dto.name.trim();
    const color = (dto.color?.trim() || 'gold');

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_PIPELINES_TABLE)
      .insert({
        client_id: clientId,
        name,
        color,
      })
      .select('id, name, color')
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible de créer le pipeline.',
      });
    }

    return mapPipeline(data as PipelineRow);
  }

  async update(id: string, dto: UpdatePipelineDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    const patch: Record<string, string> = {};

    if (dto.name !== undefined) {
      patch.name = dto.name.trim();
    }
    if (dto.color !== undefined) {
      patch.color = dto.color.trim();
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException({
        message: 'Aucun champ à mettre à jour (name ou color).',
      });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_PIPELINES_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('client_id', clientId)
      .select('id, name, color')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Pipeline introuvable.' });
    }

    return mapPipeline(data as PipelineRow);
  }

  async remove(id: string, user: PortalClientUser): Promise<void> {
    const clientId = this.clientId(user);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_PIPELINES_TABLE)
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Pipeline introuvable.' });
    }
  }
}
