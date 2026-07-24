import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { assertFullAdmin } from '../common/utils/access';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateMeetingDto } from './dto/create-meeting.dto';
import type { ListMeetingsQueryDto } from './dto/list-meetings-query.dto';
import type { UpdateMeetingDto } from './dto/update-meeting.dto';
import { GoogleMeetService } from './google-meet.service';
import { MeetingsReminderService } from './meetings-reminder.service';
import type { Meeting, MeetingRow, MeetingStatus } from './types/meeting.types';
import {
  casablancaDayBounds,
  casablancaWeekBounds,
  isMeetingWithinHours,
} from './utils/meeting-datetime';
import { normalizeMeetingPhone } from './utils/meeting-phone';

/** Only these statuses receive reminders / are treated as active. */
const ACTIVE_REMINDER_STATUSES: MeetingStatus[] = ['scheduled'];

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function mapMeetingRow(r: MeetingRow): Meeting {
  return {
    id: String(r.id),
    leadId: r.lead_id ? String(r.lead_id) : null,
    title: String(r.title ?? ''),
    meetingDate: String(r.meeting_date ?? ''),
    contactName: String(r.contact_name ?? ''),
    contactPhone: r.contact_phone ? String(r.contact_phone) : null,
    contactEmail: r.contact_email ? String(r.contact_email) : null,
    status: String(r.status ?? 'scheduled') as MeetingStatus,
    reminderWhatsappSent: Boolean(r.reminder_whatsapp_sent),
    reminderEmailSent: Boolean(r.reminder_email_sent),
    notes: r.notes != null ? String(r.notes) : null,
    meetLink: r.meet_link ? String(r.meet_link) : null,
    meetSpace: r.meet_space ? String(r.meet_space) : null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

const SELECT_COLS =
  'id, lead_id, title, meeting_date, contact_name, contact_phone, contact_email, status, reminder_whatsapp_sent, reminder_email_sent, notes, meet_link, meet_space, created_at, updated_at';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly googleMeet: GoogleMeetService,
    @Inject(forwardRef(() => MeetingsReminderService))
    private readonly reminders: MeetingsReminderService,
  ) {}

  async list(query: ListMeetingsQueryDto, user: AppUser) {
    assertFullAdmin(user);
    const sb = this.supabase.getClient();
    let q = sb.from('meetings').select(SELECT_COLS);

    if (query.from) {
      q = q.gte('meeting_date', query.from);
    }
    if (query.to) {
      q = q.lte('meeting_date', query.to);
    }
    if (query.status) {
      q = q.eq('status', query.status);
    }

    const { data, error } = await q.order('meeting_date', { ascending: true });
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as MeetingRow[]).map(mapMeetingRow),
    };
  }

  async upcoming(user: AppUser) {
    assertFullAdmin(user);
    const now = new Date();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .select(SELECT_COLS)
      .eq('status', 'scheduled')
      .gte('meeting_date', now.toISOString())
      .lte('meeting_date', to.toISOString())
      .order('meeting_date', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as MeetingRow[]).map(mapMeetingRow),
    };
  }

  async today(user: AppUser) {
    assertFullAdmin(user);
    const { startIso, endIso } = casablancaDayBounds();

    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .select(SELECT_COLS)
      .gte('meeting_date', startIso)
      .lt('meeting_date', endIso)
      .order('meeting_date', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: ((data ?? []) as MeetingRow[]).map(mapMeetingRow),
    };
  }

  async stats(user: AppUser) {
    assertFullAdmin(user);
    const sb = this.supabase.getClient();
    const { startIso: todayStart, endIso: todayEnd } = casablancaDayBounds();
    const { startIso: weekStart, endIso: weekEnd } = casablancaWeekBounds();

    const [todayRes, weekRes, pendingRes, noShowRes] = await Promise.all([
      sb
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .gte('meeting_date', todayStart)
        .lt('meeting_date', todayEnd),
      sb
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .gte('meeting_date', weekStart)
        .lt('meeting_date', weekEnd),
      sb
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled'),
      sb
        .from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'no_show'),
    ]);

    for (const res of [todayRes, weekRes, pendingRes, noShowRes]) {
      if (res.error) {
        throw new ConflictException({ message: res.error.message });
      }
    }

    return {
      today: todayRes.count ?? 0,
      thisWeek: weekRes.count ?? 0,
      pending: pendingRes.count ?? 0,
      noShow: noShowRes.count ?? 0,
    };
  }

  async create(dto: CreateMeetingDto, user: AppUser) {
    assertFullAdmin(user);

    const title = clean(dto.title);
    const contactName = clean(dto.contactName);
    const meetingDate = clean(dto.meetingDate);
    const contactPhone = normalizeMeetingPhone(dto.contactPhone);
    const contactEmail = clean(dto.contactEmail).toLowerCase() || null;
    const notes = clean(dto.notes) || null;
    const leadId = dto.leadId?.trim() || null;
    const status = (dto.status?.trim() || 'scheduled') as MeetingStatus;

    if (!title) {
      throw new BadRequestException({ message: 'title requis' });
    }
    if (!contactName) {
      throw new BadRequestException({ message: 'contactName requis' });
    }
    if (!meetingDate || Number.isNaN(Date.parse(meetingDate))) {
      throw new BadRequestException({ message: 'meetingDate requis' });
    }
    if (!contactPhone && !contactEmail) {
      throw new BadRequestException({
        message: 'Au moins un contact (téléphone ou email) est requis.',
      });
    }

    const meet = await this.googleMeet.createSpace();
    const meetingDateIso = new Date(meetingDate).toISOString();

    const now = new Date().toISOString();
    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .insert({
        lead_id: leadId,
        title,
        meeting_date: meetingDateIso,
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        status,
        notes,
        meet_link: meet?.meetLink ?? null,
        meet_space: meet?.spaceName ?? null,
        reminder_whatsapp_sent: false,
        reminder_email_sent: false,
        created_at: now,
        updated_at: now,
      })
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Création du rendez-vous impossible',
      });
    }

    let meeting = mapMeetingRow(data as MeetingRow);

    // Meeting < 24h away: cron window will never catch it → remind now.
    if (
      ACTIVE_REMINDER_STATUSES.includes(meeting.status) &&
      isMeetingWithinHours(meeting.meetingDate, 24)
    ) {
      this.logger.log(
        `Meeting id=${meeting.id} within 24h — sending reminder immediately`,
      );
      try {
        await this.reminders.sendReminderForMeetingId(meeting.id, {
          force: false,
        });
        meeting = await this.findById(meeting.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Immediate reminder failed id=${meeting.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Meeting created id=${meeting.id} meet=${meet?.meetLink ? 'yes' : 'no'}`,
    );
    return meeting;
  }

  async regenerateMeetLink(id: string, user: AppUser) {
    assertFullAdmin(user);
    await this.findRowOrThrow(id);

    const meet = await this.googleMeet.createSpace();
    if (!meet) {
      throw new ConflictException({
        message: 'Impossible de générer un lien Google Meet.',
      });
    }

    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .update({
        meet_link: meet.meetLink,
        meet_space: meet.spaceName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Mise à jour du lien Meet impossible',
      });
    }

    this.logger.log(`Meeting meet link regenerated id=${id}`);
    return mapMeetingRow(data as MeetingRow);
  }

  /** Generate Meet links for all future meetings missing meet_link. */
  async backfillMeetLinks(user: AppUser) {
    assertFullAdmin(user);
    const nowIso = new Date().toISOString();
    const sb = this.supabase.getClient();

    const { data, error } = await sb
      .from('meetings')
      .select(SELECT_COLS)
      .gte('meeting_date', nowIso)
      .is('meet_link', null)
      .order('meeting_date', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const rows = (data ?? []) as MeetingRow[];
    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const meet = await this.googleMeet.createSpace();
        if (!meet) {
          failed += 1;
          continue;
        }

        const { error: updErr } = await sb
          .from('meetings')
          .update({
            meet_link: meet.meetLink,
            meet_space: meet.spaceName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id);

        if (updErr) {
          failed += 1;
          this.logger.warn(
            `backfillMeetLinks update failed id=${row.id}: ${updErr.message}`,
          );
          continue;
        }
        updated += 1;
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`backfillMeetLinks failed id=${row.id}: ${message}`);
      }
    }

    this.logger.log(
      `[MeetBackfill] found=${rows.length} updated=${updated} failed=${failed}`,
    );
    return { found: rows.length, updated, failed };
  }

  async update(id: string, dto: UpdateMeetingDto, user: AppUser) {
    assertFullAdmin(user);
    const existing = await this.findRowOrThrow(id);

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.title !== undefined) {
      const title = clean(dto.title);
      if (!title) {
        throw new BadRequestException({ message: 'title requis' });
      }
      patch.title = title;
    }

    if (dto.meetingDate !== undefined) {
      if (!dto.meetingDate || Number.isNaN(Date.parse(dto.meetingDate))) {
        throw new BadRequestException({ message: 'meetingDate invalide' });
      }
      const nextIso = new Date(dto.meetingDate).toISOString();
      patch.meeting_date = nextIso;

      // Reschedule → allow a fresh reminder for the new slot.
      if (nextIso !== existing.meeting_date) {
        patch.reminder_whatsapp_sent = false;
        patch.reminder_email_sent = false;
      }
    }

    if (dto.contactName !== undefined) {
      const contactName = clean(dto.contactName);
      if (!contactName) {
        throw new BadRequestException({ message: 'contactName requis' });
      }
      patch.contact_name = contactName;
    }

    if (dto.contactPhone !== undefined) {
      patch.contact_phone =
        dto.contactPhone === null || dto.contactPhone === ''
          ? null
          : normalizeMeetingPhone(dto.contactPhone);
    }

    if (dto.contactEmail !== undefined) {
      patch.contact_email =
        dto.contactEmail === null || dto.contactEmail === ''
          ? null
          : clean(dto.contactEmail).toLowerCase() || null;
    }

    if (dto.leadId !== undefined) {
      patch.lead_id = dto.leadId || null;
    }

    if (dto.status !== undefined) {
      patch.status = dto.status;
    }

    if (dto.notes !== undefined) {
      patch.notes =
        dto.notes === null ? null : clean(dto.notes) || null;
    }

    const nextPhone =
      patch.contact_phone !== undefined
        ? (patch.contact_phone as string | null)
        : existing.contact_phone;
    const nextEmail =
      patch.contact_email !== undefined
        ? (patch.contact_email as string | null)
        : existing.contact_email;

    if (!nextPhone && !nextEmail) {
      throw new BadRequestException({
        message: 'Au moins un contact (téléphone ou email) est requis.',
      });
    }

    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .update(patch)
      .eq('id', id)
      .select(SELECT_COLS)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Mise à jour impossible',
      });
    }

    let meeting = mapMeetingRow(data as MeetingRow);

    // If rescheduled within 24h, remind immediately (same gap as create).
    if (
      patch.meeting_date !== undefined &&
      ACTIVE_REMINDER_STATUSES.includes(meeting.status) &&
      isMeetingWithinHours(meeting.meetingDate, 24)
    ) {
      this.logger.log(
        `Meeting id=${meeting.id} rescheduled within 24h — sending reminder immediately`,
      );
      try {
        await this.reminders.sendReminderForMeetingId(meeting.id, {
          force: false,
        });
        meeting = await this.findById(meeting.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Immediate reminder after reschedule failed id=${meeting.id}: ${message}`,
        );
      }
    }

    this.logger.log(`Meeting updated id=${id}`);
    return meeting;
  }

  async remove(id: string, user: AppUser) {
    assertFullAdmin(user);
    await this.findRowOrThrow(id);

    const sb = this.supabase.getClient();
    const { error } = await sb.from('meetings').delete().eq('id', id);
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    this.logger.log(`Meeting deleted id=${id}`);
    return { ok: true, id };
  }

  async findById(id: string): Promise<Meeting> {
    return mapMeetingRow(await this.findRowOrThrow(id));
  }

  async markReminderFlags(
    id: string,
    flags: { whatsapp?: boolean; email?: boolean },
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (flags.whatsapp === true) patch.reminder_whatsapp_sent = true;
    if (flags.email === true) patch.reminder_email_sent = true;

    const sb = this.supabase.getClient();
    const { error } = await sb.from('meetings').update(patch).eq('id', id);
    if (error) {
      throw new ConflictException({ message: error.message });
    }
  }

  async findDueForReminder(windowStart: Date, windowEnd: Date): Promise<Meeting[]> {
    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .select(SELECT_COLS)
      .in('status', ACTIVE_REMINDER_STATUSES)
      .gte('meeting_date', windowStart.toISOString())
      .lte('meeting_date', windowEnd.toISOString())
      .order('meeting_date', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return ((data ?? []) as MeetingRow[]).map(mapMeetingRow);
  }

  private async findRowOrThrow(id: string): Promise<MeetingRow> {
    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .select(SELECT_COLS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Rendez-vous introuvable.' });
    }
    return data as MeetingRow;
  }
}
