import {
  BadRequestException,
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
import { isFullAdmin } from '../common/utils/roles';
import { SupabaseService } from '../supabase/supabase.service';
import type {
  ListAvailabilitiesQueryDto,
  UpsertAvailabilityDto,
} from './dto/availability.dto';
import type {
  AvailabilityDay,
  AvailabilityDayRow,
  AvailabilitySlot,
} from './types/availability.types';
import { mapAvailabilityDay } from './types/availability.types';
import { casablancaDateKeyFromIso } from './utils/meeting-datetime';
import {
  isIntervalContained,
  isValidIanaTimezone,
  localDateKeyFromUtc,
  localSlotToUtc,
  shiftDateKey,
} from './utils/availability-timezone';

const SELECT_COLS =
  'id, user_id, date, timezone, slots, created_at, updated_at';

const UNAVAILABLE_SUFFIX = ' est indisponible à cet horaire.';

@Injectable()
export class MeetingsAvailabilitiesService {
  private readonly logger = new Logger(MeetingsAvailabilitiesService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async listMine(
    query: ListAvailabilitiesQueryDto,
    user: AppUser,
  ): Promise<{ items: AvailabilityDay[] }> {
    // Gestion de ses propres dispos : admin only.
    assertFullAdmin(user);
    return this.listForUserId(user.id, query);
  }

  async listForAdmin(
    targetUserId: string,
    query: ListAvailabilitiesQueryDto,
    user: AppUser,
  ): Promise<{ items: AvailabilityDay[] }> {
    // Lecture pour le calendrier équipe : admin + admin_whatsapp + fixed_meeting.
    assertCanAccessMeetings(user);
    const tid = targetUserId.trim();
    if (!tid) {
      throw new BadRequestException({ message: 'userId requis' });
    }
    return this.listForUserId(tid, query);
  }

  async upsertMine(
    dto: UpsertAvailabilityDto,
    user: AppUser,
  ): Promise<AvailabilityDay> {
    assertFullAdmin(user);

    const date = dto.date.trim();
    const timezone = dto.timezone.trim();
    const slots = this.normalizeAndValidateSlots(dto.slots);

    if (!isValidIanaTimezone(timezone)) {
      throw new BadRequestException({
        message: 'timezone IANA invalide.',
      });
    }

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .getClient()
      .from('admin_availabilities')
      .upsert(
        {
          user_id: user.id,
          date,
          timezone,
          slots,
          updated_at: now,
        },
        { onConflict: 'user_id,date' },
      )
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Impossible d’enregistrer les disponibilités.',
      });
    }

    this.logger.log(`Availability upsert user=${user.id} date=${date}`);
    return mapAvailabilityDay(data as AvailabilityDayRow);
  }

  async removeMine(date: string, user: AppUser): Promise<void> {
    assertFullAdmin(user);

    const dateKey = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new BadRequestException({
        message: 'date doit être au format YYYY-MM-DD',
      });
    }

    const { data, error } = await this.supabase
      .getClient()
      .from('admin_availabilities')
      .delete()
      .eq('user_id', user.id)
      .eq('date', dateKey)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({
        message: 'Disponibilités introuvables pour cette date.',
      });
    }

    this.logger.log(`Availability removed user=${user.id} date=${dateKey}`);
  }

  /**
   * Pour chaque admin assigné qui a des dispos ce jour-là,
   * [meetingStart, meetingStart+duration] doit être ⊂ d’un de ses slots (UTC).
   * Admin sans dispo ce jour → pas de blocage.
   */
  async assertAssigneesAvailable(
    meetingStartUtc: string | Date,
    durationMinutes: number,
    assignedUserIds: string[],
  ): Promise<void> {
    if (assignedUserIds.length === 0) return;

    const start =
      typeof meetingStartUtc === 'string'
        ? new Date(meetingStartUtc)
        : meetingStartUtc;
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException({ message: 'meetingDate invalide' });
    }
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const admins = await this.loadFullAdmins(assignedUserIds);
    if (admins.length === 0) return;

    const casaKey = casablancaDateKeyFromIso(start);
    const candidateDates = [
      shiftDateKey(casaKey, -1),
      casaKey,
      shiftDateKey(casaKey, 1),
    ];

    for (const admin of admins) {
      const rows = await this.loadRowsForUser(admin.id, candidateDates);
      const relevant = this.filterRelevantDays(rows, start, end);

      if (relevant.length === 0) {
        // Pas de dispos ce jour → toujours dispo.
        continue;
      }

      const ok = relevant.some((day) =>
        day.slots.some((slot) => {
          try {
            const slotStart = localSlotToUtc(day.date, slot.start, day.timezone);
            const slotEnd = localSlotToUtc(day.date, slot.end, day.timezone);
            return isIntervalContained(start, end, slotStart, slotEnd);
          } catch {
            return false;
          }
        }),
      );

      if (!ok) {
        const prenom = (admin.prenom || 'Administrateur').trim() || 'Administrateur';
        throw new ConflictException({
          message: `${prenom}${UNAVAILABLE_SUFFIX}`,
        });
      }
    }
  }

  private async listForUserId(
    userId: string,
    query: ListAvailabilitiesQueryDto,
  ): Promise<{ items: AvailabilityDay[] }> {
    let q = this.supabase
      .getClient()
      .from('admin_availabilities')
      .select(SELECT_COLS)
      .eq('user_id', userId)
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
      items: ((data ?? []) as AvailabilityDayRow[]).map(mapAvailabilityDay),
    };
  }

  private async loadRowsForUser(
    userId: string,
    dates: string[],
  ): Promise<AvailabilityDay[]> {
    if (dates.length === 0) return [];
    const { data, error } = await this.supabase
      .getClient()
      .from('admin_availabilities')
      .select(SELECT_COLS)
      .eq('user_id', userId)
      .in('date', dates);

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return ((data ?? []) as AvailabilityDayRow[]).map(mapAvailabilityDay);
  }

  private filterRelevantDays(
    days: AvailabilityDay[],
    meetingStart: Date,
    meetingEnd: Date,
  ): AvailabilityDay[] {
    return days.filter((day) => {
      if (!day.timezone || day.slots.length === 0) return false;
      try {
        const startKey = localDateKeyFromUtc(meetingStart, day.timezone);
        const endKey = localDateKeyFromUtc(meetingEnd, day.timezone);
        return day.date === startKey || day.date === endKey;
      } catch {
        return false;
      }
    });
  }

  private async loadFullAdmins(
    userIds: string[],
  ): Promise<Array<{ id: string; prenom: string; role: string }>> {
    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select('id, role, prenom')
      .in('id', userIds);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as Array<{ id: string; role: string; prenom: string | null }>)
      .filter((u) => isFullAdmin(u.role))
      .map((u) => ({
        id: String(u.id),
        prenom: (u.prenom ?? '').trim(),
        role: String(u.role ?? ''),
      }));
  }

  /** App validation: start < end, no overlap, HH:mm. */
  private normalizeAndValidateSlots(
    raw: Array<{ start: string; end: string }>,
  ): AvailabilitySlot[] {
    const slots: AvailabilitySlot[] = raw.map((s) => ({
      start: s.start.trim(),
      end: s.end.trim(),
    }));

    for (const slot of slots) {
      if (this.hhMmToMinutes(slot.start) >= this.hhMmToMinutes(slot.end)) {
        throw new BadRequestException({
          message:
            'Chaque créneau doit avoir start < end (pas de créneau à cheval sur minuit).',
        });
      }
    }

    const sorted = [...slots].sort(
      (a, b) => this.hhMmToMinutes(a.start) - this.hhMmToMinutes(b.start),
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;
      if (this.hhMmToMinutes(cur.start) < this.hhMmToMinutes(prev.end)) {
        throw new BadRequestException({
          message: 'Les créneaux ne doivent pas se chevaucher.',
        });
      }
    }

    return sorted;
  }

  private hhMmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
}
