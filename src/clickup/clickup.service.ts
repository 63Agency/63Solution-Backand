import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppUser } from '../auth/types/app-user';
import { assertCanAccessLeads } from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import type { ClickUpLead } from './types/clickup.types';
import {
  mapClickUpTaskToLead,
  resolveLeadEmail,
} from './utils/clickup-task-parser';

type LeadRow = {
  id: string;
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

function customFieldsFromClickupData(
  clickupData: Record<string, unknown> | null,
): unknown[] | undefined {
  if (!clickupData || typeof clickupData !== 'object') return undefined;
  const task = clickupData.task;
  if (!task || typeof task !== 'object') return undefined;
  const fields = (task as Record<string, unknown>).custom_fields;
  return Array.isArray(fields) ? fields : undefined;
}

function mapLeadRow(row: LeadRow): ClickUpLead {
  const name = row.name ? String(row.name) : null;
  const email = resolveLeadEmail({
    existingEmail: row.email ? String(row.email) : null,
    customFields: customFieldsFromClickupData(row.clickup_data),
    name,
  });

  return {
    id: String(row.id),
    name,
    status: row.status ? String(row.status) : null,
    listId: row.list_id ? String(row.list_id) : null,
    listName: row.list_name ? String(row.list_name) : null,
    phone: row.phone ? String(row.phone) : null,
    email,
    contact_email: email,
    contactEmail: email,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    clickupData: (row.clickup_data ?? {}) as Record<string, unknown>,
  };
}

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const DEFAULT_TEAM_ID = '9012949492';
/** Fallback when CLICKUP_LIST_IDS is missing / empty. */
const DEFAULT_LIST_ID = '901214985003';

type ClickUpListRef = { id: string; name: string };

type ListSyncStats = {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
};

@Injectable()
export class ClickupService {
  private readonly logger = new Logger(ClickupService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

  private getApiToken(): string {
    const token = this.config.get<string>('CLICKUP_API_TOKEN')?.trim() ?? '';
    if (!token) {
      throw new ServiceUnavailableException({
        message: 'CLICKUP_API_TOKEN requis.',
      });
    }
    return token;
  }

  private getTeamId(): string {
    return (
      this.config.get<string>('CLICKUP_TEAM_ID')?.trim() ?? DEFAULT_TEAM_ID
    );
  }

  /** Parse CLICKUP_LIST_IDS (comma-separated). Fallback to DEFAULT_LIST_ID. */
  private getConfiguredListIds(): string[] {
    const raw = this.config.get<string>('CLICKUP_LIST_IDS') ?? '';
    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (ids.length > 0) return ids;

    this.logger.warn(
      `[ClickUpSync] CLICKUP_LIST_IDS missing — fallback list=${DEFAULT_LIST_ID}`,
    );
    return [DEFAULT_LIST_ID];
  }

  private async clickUpGet<T>(path: string): Promise<T> {
    const url = `${CLICKUP_API}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: this.getApiToken(),
        Accept: 'application/json',
      },
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail =
        typeof raw.err === 'string'
          ? raw.err
          : JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`ClickUp GET ${path} → ${res.status}: ${detail}`);
      throw new ServiceUnavailableException({
        message: `ClickUp API: ${path} (${res.status}).`,
      });
    }

    return raw as T;
  }

  private async resolveListRef(listId: string): Promise<ClickUpListRef> {
    try {
      const res = await this.clickUpGet<{ name?: string }>(
        `/list/${encodeURIComponent(listId)}`,
      );
      return { id: listId, name: String(res.name ?? '').trim() };
    } catch {
      return { id: listId, name: '' };
    }
  }

  private async fetchAllTasksFromList(
    listId: string,
  ): Promise<Record<string, unknown>[]> {
    const tasks: Record<string, unknown>[] = [];
    let page = 0;
    let lastPage = false;

    while (!lastPage) {
      const res = await this.clickUpGet<{
        tasks?: Record<string, unknown>[];
        last_page?: boolean;
      }>(
        `/list/${encodeURIComponent(listId)}/task?archived=false&include_closed=true&page=${page}`,
      );

      for (const task of res.tasks ?? []) {
        tasks.push(task);
      }

      lastPage = res.last_page === true;
      page += 1;
    }

    return tasks;
  }

  /** Ensure list_id / list_name are always set from the sync source list. */
  private withListSource(
    task: Record<string, unknown>,
    list: ClickUpListRef,
  ): Record<string, unknown> {
    const existing =
      task.list && typeof task.list === 'object'
        ? (task.list as Record<string, unknown>)
        : {};
    const existingName =
      typeof existing.name === 'string' ? existing.name.trim() : '';

    return {
      ...task,
      list: {
        ...existing,
        id: list.id,
        name: list.name || existingName || list.id,
      },
    };
  }

  private async leadExists(id: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      this.logger.warn(
        `[ClickUpSync] leadExists check failed id=${id}: ${error.message}`,
      );
      return false;
    }
    return Boolean(data?.id);
  }

  async syncAllLeads(): Promise<number> {
    const listIds = this.getConfiguredListIds();
    this.logger.log(
      `[ClickUpSync] starting lists=${listIds.length} team=${this.getTeamId()}`,
    );

    let listsOk = 0;
    let listsFailed = 0;
    let totalLeads = 0;

    for (const listId of listIds) {
      try {
        const list = await this.resolveListRef(listId);
        const stats = await this.syncOneList(list);
        listsOk += 1;
        totalLeads += stats.inserted + stats.updated;

        this.logger.log(
          `[ClickUpSync] list=${list.id} name=${list.name || '-'} fetched=${stats.fetched} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped}`,
        );
      } catch (err) {
        listsFailed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[ClickUpSync] list=${listId} FAILED: ${message}`,
        );
      }
    }

    this.logger.log(
      `[ClickUpSync] TOTAL lists=${listIds.length} ok=${listsOk} failed=${listsFailed} leads=${totalLeads}`,
    );

    return totalLeads;
  }

  private async syncOneList(list: ClickUpListRef): Promise<ListSyncStats> {
    const tasks = await this.fetchAllTasksFromList(list.id);
    const stats: ListSyncStats = {
      fetched: tasks.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
    };

    for (const task of tasks) {
      try {
        const enriched = this.withListSource(task, list);
        const mapped = mapClickUpTaskToLead(enriched);
        if (!mapped.id) {
          stats.skipped += 1;
          continue;
        }

        const existed = await this.leadExists(mapped.id);
        await this.saveOrUpdateLead(enriched);
        if (existed) stats.updated += 1;
        else stats.inserted += 1;
      } catch (err) {
        stats.skipped += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[ClickUpSync] list=${list.id} task skipped: ${message}`,
        );
      }
    }

    return stats;
  }

  async resolveTaskFromWebhook(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const embedded = payload.task;
    if (embedded && typeof embedded === 'object') {
      return embedded as Record<string, unknown>;
    }

    const taskId =
      typeof payload.task_id === 'string' ? payload.task_id.trim() : '';
    if (!taskId) {
      throw new ConflictException({
        message: 'ClickUp webhook: task_id manquant',
      });
    }

    return this.fetchTaskFromApi(taskId);
  }

  private async fetchTaskFromApi(
    taskId: string,
  ): Promise<Record<string, unknown>> {
    return this.clickUpGet<Record<string, unknown>>(
      `/task/${encodeURIComponent(taskId)}`,
    );
  }

  async saveOrUpdateLead(
    task: Record<string, unknown>,
    webhookPayload?: Record<string, unknown>,
  ): Promise<ClickUpLead> {
    const mapped = mapClickUpTaskToLead(task, webhookPayload);
    if (!mapped.id) {
      throw new ConflictException({
        message: 'ClickUp: id de tâche manquant',
      });
    }

    const row = {
      id: mapped.id,
      name: mapped.name,
      status: mapped.status,
      list_id: mapped.listId,
      list_name: mapped.listName,
      phone: mapped.phone,
      email: mapped.email,
      clickup_data: mapped.clickupData,
      created_at: mapped.createdAt,
      updated_at: mapped.updatedAt,
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Enregistrement lead impossible',
      });
    }

    this.logger.log(
      `ClickUp lead saved id=${mapped.id} status=${mapped.status ?? ''} list=${mapped.listName ?? ''}`,
    );
    return mapLeadRow(data as LeadRow);
  }

  async handleWebhookEvent(payload: Record<string, unknown>): Promise<ClickUpLead | null> {
    const event = String(payload.event ?? '').trim();
    if (event !== 'taskCreated' && event !== 'taskUpdated') {
      this.logger.log(`ClickUp webhook ignored event=${event || 'unknown'}`);
      return null;
    }

    const task = await this.resolveTaskFromWebhook(payload);
    return this.saveOrUpdateLead(task, payload);
  }

  async listLeads(
    user: AppUser,
    filters: {
      status?: string;
      listId?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<{ items: ClickUpLead[]; total: number }> {
    assertCanAccessLeads(user);

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const status = filters.status?.trim();
    const listId = filters.listId?.trim();
    const search = filters.search?.trim();

    let query = this.supabase
      .getClient()
      .from('clickup_leads')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (listId) query = query.eq('list_id', listId);
    if (search) {
      const term = search.replace(/,/g, ' ').trim();
      query = query.or(
        `name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }

    const { data, error, count } = await query.range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: (data ?? []).map((row) => mapLeadRow(row as LeadRow)),
      total: count ?? 0,
    };
  }

  async getLeadById(user: AppUser, id: string): Promise<{ item: ClickUpLead }> {
    assertCanAccessLeads(user);

    const leadId = id.trim();
    if (!leadId) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .select('*')
      .eq('id', leadId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }

    return { item: mapLeadRow(data as LeadRow) };
  }

  async syncLeadsForUser(
    user: AppUser,
  ): Promise<{ ok: true; synced: number }> {
    assertCanAccessLeads(user);
    const synced = await this.syncAllLeads();
    return { ok: true, synced };
  }

  async getLeadsMeta(user: AppUser): Promise<{
    statuses: string[];
    lists: Array<{ id: string; name: string }>;
  }> {
    assertCanAccessLeads(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .select('status, list_id, list_name');

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const statuses = new Set<string>();
    const listsById = new Map<string, string>();

    for (const row of data ?? []) {
      const status = row.status ? String(row.status).trim() : '';
      if (status) statuses.add(status);

      const listId = row.list_id ? String(row.list_id).trim() : '';
      if (!listId) continue;
      const listName = row.list_name ? String(row.list_name).trim() : listId;
      listsById.set(listId, listName);
    }

    return {
      statuses: [...statuses].sort((a, b) => a.localeCompare(b, 'fr')),
      lists: [...listsById.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    };
  }

  async getLeadsStats(user: AppUser): Promise<{
    total: number;
    byStatus: Record<string, number>;
  }> {
    assertCanAccessLeads(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('clickup_leads')
      .select('status');

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const byStatus: Record<string, number> = {};
    for (const row of data ?? []) {
      const status = row.status ? String(row.status).trim() : 'Sans statut';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
    }

    return {
      total: data?.length ?? 0,
      byStatus,
    };
  }
}
