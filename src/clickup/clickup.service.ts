import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import type { ClickUpLead } from './types/clickup.types';
import { mapClickUpTaskToLead } from './utils/clickup-task-parser';

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

function mapLeadRow(row: LeadRow): ClickUpLead {
  return {
    id: String(row.id),
    name: row.name ? String(row.name) : null,
    status: row.status ? String(row.status) : null,
    listId: row.list_id ? String(row.list_id) : null,
    listName: row.list_name ? String(row.list_name) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    clickupData: (row.clickup_data ?? {}) as Record<string, unknown>,
  };
}

const CLICKUP_API = 'https://api.clickup.com/api/v2';
const DEFAULT_TEAM_ID = '9012949492';

type ClickUpListRef = { id: string; name: string };

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

  private async collectAllLists(teamId: string): Promise<ClickUpListRef[]> {
    const lists: ClickUpListRef[] = [];
    const spacesRes = await this.clickUpGet<{ spaces?: { id: string; name?: string }[] }>(
      `/team/${encodeURIComponent(teamId)}/space?archived=false`,
    );

    for (const space of spacesRes.spaces ?? []) {
      const spaceId = String(space.id);

      const folderlessRes = await this.clickUpGet<{ lists?: { id: string; name?: string }[] }>(
        `/space/${encodeURIComponent(spaceId)}/list?archived=false`,
      );
      for (const list of folderlessRes.lists ?? []) {
        lists.push({ id: String(list.id), name: String(list.name ?? '') });
      }

      const foldersRes = await this.clickUpGet<{ folders?: { id: string; name?: string }[] }>(
        `/space/${encodeURIComponent(spaceId)}/folder?archived=false`,
      );
      for (const folder of foldersRes.folders ?? []) {
        const folderId = String(folder.id);
        const folderListsRes = await this.clickUpGet<{ lists?: { id: string; name?: string }[] }>(
          `/folder/${encodeURIComponent(folderId)}/list?archived=false`,
        );
        for (const list of folderListsRes.lists ?? []) {
          lists.push({ id: String(list.id), name: String(list.name ?? '') });
        }
      }
    }

    return lists;
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

  async syncAllLeads(): Promise<number> {
    const teamId = this.getTeamId();
    this.logger.log(`ClickUp sync starting for team=${teamId}`);

    const lists = await this.collectAllLists(teamId);
    this.logger.log(`ClickUp sync: ${lists.length} lists found`);

    let synced = 0;
    for (const list of lists) {
      const tasks = await this.fetchAllTasksFromList(list.id);
      this.logger.log(
        `ClickUp sync: list=${list.name || list.id} tasks=${tasks.length}`,
      );

      for (const task of tasks) {
        await this.saveOrUpdateLead(task);
        synced += 1;
      }
    }

    this.logger.log(`ClickUp sync complete: ${synced} leads synced`);
    return synced;
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
}
