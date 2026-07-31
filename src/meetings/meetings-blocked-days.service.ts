import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import {
  assertCanAccessMeetings,
  assertFullAdmin,
} from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateBlockedDayDto } from './dto/blocked-day.dto';
import type { ListBlockedDaysQueryDto } from './dto/blocked-day.dto';
import {
  type BlockedDay,
  type BlockedDayRow,
  mapBlockedDay,
} from './types/blocked-day.types';
import { casablancaDateKeyFromIso } from './utils/meeting-datetime';

const BLOCKED_DAY_MESSAGE =
  'Ce jour est bloqué. Impossible de planifier un rendez-vous.';

const SELECT_COLS = 'id, date, reason, created_by, created_at';

@Injectable()
export class MeetingsBlockedDaysService {
  private readonly logger = new Logger(MeetingsBlockedDaysService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async list(
    query: ListBlockedDaysQueryDto,
    user: AppUser,
  ): Promise<{ items: BlockedDay[] }> {
    assertCanAccessMeetings(user);

    let q = this.supabase
      .getClient()
      .from('meeting_blocked_days')
      .select(SELECT_COLS)
      .order('date', { ascending: true });

    if (query.from) {
      q = q.gte('date', query.from);
    }
    if (query.to) {
      q = q.lte('date', query.to);
    }

    const { data, error } = await q;
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as BlockedDayRow[]).map(mapBlockedDay),
    };
  }

  async create(dto: CreateBlockedDayDto, user: AppUser): Promise<BlockedDay> {
    assertFullAdmin(user);

    const date = dto.date.trim();
    const reason = dto.reason?.trim() || null;
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_blocked_days')
      .insert({
        date,
        reason,
        created_by: user.id,
        created_at: now,
      })
      .select(SELECT_COLS)
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new ConflictException({
          message: 'Cette date est déjà bloquée.',
        });
      }
      throw new ConflictException({
        message: error.message ?? 'Impossible de bloquer ce jour.',
      });
    }

    if (!data) {
      throw new ConflictException({
        message: 'Impossible de bloquer ce jour.',
      });
    }

    this.logger.log(`Blocked day created date=${date} by=${user.id}`);
    return mapBlockedDay(data as BlockedDayRow);
  }

  async remove(id: string, user: AppUser): Promise<void> {
    assertFullAdmin(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_blocked_days')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Jour bloqué introuvable.' });
    }

    this.logger.log(`Blocked day removed id=${id} by=${user.id}`);
  }

  /** Reject if meetingDate (ISO) falls on a blocked Casablanca day. */
  async assertMeetingDateNotBlocked(meetingDateIso: string): Promise<void> {
    const dateKey = casablancaDateKeyFromIso(meetingDateIso);
    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_blocked_days')
      .select('id')
      .eq('date', dateKey)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (data?.id) {
      throw new ConflictException({ message: BLOCKED_DAY_MESSAGE });
    }
  }
}

export { BLOCKED_DAY_MESSAGE };
