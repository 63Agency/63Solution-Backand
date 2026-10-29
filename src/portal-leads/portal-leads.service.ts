import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { PortalTasksService } from '../portal-tasks/portal-tasks.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { CreateLeadNoteDto } from './dto/create-lead-note.dto';
import type { CreateLeadReminderDto } from './dto/create-lead-reminder.dto';
import type { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';
import type { UpdateLeadOwnerDto } from './dto/update-lead-owner.dto';
import type { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import type { PortalLeadActivityKind } from './portal-lead-activity.kinds';
import { stageLabel } from './portal-lead-activity.labels';

const PORTAL_LEADS_TABLE = 'portal.leads';
const PORTAL_PIPELINES_TABLE = 'portal.pipelines';
const PORTAL_LEAD_NOTES_TABLE = 'portal.lead_notes';
const PORTAL_LEAD_ACTIVITY_TABLE = 'portal.lead_activity';

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

type NoteRow = {
  id: string;
  lead_id: string;
  author: string | null;
  body: string;
  created_at: string;
};

type ActivityRow = {
  id: string;
  lead_id: string;
  kind: string;
  actor: string | null;
  message: string;
  detail: string | null;
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

function mapNote(r: NoteRow) {
  return {
    id: String(r.id),
    lead_id: String(r.lead_id),
    author: r.author != null ? String(r.author) : null,
    body: String(r.body ?? ''),
    created_at: r.created_at,
  };
}

function mapActivity(r: ActivityRow) {
  return {
    id: String(r.id),
    lead_id: String(r.lead_id),
    kind: String(r.kind),
    actor: r.actor != null ? String(r.actor) : null,
    message: String(r.message ?? ''),
    detail: r.detail != null ? String(r.detail) : null,
    created_at: r.created_at,
  };
}

function cleanOptional(value: string | undefined): string | null {
  if (value === undefined) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function actorFromUser(user: PortalClientUser): string {
  const company = user.companyName?.trim();
  if (company) return company;
  const email = user.email?.trim();
  if (email) return email;
  return 'client';
}

function endOfUtcDayIso(from = new Date()): string {
  const d = new Date(from);
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}

@Injectable()
export class PortalLeadsService {
  private readonly logger = new Logger(PortalLeadsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly portalTasks: PortalTasksService,
  ) {}

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

  /** Lead doit appartenir au client JWT — sinon 404. */
  private async assertLeadOwned(
    leadId: string,
    clientId: string,
  ): Promise<LeadRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEADS_TABLE)
      .select(LEAD_SELECT)
      .eq('id', leadId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }
    return data as LeadRow;
  }

  private async insertActivity(input: {
    clientId: string;
    leadId: string;
    kind: PortalLeadActivityKind;
    actor: string | null;
    message: string;
    detail?: string | null;
  }): Promise<ActivityRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEAD_ACTIVITY_TABLE)
      .insert({
        client_id: input.clientId,
        lead_id: input.leadId,
        kind: input.kind,
        actor: input.actor,
        message: input.message,
        detail: input.detail ?? null,
      })
      .select('id, lead_id, kind, actor, message, detail, created_at')
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible d’enregistrer l’activité.',
      });
    }
    return data as ActivityRow;
  }

  /** Side-effect logging — ne doit pas casser le retour lead existant. */
  private async tryInsertActivity(
    input: Parameters<PortalLeadsService['insertActivity']>[0],
  ): Promise<void> {
    try {
      await this.insertActivity(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `lead_activity ${input.kind} lead=${input.leadId}: ${msg}`,
      );
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

    const lead = data as LeadRow;
    await this.tryInsertActivity({
      clientId,
      leadId: lead.id,
      kind: 'received',
      actor: actorFromUser(user),
      message: 'Lead reçu',
      detail: lead.name,
    });

    // UI: nouveaux leads → tâche d'appel automatique (due aujourd’hui).
    await this.portalTasks.tryCreateFromLead({
      clientId,
      leadId: lead.id,
      pipelineId: lead.pipeline_id,
      leadName: lead.name,
      phone: lead.phone,
      taskType: 'appel',
      dueAt: endOfUtcDayIso(),
      details: null,
    });

    return mapLead(lead);
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
    const existing = await this.assertLeadOwned(id, clientId);
    const fromStage = existing.stage;
    const toStage = dto.stage;

    const mapped = await this.updateOwned(id, clientId, {
      stage: toStage,
      updated_at: new Date().toISOString(),
    });

    if (fromStage !== toStage) {
      await this.tryInsertActivity({
        clientId,
        leadId: id,
        kind: 'stage_change',
        actor: actorFromUser(user),
        message: `${stageLabel(fromStage)} -> ${stageLabel(toStage)}`,
        detail: `${fromStage}->${toStage}`,
      });
    }

    return mapped;
  }

  async updateOwner(
    id: string,
    dto: UpdateLeadOwnerDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);
    const existing = await this.assertLeadOwned(id, clientId);
    const owner = dto.owner.trim();
    const nextOwner = owner.length > 0 ? owner : null;

    const mapped = await this.updateOwned(id, clientId, {
      owner: nextOwner,
      updated_at: new Date().toISOString(),
    });

    const prev = existing.owner?.trim() || '—';
    const next = nextOwner?.trim() || '—';
    await this.tryInsertActivity({
      clientId,
      leadId: id,
      kind: 'owner_change',
      actor: actorFromUser(user),
      message: `Propriétaire: ${prev} -> ${next}`,
      detail: nextOwner,
    });

    return mapped;
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

  async listNotes(leadId: string, user: PortalClientUser) {
    const clientId = this.clientId(user);
    await this.assertLeadOwned(leadId, clientId);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEAD_NOTES_TABLE)
      .select('id, lead_id, author, body, created_at')
      .eq('client_id', clientId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as NoteRow[]).map(mapNote);
  }

  async createNote(
    leadId: string,
    dto: CreateLeadNoteDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);
    await this.assertLeadOwned(leadId, clientId);

    const author = actorFromUser(user);
    const body = dto.body.trim();

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEAD_NOTES_TABLE)
      .insert({
        client_id: clientId,
        lead_id: leadId,
        author,
        body,
      })
      .select('id, lead_id, author, body, created_at')
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible de créer la note.',
      });
    }

    await this.insertActivity({
      clientId,
      leadId,
      kind: 'note',
      actor: author,
      message: 'Note ajoutée',
      detail: body.length > 200 ? `${body.slice(0, 200)}…` : body,
    });

    return mapNote(data as NoteRow);
  }

  async listActivity(leadId: string, user: PortalClientUser) {
    const clientId = this.clientId(user);
    await this.assertLeadOwned(leadId, clientId);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEAD_ACTIVITY_TABLE)
      .select('id, lead_id, kind, actor, message, detail, created_at')
      .eq('client_id', clientId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as ActivityRow[]).map(mapActivity);
  }

  async createReminder(
    leadId: string,
    dto: CreateLeadReminderDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);
    const lead = await this.assertLeadOwned(leadId, clientId);

    const actor = dto.actor?.trim() || actorFromUser(user);
    const details = dto.details?.trim() || null;
    const message = `Rappel ${dto.taskType} prévu le ${dto.dueAt}`;

    const row = await this.insertActivity({
      clientId,
      leadId,
      kind: 'reminder',
      actor,
      message,
      detail: details,
    });

    // Reminder → vraie tâche portail (même requête, scoped client_id).
    await this.portalTasks.createFromLead({
      clientId,
      leadId: lead.id,
      pipelineId: lead.pipeline_id,
      leadName: lead.name,
      phone: lead.phone,
      taskType: dto.taskType,
      dueAt: dto.dueAt,
      details,
    });

    return mapActivity(row);
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
