import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import type { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import {
  defaultTaskTitle,
  type PortalTaskType,
} from './portal-task.constants';

const PORTAL_TASKS_TABLE = 'portal.tasks';
const PORTAL_LEADS_TABLE = 'portal.leads';
const PORTAL_PIPELINES_TABLE = 'portal.pipelines';

const TASK_SELECT =
  'id, title, lead_name, phone, pipeline_id, lead_id, task_type, details, status, due_at';

type TaskRow = {
  id: string;
  title: string;
  lead_name: string | null;
  phone: string | null;
  pipeline_id: string | null;
  lead_id: string | null;
  task_type: string;
  details: string | null;
  status: string;
  due_at: string;
};

/** Shape frontend Task. */
function mapTask(r: TaskRow) {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    lead_name: r.lead_name != null ? String(r.lead_name) : null,
    phone: r.phone != null ? String(r.phone) : null,
    pipeline_id: r.pipeline_id != null ? String(r.pipeline_id) : null,
    lead_id: r.lead_id != null ? String(r.lead_id) : null,
    task_type: String(r.task_type),
    details: r.details != null ? String(r.details) : null,
    status: String(r.status),
    due_at: r.due_at,
  };
}

export type CreateTaskFromLeadInput = {
  clientId: string;
  leadId: string;
  pipelineId: string | null;
  leadName: string;
  phone: string | null;
  taskType: PortalTaskType | string;
  dueAt: string;
  details?: string | null;
};

@Injectable()
export class PortalTasksService {
  private readonly logger = new Logger(PortalTasksService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private clientId(user: PortalClientUser): string {
    return user.clientId;
  }

  private async assertLeadOwned(
    leadId: string,
    clientId: string,
  ): Promise<{
    id: string;
    name: string;
    phone: string | null;
    pipeline_id: string | null;
  }> {
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_LEADS_TABLE)
      .select('id, name, phone, pipeline_id')
      .eq('id', leadId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Lead introuvable.' });
    }
    return data as {
      id: string;
      name: string;
      phone: string | null;
      pipeline_id: string | null;
    };
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
      throw new NotFoundException({ message: 'Pipeline introuvable.' });
    }
  }

  private async insertTask(row: {
    client_id: string;
    lead_id: string | null;
    pipeline_id: string | null;
    title: string;
    lead_name: string | null;
    phone: string | null;
    task_type: string;
    details: string | null;
    status: string;
    due_at: string;
  }): Promise<TaskRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_TASKS_TABLE)
      .insert(row)
      .select(TASK_SELECT)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible de créer la tâche.',
      });
    }
    return data as TaskRow;
  }

  async list(user: PortalClientUser, query: ListTasksQueryDto) {
    const clientId = this.clientId(user);

    let qb = this.supabase
      .getClient()
      .from(PORTAL_TASKS_TABLE)
      .select(TASK_SELECT)
      .eq('client_id', clientId);

    const pipelineFilter = query.pipeline_id?.trim();
    if (pipelineFilter && pipelineFilter !== 'all') {
      qb = qb.eq('pipeline_id', pipelineFilter);
    }
    if (query.status) {
      qb = qb.eq('status', query.status);
    }

    const { data, error } = await qb.order('due_at', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as TaskRow[]).map(mapTask);
  }

  async create(dto: CreateTaskDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    await this.assertLeadOwned(dto.lead_id, clientId);
    await this.assertPipelineOwned(dto.pipeline_id, clientId);

    const leadName = dto.lead_name.trim();
    const phone = dto.phone?.trim() || null;
    const details = dto.details?.trim() || null;

    const row = await this.insertTask({
      client_id: clientId,
      lead_id: dto.lead_id,
      pipeline_id: dto.pipeline_id,
      title: defaultTaskTitle(dto.task_type, leadName),
      lead_name: leadName,
      phone,
      task_type: dto.task_type,
      details,
      status: 'pending',
      due_at: dto.due_at,
    });

    return mapTask(row);
  }

  /**
   * Création interne (rappel lead / auto-appel nouveau lead).
   * client_id fourni par l’appelant (déjà JWT-scoped).
   */
  async createFromLead(input: CreateTaskFromLeadInput) {
    const leadName = input.leadName.trim();
    const row = await this.insertTask({
      client_id: input.clientId,
      lead_id: input.leadId,
      pipeline_id: input.pipelineId,
      title: defaultTaskTitle(input.taskType, leadName),
      lead_name: leadName || null,
      phone: input.phone,
      task_type: input.taskType,
      details: input.details?.trim() || null,
      status: 'pending',
      due_at: input.dueAt,
    });
    return mapTask(row);
  }

  /** Side-effect — ne casse pas create lead / reminder si l’insert échoue. */
  async tryCreateFromLead(input: CreateTaskFromLeadInput): Promise<void> {
    try {
      await this.createFromLead(input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `auto-task lead=${input.leadId} type=${input.taskType}: ${msg}`,
      );
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateTaskStatusDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_TASKS_TABLE)
      .update({ status: dto.status })
      .eq('id', id)
      .eq('client_id', clientId)
      .select(TASK_SELECT)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Tâche introuvable.' });
    }

    return mapTask(data as TaskRow);
  }

  /**
   * remindTask: replanifie due_at à maintenant (bump / “rappeler”).
   * tasks-api.ts absent de ce repo — comportement documenté pour le front.
   */
  async remind(id: string, user: PortalClientUser) {
    const clientId = this.clientId(user);
    const dueAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .getClient()
      .from(PORTAL_TASKS_TABLE)
      .update({
        due_at: dueAt,
        status: 'pending',
      })
      .eq('id', id)
      .eq('client_id', clientId)
      .select(TASK_SELECT)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Tâche introuvable.' });
    }

    return mapTask(data as TaskRow);
  }
}
