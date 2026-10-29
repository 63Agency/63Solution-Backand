import { ConflictException, Injectable } from '@nestjs/common';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { PORTAL_LEAD_STAGES } from '../portal-leads/portal-lead.stages';
import { SupabaseService } from '../supabase/supabase.service';
import type { ActivityFeedQueryDto } from './dto/stats-query.dto';
import type { StatsScopeQueryDto } from './dto/stats-query.dto';
import type { SuiviStatsQueryDto } from './dto/stats-query.dto';

type ActivityRow = {
  id: string;
  lead_id: string;
  kind: string;
  actor: string | null;
  message: string;
  detail: string | null;
  created_at: string;
};

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

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pipelineClause(
  pipelineId: string | undefined,
  params: unknown[],
  alias: string,
): string {
  const raw = pipelineId?.trim();
  if (!raw || raw === 'all') return '';
  params.push(raw);
  return ` AND ${alias}.pipeline_id = $${params.length}`;
}

@Injectable()
export class PortalStatsService {
  constructor(private readonly supabase: SupabaseService) {}

  private clientId(user: PortalClientUser): string {
    return user.clientId;
  }

  async overview(user: PortalClientUser, query: StatsScopeQueryDto) {
    const clientId = this.clientId(user);
    const params: unknown[] = [clientId];
    const leadPipe = pipelineClause(query.pipeline_id, params, 'l');
    const taskPipe = pipelineClause(query.pipeline_id, params, 't');

    const sql = `
      WITH lead_agg AS (
        SELECT
          COUNT(*)::int AS total_leads,
          COUNT(*) FILTER (WHERE l.created_at >= date_trunc('week', now()))::int AS new_this_week,
          COALESCE(SUM(l.estimated_value), 0)::float8 AS total_estimated_value,
          COALESCE(SUM(l.estimated_value) FILTER (WHERE l.stage = 'gagne'), 0)::float8 AS won_value,
          COUNT(*) FILTER (WHERE l.stage = 'nouveau')::int AS stage_nouveau,
          COUNT(*) FILTER (WHERE l.stage = 'contacte')::int AS stage_contacte,
          COUNT(*) FILTER (WHERE l.stage = 'sans_reponse')::int AS stage_sans_reponse,
          COUNT(*) FILTER (WHERE l.stage = 'qualifie')::int AS stage_qualifie,
          COUNT(*) FILTER (WHERE l.stage = 'rdv_fixe')::int AS stage_rdv_fixe,
          COUNT(*) FILTER (WHERE l.stage = 'proposition_envoyee')::int AS stage_proposition_envoyee,
          COUNT(*) FILTER (WHERE l.stage = 'gagne')::int AS stage_gagne,
          COUNT(*) FILTER (WHERE l.stage = 'perdu')::int AS stage_perdu
        FROM portal.leads l
        WHERE l.client_id = $1${leadPipe}
      ),
      task_agg AS (
        SELECT
          COUNT(*) FILTER (WHERE t.status = 'pending')::int AS pending_tasks,
          COUNT(*) FILTER (
            WHERE t.status = 'pending' AND t.due_at < now()
          )::int AS overdue_tasks
        FROM portal.tasks t
        WHERE t.client_id = $1${taskPipe}
      )
      SELECT * FROM lead_agg, task_agg
    `;

    const { rows, error } = await this.supabase.query<{
      total_leads: number;
      new_this_week: number;
      total_estimated_value: number;
      won_value: number;
      stage_nouveau: number;
      stage_contacte: number;
      stage_sans_reponse: number;
      stage_qualifie: number;
      stage_rdv_fixe: number;
      stage_proposition_envoyee: number;
      stage_gagne: number;
      stage_perdu: number;
      pending_tasks: number;
      overdue_tasks: number;
    }>(sql, params);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const r = rows[0];
    const by_stage: Record<string, number> = {};
    for (const stage of PORTAL_LEAD_STAGES) {
      by_stage[stage] = 0;
    }
    if (r) {
      by_stage.nouveau = num(r.stage_nouveau);
      by_stage.contacte = num(r.stage_contacte);
      by_stage.sans_reponse = num(r.stage_sans_reponse);
      by_stage.qualifie = num(r.stage_qualifie);
      by_stage.rdv_fixe = num(r.stage_rdv_fixe);
      by_stage.proposition_envoyee = num(r.stage_proposition_envoyee);
      by_stage.gagne = num(r.stage_gagne);
      by_stage.perdu = num(r.stage_perdu);
    }

    return {
      total_leads: num(r?.total_leads),
      by_stage,
      new_this_week: num(r?.new_this_week),
      pending_tasks: num(r?.pending_tasks),
      overdue_tasks: num(r?.overdue_tasks),
      total_estimated_value: num(r?.total_estimated_value),
      won_value: num(r?.won_value),
    };
  }

