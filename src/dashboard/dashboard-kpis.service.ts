import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { AppUser } from '../auth/types/app-user';
import { assertCanAccessWhatsapp } from '../common/utils/access';
import { CASABLANCA_TZ } from '../meetings/utils/meeting-datetime';
import { SupabaseService } from '../supabase/supabase.service';

export type DashboardKpisResponse = {
  from: string | null;
  to: string | null;
  newLeads: number;
  meetingsFixed: number;
  meetingsDone: number;
  meetingsDoublons: number;
  leadsClosedWon: number;
  leadsLost: number;
};

@Injectable()
export class DashboardKpisService {
  constructor(private readonly supabase: SupabaseService) {}

  /**
   * KPIs dashboard (admin + admin_whatsapp).
   * - newLeads : créations leads (created_at)
   * - meetingsFixed / meetingsDone / meetingsDoublons : meeting_date
   * - leadsClosedWon / leadsLost : statut actuel + updated_at (fermeture approx.)
   */
  async getKpis(
    user: AppUser,
    fromKey?: string,
    toKey?: string,
  ): Promise<DashboardKpisResponse> {
    assertCanAccessWhatsapp(user);

    const period = this.resolveOptionalCasaPeriod(fromKey, toKey, 366);
    const params: unknown[] = period
      ? [period.startIso, period.endIso]
      : [];

    // meeting_date / created_at / updated_at — même bornes UTC half-open si période.
    const meetingDateFilter = period
      ? `meeting_date >= $1::timestamptz AND meeting_date < $2::timestamptz`
      : 'TRUE';
    const leadCreatedFilter = period
      ? `created_at >= $1::timestamptz AND created_at < $2::timestamptz`
      : 'TRUE';
    const leadUpdatedFilter = period
      ? `updated_at >= $1::timestamptz AND updated_at < $2::timestamptz`
      : 'TRUE';

    /**
     * Clé client doublons :
     * 1) lead_id (uuid) si présent
     * 2) sinon phone normalisé 212… (normalize_ma_phone)
     * Meetings sans lead_id ni phone valide exclus.
     */
    const sql = `
      SELECT
        (
          SELECT COUNT(*)::int
          FROM public.clickup_leads
          WHERE ${leadCreatedFilter}
        ) AS new_leads,
        (
          SELECT COUNT(*)::int
          FROM public.meetings
          WHERE ${meetingDateFilter}
        ) AS meetings_fixed,
        (
          SELECT COUNT(*)::int
          FROM public.meetings
          WHERE status = 'done'
            AND ${meetingDateFilter}
        ) AS meetings_done,
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT client_key
            FROM (
              SELECT
                COALESCE(
                  NULLIF(lead_id::text, ''),
                  public.normalize_ma_phone(contact_phone)
                ) AS client_key
              FROM public.meetings
              WHERE ${meetingDateFilter}
            ) m
            WHERE m.client_key IS NOT NULL
            GROUP BY m.client_key
            HAVING COUNT(*) >= 2
          ) dup
        ) AS meetings_doublons,
        (
          SELECT COUNT(*)::int
          FROM public.clickup_leads
          WHERE LOWER(TRIM(status)) = 'closed - won'
            AND ${leadUpdatedFilter}
        ) AS leads_closed_won,
        (
          SELECT COUNT(*)::int
          FROM public.clickup_leads
          WHERE LOWER(TRIM(status)) = 'closed - lost'
            AND ${leadUpdatedFilter}
        ) AS leads_lost
    `;

    const { rows, error } = await this.supabase.query<{
      new_leads: number;
      meetings_fixed: number;
      meetings_done: number;
      meetings_doublons: number;
      leads_closed_won: number;
      leads_lost: number;
    }>(sql, params);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const row = rows[0];
    return {
      from: period?.from ?? null,
      to: period?.to ?? null,
      newLeads: Number(row?.new_leads) || 0,
      meetingsFixed: Number(row?.meetings_fixed) || 0,
      meetingsDone: Number(row?.meetings_done) || 0,
      meetingsDoublons: Number(row?.meetings_doublons) || 0,
      leadsClosedWon: Number(row?.leads_closed_won) || 0,
      leadsLost: Number(row?.leads_lost) || 0,
    };
  }

  private resolveOptionalCasaPeriod(
    fromKey: string | undefined,
    toKey: string | undefined,
    maxDays: number,
  ): {
    from: string;
    to: string;
    startIso: string;
    endIso: string;
  } | null {
    const hasFrom = fromKey != null && String(fromKey).trim() !== '';
    const hasTo = toKey != null && String(toKey).trim() !== '';
    if (!hasFrom && !hasTo) return null;
    if (hasFrom !== hasTo) {
      throw new BadRequestException({
        message: 'from et to doivent être fournis ensemble (YYYY-MM-DD).',
      });
    }

    const from = String(fromKey).trim().slice(0, 10);
    const to = String(toKey).trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException({
        message: 'from et to doivent être YYYY-MM-DD',
      });
    }
    if (from > to) {
      throw new BadRequestException({ message: 'from doit être ≤ to' });
    }

    const fromDt = DateTime.fromISO(from, { zone: CASABLANCA_TZ }).startOf(
      'day',
    );
    const toExclusive = DateTime.fromISO(to, { zone: CASABLANCA_TZ })
      .startOf('day')
      .plus({ days: 1 });
    if (!fromDt.isValid || !toExclusive.isValid) {
      throw new BadRequestException({ message: 'from/to invalides' });
    }

    const daySpan = Math.floor(toExclusive.diff(fromDt, 'days').days);
    if (daySpan > maxDays) {
      throw new BadRequestException({
        message: `Période max ${maxDays} jours (from…to inclus).`,
      });
    }

    return {
      from,
      to,
      startIso: fromDt.toUTC().toISO()!,
      endIso: toExclusive.toUTC().toISO()!,
    };
  }
}
