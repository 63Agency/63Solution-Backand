import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../../auth/types/app-user';
import { assertCanAccessLeads } from '../../common/utils/access';
import { isFullAdmin } from '../../common/utils/roles';
import { SupabaseService } from '../../supabase/supabase.service';
import type { CreateCrmLeadDto } from './dto/create-crm-lead.dto';
import type { PatchCrmLeadDto } from './dto/patch-crm-lead.dto';
import {
  extractFormAnswers,
  readManualMeta,
} from './form-answers';
import type {
  CrmMeeting,
  FullLead,
  LeadDetailResponse,
  LeadRow,
} from './crm-leads.types';
import {
  isLeadStatus,
  mapClickupStatus,
  type LeadStatus,
} from './status-map';

const LIST_LIMIT = 2000;

const CLICKUP_LEAD_SELECT =
  'id, clickup_task_id, name, status, list_id, list_name, phone, email, clickup_data, created_at, updated_at';

const META_SELECT = 'lead_id, status, niche_id, owner_id, created_at, updated_at';

const MEETING_SELECT = 'id, lead_id, title, meeting_date, status, meet_link';

type ClickupLeadRow = {
  id: string;
  clickup_task_id: string | null;
  name: string | null;
  status: string | null;
  list_id: string | null;
  list_name: string | null;
  phone: string | null;
  email: string | null;
  clickup_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type MetaRow = {
  lead_id: string;
  status: string;
  niche_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

type MeetingAgg = {
  meetings: number;
  done: number;
  noShow: number;
  nextMeeting: string | null;
};

type MeetingDbRow = {
  id: string;
  lead_id: string | null;
  title: string;
  meeting_date: string;
  status: string;
  meet_link: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

@Injectable()
export class CrmLeadsService {
  private readonly logger = new Logger(CrmLeadsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Admin (full) → tous les leads.
   * Autres rôles canAccessLeads (admin_whatsapp) → owner_id = user.id uniquement.
   */
  private seesAllLeads(user: AppUser): boolean {
    return isFullAdmin(user.role);
  }

  async list(user: AppUser): Promise<LeadRow[]> {
    assertCanAccessLeads(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .select(CLICKUP_LEAD_SELECT)
      .order('updated_at', { ascending: false })
      .limit(LIST_LIMIT);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const rows = (data ?? []) as ClickupLeadRow[];
    if (rows.length === 0) return [];

    const metaByLead = await this.ensureMetaForLeads(rows);
    const meetingByLead = await this.loadMeetingAggs(rows.map((r) => r.id));

    const out: LeadRow[] = [];
    for (const row of rows) {
      const meta = metaByLead.get(row.id);
      if (!meta) continue;
      if (!this.seesAllLeads(user) && meta.owner_id !== user.id) continue;
      out.push(this.toLeadRow(row, meta, meetingByLead.get(row.id)));
    }
    return out;
  }

  async getOne(user: AppUser, id: string): Promise<LeadDetailResponse> {
    assertCanAccessLeads(user);
    const leadId = clean(id);
    if (!leadId) throw new NotFoundException({ message: 'Lead introuvable.' });

    const row = await this.fetchClickupLead(leadId);
    const meta = await this.ensureMetaOne(row);
    if (!this.seesAllLeads(user) && meta.owner_id !== user.id) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }

    const lead = this.toFullLead(row, meta);
    const meetings = await this.loadMeetingsForLead(row.id);

    // STUB deals — table deals absente
    return { lead, deal: null, meetings };
  }

  async patch(
    user: AppUser,
    id: string,
    dto: PatchCrmLeadDto,
  ): Promise<LeadRow> {
    assertCanAccessLeads(user);
    const leadId = clean(id);
    if (!leadId) throw new NotFoundException({ message: 'Lead introuvable.' });

    const row = await this.fetchClickupLead(leadId);
    const meta = await this.ensureMetaOne(row);
    if (!this.seesAllLeads(user) && meta.owner_id !== user.id) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.status !== undefined) {
      if (!isLeadStatus(dto.status)) {
        throw new ConflictException({ message: 'status CRM invalide' });
      }
      patch.status = dto.status;
    }
    if (dto.niche_id !== undefined) {
      patch.niche_id = dto.niche_id;
    }
    if (dto.owner_id !== undefined) {
      patch.owner_id = dto.owner_id;
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('crm_lead_meta')
      .update(patch)
      .eq('lead_id', leadId)
      .select(META_SELECT)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead meta introuvable.' });
    }

    const updated = data as MetaRow;
    const meetingByLead = await this.loadMeetingAggs([leadId]);
    return this.toLeadRow(row, updated, meetingByLead.get(leadId));
  }

  /**
   * Lead manuel : insert clickup_leads (clickup_task_id null) + crm_lead_meta.
   * source stockée dans clickup_data (pas de colonne source sur clickup_leads).
   */
  async create(
    user: AppUser,
    dto: CreateCrmLeadDto,
  ): Promise<{ id: string }> {
    assertCanAccessLeads(user);

    const fullName = clean(dto.full_name);
    if (!fullName) {
      throw new ConflictException({ message: 'full_name requis' });
    }

    const status: LeadStatus =
      dto.status && isLeadStatus(dto.status) ? dto.status : 'new';
    const ownerId =
      clean(dto.owner_id ?? '') ||
      (!this.seesAllLeads(user) ? user.id : null);
    const nicheId = clean(dto.niche_id ?? '') || null;
    const source = clean(dto.source ?? '') || 'manual';
    const company = clean(dto.company ?? '') || null;
    const phone = clean(dto.phone ?? '') || null;
    const email = clean(dto.email ?? '').toLowerCase() || null;

    const clickupData: Record<string, unknown> = {
      source,
      created_by: user.id,
      ...(company ? { company } : {}),
    };

    const { data: inserted, error: insertErr } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .insert({
        clickup_task_id: null,
        name: fullName,
        status: null,
        list_id: null,
        list_name: null,
        phone,
        email,
        clickup_data: clickupData,
      })
      .select(CLICKUP_LEAD_SELECT)
      .maybeSingle();

    if (insertErr) {
      throw new ConflictException({ message: insertErr.message });
    }
    if (!inserted) {
      throw new ConflictException({ message: 'Échec création lead.' });
    }

    const lead = inserted as ClickupLeadRow;
    const { error: metaErr } = await this.supabase
      .getClient()
      .from('crm_lead_meta')
      .insert({
        lead_id: lead.id,
        status,
        niche_id: nicheId,
        owner_id: ownerId,
      });

    if (metaErr) {
      this.logger.error(
        `[CrmLeads] meta insert failed after clickup_leads id=${lead.id}: ${metaErr.message}`,
      );
      throw new ConflictException({ message: metaErr.message });
    }

    return { id: lead.id };
  }

  // ─── internals ─────────────────────────────────────────────

  private async fetchClickupLead(id: string): Promise<ClickupLeadRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .select(CLICKUP_LEAD_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }
    return data as ClickupLeadRow;
  }

  private async ensureMetaForLeads(
    rows: ClickupLeadRow[],
  ): Promise<Map<string, MetaRow>> {
    const ids = rows.map((r) => r.id);
    const { data, error } = await this.supabase
      .getClient()
      .from('crm_lead_meta')
      .select(META_SELECT)
      .in('lead_id', ids);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const map = new Map<string, MetaRow>();
    for (const m of (data ?? []) as MetaRow[]) {
      map.set(m.lead_id, m);
    }

    const missing = rows.filter((r) => !map.has(r.id));
    if (missing.length === 0) return map;

    const inserts = missing.map((r) => ({
      lead_id: r.id,
      status: mapClickupStatus(r.status),
      niche_id: null as string | null,
      owner_id: null as string | null,
    }));

    await this.seedMetaRaw(inserts);

    const { data: again, error: againErr } = await this.supabase
      .getClient()
      .from('crm_lead_meta')
      .select(META_SELECT)
      .in(
        'lead_id',
        missing.map((r) => r.id),
      );

    if (againErr) {
      throw new ConflictException({ message: againErr.message });
    }
    for (const m of (again ?? []) as MetaRow[]) {
      map.set(m.lead_id, m);
    }
    return map;
  }

  private async seedMetaRaw(
    inserts: Array<{
      lead_id: string;
      status: LeadStatus;
      niche_id: string | null;
      owner_id: string | null;
    }>,
  ): Promise<void> {
    if (inserts.length === 0) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let i = 1;
    for (const row of inserts) {
      placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++})`);
      values.push(row.lead_id, row.status, row.niche_id, row.owner_id);
    }
    const sql = `
      INSERT INTO public.crm_lead_meta (lead_id, status, niche_id, owner_id)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (lead_id) DO NOTHING
    `;
    const { error } = await this.supabase.query(sql, values);
    if (error) {
      throw new ConflictException({ message: error.message });
    }
  }

  private async ensureMetaOne(row: ClickupLeadRow): Promise<MetaRow> {
    const map = await this.ensureMetaForLeads([row]);
    const meta = map.get(row.id);
    if (!meta) {
      throw new ConflictException({
        message: 'Impossible de créer crm_lead_meta.',
      });
    }
    return meta;
  }

  /**
   * Agrégation meetings (table public.meetings.lead_id existe).
   */
  private async loadMeetingAggs(
    leadIds: string[],
  ): Promise<Map<string, MeetingAgg>> {
    const map = new Map<string, MeetingAgg>();
    if (leadIds.length === 0) return map;

    const { rows, error } = await this.supabase.query<{
      lead_id: string;
      meetings: number;
      done: number;
      no_show: number;
      next_meeting: string | null;
    }>(
      `
      SELECT
        lead_id::text AS lead_id,
        COUNT(*)::int AS meetings,
        COUNT(*) FILTER (WHERE status = 'done')::int AS done,
        COUNT(*) FILTER (WHERE status = 'no_show')::int AS no_show,
        MIN(meeting_date) FILTER (
          WHERE status IN ('scheduled', 'confirmed', 'bon_qualified', 'no_answer')
            AND meeting_date >= NOW()
        ) AS next_meeting
      FROM public.meetings
      WHERE lead_id = ANY($1::uuid[])
      GROUP BY lead_id
      `,
      [leadIds],
    );

    if (error) {
      this.logger.warn(`[CrmLeads] meetings agg failed: ${error.message}`);
      return map;
    }

    for (const r of rows) {
      map.set(String(r.lead_id), {
        meetings: Number(r.meetings) || 0,
        done: Number(r.done) || 0,
        noShow: Number(r.no_show) || 0,
        nextMeeting: r.next_meeting ? String(r.next_meeting) : null,
      });
    }
    return map;
  }

  private async loadMeetingsForLead(leadId: string): Promise<CrmMeeting[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('meetings')
      .select(MEETING_SELECT)
      .eq('lead_id', leadId)
      .order('meeting_date', { ascending: false })
      .limit(100);

    if (error) {
      this.logger.warn(
        `[CrmLeads] meetings list failed lead=${leadId}: ${error.message}`,
      );
      return [];
    }

    return ((data ?? []) as MeetingDbRow[]).map((m) => ({
      id: String(m.id),
      title: String(m.title ?? ''),
      start_at: String(m.meeting_date),
      status: String(m.status ?? ''),
      meeting_link: m.meet_link ? String(m.meet_link) : null,
    }));
  }

  private toLeadRow(
    row: ClickupLeadRow,
    meta: MetaRow,
    agg: MeetingAgg | undefined,
  ): LeadRow {
    const base = this.toBase(row, meta);
    const ownerId = meta.owner_id ? String(meta.owner_id) : null;
    return {
      ...base,
      status: isLeadStatus(meta.status) ? meta.status : 'new',
      meetings: agg?.meetings ?? 0,
      done: agg?.done ?? 0,
      noShow: agg?.noShow ?? 0,
      nextMeeting: agg?.nextMeeting ?? null,
      // STUB deals
      dealId: null,
      dealStage: null,
      ownerId,
      // STUB notes / reminders (prochain prompt)
      noteCount: 0,
      lastNote: null,
      nextReminder: null,
    };
  }

  private toFullLead(row: ClickupLeadRow, meta: MetaRow): FullLead {
    const base = this.toBase(row, meta);
    const ownerId = meta.owner_id ? String(meta.owner_id) : null;
    return {
      ...base,
      status: isLeadStatus(meta.status) ? meta.status : 'new',
      dealId: null,
      ownerId,
    };
  }

  private toBase(
    row: ClickupLeadRow,
    meta: MetaRow,
  ): Omit<LeadRow, | 'status' | 'meetings' | 'done' | 'noShow' | 'nextMeeting' | 'dealId' | 'dealStage' | 'ownerId' | 'noteCount' | 'lastNote' | 'nextReminder'> {
    const clickupData = (row.clickup_data ?? {}) as Record<string, unknown>;
    const manual = readManualMeta(clickupData);
    const formAnswers = extractFormAnswers(clickupData);
    const listName = row.list_name ? String(row.list_name) : null;

    return {
      id: String(row.id),
      full_name: row.name ? String(row.name) : '',
      phone: row.phone ? String(row.phone) : null,
      email: row.email ? String(row.email) : null,
      company: manual.company,
      source: manual.source || listName,
      created_by: manual.createdBy,
      created_at: String(row.created_at),
      funnel: null,
      form_name: null,
      campaign: null,
      campaign_id: null,
      adset: null,
      adset_id: null,
      ad: null,
      ad_id: null,
      utm_source: null,
      utm_medium: null,
      fbclid: null,
      form_answers: formAnswers,
      niche_id: meta.niche_id ? String(meta.niche_id) : null,
      owner_id: meta.owner_id ? String(meta.owner_id) : null,
    };
  }
}