  async suivi(user: PortalClientUser, query: SuiviStatsQueryDto) {
    const clientId = this.clientId(user);
    const thresholdMinutes = query.threshold_minutes ?? 30;
    const params: unknown[] = [clientId, thresholdMinutes];
    const leadPipe = pipelineClause(query.pipeline_id, params, 'l');
    const taskPipe = pipelineClause(query.pipeline_id, params, 't');

    const sql = `
      WITH lead_kpis AS (
        SELECT
          COUNT(*) FILTER (WHERE l.stage = 'nouveau')::int AS waiting_leads,
          COUNT(*) FILTER (
            WHERE l.stage = 'nouveau'
              AND l.created_at <= now() - make_interval(mins => $2::int)
          )::int AS contact_overdue
        FROM portal.leads l
        WHERE l.client_id = $1${leadPipe}
      ),
      first_contact AS (
        SELECT COALESCE(ROUND(AVG(mins)), 0)::int AS first_contact_avg_minutes
        FROM (
          SELECT EXTRACT(EPOCH FROM (
            COALESCE(
              (
                SELECT MIN(a.created_at)
                FROM portal.lead_activity a
                WHERE a.client_id = l.client_id
                  AND a.lead_id = l.id
                  AND a.kind = 'stage_change'
              ),
              now()
            ) - l.created_at
          )) / 60.0 AS mins
          FROM portal.leads l
          WHERE l.client_id = $1
            AND l.stage <> 'nouveau'${leadPipe}
        ) s
        WHERE mins > 0
      ),
      task_kpis AS (
        SELECT COUNT(*)::int AS overdue_tasks
        FROM portal.tasks t
        WHERE t.client_id = $1
          AND t.status = 'pending'
          AND t.due_at < now()${taskPipe}
      ),
      reminder_kpis AS (
        SELECT COUNT(*)::int AS reminders_last_24h
        FROM portal.lead_activity a
        WHERE a.client_id = $1
          AND a.kind = 'reminder'
          AND a.created_at > now() - interval '24 hours'
      )
      SELECT
        lk.waiting_leads,
        lk.contact_overdue,
        fc.first_contact_avg_minutes,
        tk.overdue_tasks,
        rk.reminders_last_24h
      FROM lead_kpis lk, first_contact fc, task_kpis tk, reminder_kpis rk
    `;

    const { rows, error } = await this.supabase.query<{
      waiting_leads: number;
      contact_overdue: number;
      first_contact_avg_minutes: number;
      overdue_tasks: number;
      reminders_last_24h: number;
    }>(sql, params);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const r = rows[0];
    return {
      waiting_leads: num(r?.waiting_leads),
      contact_overdue: num(r?.contact_overdue),
      threshold_minutes: thresholdMinutes,
      first_contact_avg_minutes: num(r?.first_contact_avg_minutes),
      overdue_tasks: num(r?.overdue_tasks),
      reminders_last_24h: num(r?.reminders_last_24h),
    };
  }

