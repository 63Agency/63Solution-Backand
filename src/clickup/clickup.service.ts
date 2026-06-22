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

@Injectable()
export class ClickupService {
  private readonly logger = new Logger(ClickupService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {}

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
    const token = this.config.get<string>('CLICKUP_API_TOKEN')?.trim() ?? '';
    if (!token) {
      throw new ServiceUnavailableException({
        message:
          'CLICKUP_API_TOKEN requis pour récupérer les détails de la tâche (webhook minimal).',
      });
    }

    const url = `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: token,
        Accept: 'application/json',
      },
    });

    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const detail =
        typeof raw.err === 'string'
          ? raw.err
          : JSON.stringify(raw).slice(0, 300);
      this.logger.warn(`ClickUp fetch task ${res.status}: ${detail}`);
      throw new ServiceUnavailableException({
        message: `ClickUp API: impossible de charger la tâche (${res.status}).`,
      });
    }

    return raw;
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
