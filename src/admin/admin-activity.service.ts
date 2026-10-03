import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { assertFullAdmin } from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import type { ActivityFeedResponse, ActivityItem } from './types/activity.types';

@Injectable()
export class AdminActivityService {
  private readonly logger = new Logger(AdminActivityService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Feed activité récente (full admin).
   * 3 requêtes LIMIT séparées → merge/sort en mémoire → coupe à `limit`.
   */
  async listActivity(
    user: AppUser,
    limitRaw?: number,
  ): Promise<ActivityFeedResponse> {
    assertFullAdmin(user);
    const limit = Math.min(Math.max(limitRaw ?? 30, 1), 50);

    const [meetings, leads, broadcasts] = await Promise.all([
      this.fetchRecentMeetings(limit),
      this.fetchRecentLeads(limit),
      this.fetchRecentBroadcasts(limit),
    ]);

    const items = [...meetings, ...leads, ...broadcasts]
      .sort((a, b) => {
        const ta = Date.parse(a.at) || 0;
        const tb = Date.parse(b.at) || 0;
        return tb - ta;
      })
      .slice(0, limit);

    return { items };
  }

  private async fetchRecentMeetings(limit: number): Promise<ActivityItem[]> {
    const sql = `
      SELECT id, contact_name, title, created_at
      FROM public.meetings
      ORDER BY created_at DESC
      LIMIT $1::int
    `;
    const { rows, error } = await this.supabase.query<{
      id: string;
      contact_name: string | null;
      title: string | null;
      created_at: string;
    }>(sql, [limit]);

    if (error) {
      this.logger.warn(`activity meetings failed: ${error.message}`);
      throw new ConflictException({ message: error.message });
    }

    return rows.map((r) => {
      const contact = (r.contact_name ?? '').trim() || 'contact';
      return {
        type: 'meeting_created' as const,
        at: new Date(r.created_at).toISOString(),
        title: `Meeting avec ${contact}`,
        href: '/calendar',
        meta: {
          meetingId: String(r.id),
          meetingTitle: r.title ? String(r.title) : null,
          contactName: r.contact_name ? String(r.contact_name) : null,
        },
      };
    });
  }

  private async fetchRecentLeads(limit: number): Promise<ActivityItem[]> {
    const sql = `
      SELECT id, name, status, list_id, updated_at
      FROM public.clickup_leads
      ORDER BY updated_at DESC
      LIMIT $1::int
    `;
    const { rows, error } = await this.supabase.query<{
      id: string;
      name: string | null;
      status: string | null;
      list_id: string | null;
      updated_at: string;
    }>(sql, [limit]);

    if (error) {
      this.logger.warn(`activity leads failed: ${error.message}`);
      throw new ConflictException({ message: error.message });
    }

    return rows.map((r) => {
      const name = (r.name ?? '').trim() || 'sans nom';
      return {
        type: 'lead_upserted' as const,
        at: new Date(r.updated_at).toISOString(),
        title: `Lead ${name}`,
        href: '/leads',
        meta: {
          leadId: String(r.id),
          status: r.status ? String(r.status) : null,
          listId: r.list_id ? String(r.list_id) : null,
        },
      };
    });
  }

  private async fetchRecentBroadcasts(limit: number): Promise<ActivityItem[]> {
    const sql = `
      SELECT id, status, total, created_at, finished_at
      FROM public.whatsapp_broadcast_jobs
      ORDER BY created_at DESC
      LIMIT $1::int
    `;
    const { rows, error } = await this.supabase.query<{
      id: string;
      status: string | null;
      total: number | null;
      created_at: string;
      finished_at: string | null;
    }>(sql, [limit]);

    if (error) {
      this.logger.warn(`activity broadcasts failed: ${error.message}`);
      throw new ConflictException({ message: error.message });
    }

    return rows.map((r) => {
      const total = Number(r.total) || 0;
      return {
        type: 'broadcast_job' as const,
        at: new Date(r.created_at).toISOString(),
        title: `Broadcast (${total})`,
        href: '/whatsapp/broadcast',
        meta: {
          jobId: String(r.id),
          status: r.status ? String(r.status) : null,
          total,
          finishedAt: r.finished_at
            ? new Date(r.finished_at).toISOString()
            : null,
        },
      };
    });
  }
}