  async performance(user: PortalClientUser, query: StatsScopeQueryDto) {
    const clientId = this.clientId(user);
    const params: unknown[] = [clientId];
    const leadPipe = pipelineClause(query.pipeline_id, params, 'l');
    const taskPipe = pipelineClause(query.pipeline_id, params, 't');

    const totalsSql = `
      WITH lead_t AS (
        SELECT
          COUNT(*)::int AS total_leads,
          COUNT(*) FILTER (WHERE l.stage = 'gagne')::int AS won,
          COUNT(*) FILTER (WHERE l.stage = 'perdu')::int AS lost,
          COUNT(*) FILTER (
            WHERE l.stage NOT IN ('gagne', 'perdu')
          )::int AS in_progress,
          COALESCE(
            SUM(l.estimated_value) FILTER (WHERE l.stage = 'gagne'),
            0
          )::float8 AS estimated_won_value
        FROM portal.leads l
        WHERE l.client_id = $1${leadPipe}
      ),
      task_t AS (
        SELECT
          COUNT(*) FILTER (WHERE t.status = 'pending')::int AS tasks_pending,
          COUNT(*) FILTER (WHERE t.status = 'done')::int AS tasks_done
        FROM portal.tasks t
        WHERE t.client_id = $1${taskPipe}
      )
      SELECT * FROM lead_t, task_t
    `;

    const byOwnerSql = `
      SELECT
        COALESCE(NULLIF(BTRIM(l.owner), ''), '') AS owner_key,
        COUNT(*)::int AS leads_assigned,
        COUNT(*) FILTER (
          WHERE l.stage NOT IN ('gagne', 'perdu')
        )::int AS in_progress,
        COUNT(*) FILTER (WHERE l.stage = 'gagne')::int AS won,
        COUNT(*) FILTER (WHERE l.stage = 'perdu')::int AS lost,
        COALESCE(
          SUM(l.estimated_value) FILTER (WHERE l.stage = 'gagne'),
          0
        )::float8 AS estimated_won_value
      FROM portal.leads l
      WHERE l.client_id = $1${leadPipe}
      GROUP BY 1
    `;

    const tasksByOwnerSql = `
      SELECT
        COALESCE(NULLIF(BTRIM(l.owner), ''), '') AS owner_key,
        COUNT(*) FILTER (WHERE t.status = 'pending')::int AS tasks_pending,
        COUNT(*) FILTER (WHERE t.status = 'done')::int AS tasks_done
      FROM portal.tasks t
      LEFT JOIN portal.leads l
        ON l.id = t.lead_id AND l.client_id = t.client_id
      WHERE t.client_id = $1${taskPipe}
      GROUP BY 1
    `;

    const teamSql = `
      SELECT c.id::text AS id, c.company_name AS name, c.email, 'owner'::text AS role
      FROM portal.clients c
      WHERE c.id = $1
      UNION ALL
      SELECT m.id::text, m.name, m.email, 'member'::text
      FROM portal.team_members m
      WHERE m.client_id = $1
      ORDER BY role DESC, name ASC
    `;

    const [totalsRes, byOwnerRes, tasksByOwnerRes, teamRes] = await Promise.all(
      [
        this.supabase.query<{
          total_leads: number;
          won: number;
          lost: number;
          in_progress: number;
          estimated_won_value: number;
          tasks_pending: number;
          tasks_done: number;
        }>(totalsSql, params),
        this.supabase.query<{
          owner_key: string;
          leads_assigned: number;
          in_progress: number;
          won: number;
          lost: number;
          estimated_won_value: number;
        }>(byOwnerSql, params),
        this.supabase.query<{
          owner_key: string;
          tasks_pending: number;
          tasks_done: number;
        }>(tasksByOwnerSql, params),
        this.supabase.query<{
          id: string;
          name: string;
          email: string;
          role: string;
        }>(teamSql, [clientId]),
      ],
    );

    for (const res of [totalsRes, byOwnerRes, tasksByOwnerRes, teamRes]) {
      if (res.error) {
        throw new ConflictException({ message: res.error.message });
      }
    }

    const t = totalsRes.rows[0];
    const won = num(t?.won);
    const lost = num(t?.lost);
    const closed = won + lost;

    const leadMap = new Map(
      byOwnerRes.rows.map((row) => [row.owner_key.trim(), row]),
    );
    const taskMap = new Map(
      tasksByOwnerRes.rows.map((row) => [row.owner_key.trim(), row]),
    );

    const assignedNames = new Set(
      teamRes.rows.map((m) => String(m.name ?? '').trim()).filter(Boolean),
    );

    const emptyLead = {
      leads_assigned: 0,
      in_progress: 0,
      won: 0,
      lost: 0,
      estimated_won_value: 0,
    };
    const emptyTask = { tasks_pending: 0, tasks_done: 0 };

    const score = (
      key: string,
      name: string,
      email: string | undefined,
      roleLabel: string,
      ownerKey: string,
    ) => {
      const leads = leadMap.get(ownerKey) ?? emptyLead;
      const tasks = taskMap.get(ownerKey) ?? emptyTask;
      const w = num(leads.won);
      const lo = num(leads.lost);
      const cl = w + lo;
      return {
        key,
        name,
        email,
        roleLabel,
        leadsAssigned: num(leads.leads_assigned),
        inProgress: num(leads.in_progress),
        won: w,
        lost: lo,
        conversionRate: cl === 0 ? 0 : Math.round((w / cl) * 100),
        estimatedWonValue: num(leads.estimated_won_value),
        tasksPending: num(tasks.tasks_pending),
        tasksDone: num(tasks.tasks_done),
      };
    };

    const team = teamRes.rows.map((m) => {
      const name = String(m.name ?? '').trim();
      return score(
        String(m.id),
        name,
        m.email ? String(m.email) : undefined,
        m.role === 'owner' ? 'Propriétaire' : 'Membre',
        name,
      );
    });

    // Non assigné : owner vide ou hors équipe (comme le front).
    let unassignedLeads = { ...emptyLead };
    let unassignedTasks = { ...emptyTask };
    for (const [ownerKey, row] of leadMap) {
      if (!ownerKey || !assignedNames.has(ownerKey)) {
        unassignedLeads = {
          leads_assigned:
            unassignedLeads.leads_assigned + num(row.leads_assigned),
          in_progress: unassignedLeads.in_progress + num(row.in_progress),
          won: unassignedLeads.won + num(row.won),
          lost: unassignedLeads.lost + num(row.lost),
          estimated_won_value:
            unassignedLeads.estimated_won_value + num(row.estimated_won_value),
        };
      }
    }
    for (const [ownerKey, row] of taskMap) {
      if (!ownerKey || !assignedNames.has(ownerKey)) {
        unassignedTasks = {
          tasks_pending:
            unassignedTasks.tasks_pending + num(row.tasks_pending),
          tasks_done: unassignedTasks.tasks_done + num(row.tasks_done),
        };
      }
    }

    if (
      unassignedLeads.leads_assigned > 0 ||
      unassignedTasks.tasks_pending > 0 ||
      unassignedTasks.tasks_done > 0
    ) {
      const w = num(unassignedLeads.won);
      const lo = num(unassignedLeads.lost);
      const cl = w + lo;
      team.push({
        key: 'unassigned',
        name: 'Non assigné',
        email: undefined,
        roleLabel: '—',
        leadsAssigned: num(unassignedLeads.leads_assigned),
        inProgress: num(unassignedLeads.in_progress),
        won: w,
        lost: lo,
        conversionRate: cl === 0 ? 0 : Math.round((w / cl) * 100),
        estimatedWonValue: num(unassignedLeads.estimated_won_value),
        tasksPending: num(unassignedTasks.tasks_pending),
        tasksDone: num(unassignedTasks.tasks_done),
      });
    }

    team.sort(
      (a, b) => b.won - a.won || b.leadsAssigned - a.leadsAssigned,
    );

    return {
      totals: {
        totalLeads: num(t?.total_leads),
        won,
        lost,
        inProgress: num(t?.in_progress),
        conversionRate: closed === 0 ? 0 : Math.round((won / closed) * 100),
        estimatedWonValue: num(t?.estimated_won_value),
        tasksPending: num(t?.tasks_pending),
        tasksDone: num(t?.tasks_done),
      },
      team,
    };
  }

  async listAllActivity(user: PortalClientUser, query: ActivityFeedQueryDto) {
    const clientId = this.clientId(user);
    const limit = Math.min(query.limit ?? 100, 500);

    const { rows, error } = await this.supabase.query<ActivityRow>(
      `
      SELECT id, lead_id, kind, actor, message, detail, created_at
      FROM portal.lead_activity
      WHERE client_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [clientId, limit],
    );

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return rows.map(mapActivity);
  }
}
