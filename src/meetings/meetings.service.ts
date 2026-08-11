import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { assertCanAccessMeetings, assertFullAdmin } from '../common/utils/access';
import {
  canAssignMeetingUsers,
  isFixedMeeting,
  normalizeApiRole,
} from '../common/utils/roles';
import {
  USER_PUBLIC_COLUMNS,
  mapUserToTeamItem,
  type UserDbRow,
} from '../common/utils/user-response';
import { SupabaseService } from '../supabase/supabase.service';
import type { CreateMeetingDto } from './dto/create-meeting.dto';
import type { ListMeetingsQueryDto } from './dto/list-meetings-query.dto';
import type { MeetingMemberDto } from './dto/meeting-member.dto';
import type { UpdateMeetingDto } from './dto/update-meeting.dto';
import { GoogleMeetService } from './google-meet.service';
import { MeetingsBlockedDaysService } from './meetings-blocked-days.service';
import { MeetingsReminderService } from './meetings-reminder.service';
import type {
  Meeting,
  MeetingAssignee,
  MeetingAssigneeRow,
  MeetingMember,
  MeetingMemberRow,
  MeetingReminderRow,
  MeetingRemindersConfig,
  MeetingRow,
  MeetingStatus,
} from './types/meeting.types';
import {
  casablancaDayBounds,
  casablancaWeekBounds,
} from './utils/meeting-datetime';
import { normalizeMeetingPhone } from './utils/meeting-phone';
import {
  buildRemindersStatusFromJobs,
  emptyRemindersStatus,
  legacyFlagsFromStatus,
  normalizeRemindersConfig,
} from './utils/meeting-reminders';

const ACTIVE_REMINDER_STATUSES: MeetingStatus[] = ['scheduled'];

const MEMBER_SELECT = 'id, meeting_id, lead_id, name, phone, email, created_at';
const ASSIGNEE_SELECT = 'meeting_id, user_id, created_at';

type AssigneesBundle = {
  assignedUserIds: string[];
  assignees: MeetingAssignee[];
};

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function mapMember(row: MeetingMemberRow): MeetingMember {
  return {
    leadId: row.lead_id ? String(row.lead_id) : null,
    name: String(row.name ?? ''),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
  };
}

function mapMeetingBase(
  r: MeetingRow,
  jobs: MeetingReminderRow[] = [],
  members: MeetingMember[] = [],
  assignees: AssigneesBundle = { assignedUserIds: [], assignees: [] },
): Meeting {
  const reminders = normalizeRemindersConfig(
    (r.reminders as MeetingRemindersConfig | null) ?? undefined,
  );
  const remindersStatus =
    jobs.length > 0
      ? buildRemindersStatusFromJobs(jobs, reminders)
      : emptyRemindersStatus();
  const legacy = legacyFlagsFromStatus(remindersStatus);

  return {
    id: String(r.id),
    leadId: r.lead_id ? String(r.lead_id) : null,
    title: String(r.title ?? ''),
    meetingDate: String(r.meeting_date ?? ''),
    contactName: String(r.contact_name ?? ''),
    contactPhone: r.contact_phone ? String(r.contact_phone) : null,
    contactEmail: r.contact_email ? String(r.contact_email) : null,
    members,
    assignedUserIds: assignees.assignedUserIds,
    assignees: assignees.assignees,
    createdBy: r.created_by ? String(r.created_by) : null,
    status: String(r.status ?? 'scheduled') as MeetingStatus,
    reminderWhatsappSent:
      legacy.reminderWhatsappSent || Boolean(r.reminder_whatsapp_sent),
    reminderEmailSent:
      legacy.reminderEmailSent || Boolean(r.reminder_email_sent),
    reminders,
    remindersStatus,
    manualReminderSentAt: r.manual_reminder_sent_at
      ? String(r.manual_reminder_sent_at)
      : null,
    manualReminderWhatsappSent: Boolean(r.manual_reminder_whatsapp_sent),
    manualReminderEmailSent: Boolean(r.manual_reminder_email_sent),
    notes: r.notes != null ? String(r.notes) : null,
    meetLink: r.meet_link ? String(r.meet_link) : null,
    meetSpace: r.meet_space ? String(r.meet_space) : null,
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

const SELECT_COLS =
  'id, lead_id, title, meeting_date, contact_name, contact_phone, contact_email, status, reminder_whatsapp_sent, reminder_email_sent, reminders, manual_reminder_sent_at, manual_reminder_whatsapp_sent, manual_reminder_email_sent, notes, meet_link, meet_space, created_by, created_at, updated_at';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly googleMeet: GoogleMeetService,
    @Inject(forwardRef(() => MeetingsReminderService))
    private readonly reminderJobs: MeetingsReminderService,
    private readonly blockedDays: MeetingsBlockedDaysService,
  ) {}

  private async enrich(row: MeetingRow): Promise<Meeting> {
    const [jobs, members, assignees] = await Promise.all([
      this.reminderJobs.listJobsForMeeting(row.id),
      this.loadMembersForMeeting(row.id),
      this.loadAssigneesForMeeting(row.id),
    ]);
    return mapMeetingBase(row, jobs, members, assignees);
  }

  private async enrichMany(rows: MeetingRow[]): Promise<Meeting[]> {
    const ids = rows.map((r) => r.id);
    const [jobsMap, membersMap, assigneesMap] = await Promise.all([
      this.reminderJobs.listJobsForMeetings(ids),
      this.loadMembersForMeetings(ids),
      this.loadAssigneesForMeetings(ids),
    ]);
    return rows.map((r) =>
      mapMeetingBase(
        r,
        jobsMap.get(r.id) ?? [],
        membersMap.get(r.id) ?? [],
        assigneesMap.get(r.id) ?? { assignedUserIds: [], assignees: [] },
      ),
    );
  }

  private async loadMembersForMeeting(
    meetingId: string,
  ): Promise<MeetingMember[]> {
    const map = await this.loadMembersForMeetings([meetingId]);
    return map.get(meetingId) ?? [];
  }

  private async loadMembersForMeetings(
    meetingIds: string[],
  ): Promise<Map<string, MeetingMember[]>> {
    const map = new Map<string, MeetingMember[]>();
    for (const id of meetingIds) map.set(id, []);
    if (meetingIds.length === 0) return map;

    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_members')
      .select(MEMBER_SELECT)
      .in('meeting_id', meetingIds)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.warn(`loadMembersForMeetings failed: ${error.message}`);
      return map;
    }

    for (const row of (data ?? []) as MeetingMemberRow[]) {
      const mid = String(row.meeting_id);
      const list = map.get(mid) ?? [];
      list.push(mapMember(row));
      map.set(mid, list);
    }
    return map;
  }

  private async loadAssigneesForMeeting(
    meetingId: string,
  ): Promise<AssigneesBundle> {
    const map = await this.loadAssigneesForMeetings([meetingId]);
    return map.get(meetingId) ?? { assignedUserIds: [], assignees: [] };
  }

  private async loadAssigneesForMeetings(
    meetingIds: string[],
  ): Promise<Map<string, AssigneesBundle>> {
    const map = new Map<string, AssigneesBundle>();
    for (const id of meetingIds) {
      map.set(id, { assignedUserIds: [], assignees: [] });
    }
    if (meetingIds.length === 0) return map;

    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_assignees')
      .select(ASSIGNEE_SELECT)
      .in('meeting_id', meetingIds)
      .order('created_at', { ascending: true });

    if (error) {
      this.logger.warn(`loadAssigneesForMeetings failed: ${error.message}`);
      return map;
    }

    const rows = (data ?? []) as MeetingAssigneeRow[];
    const userIds = [...new Set(rows.map((r) => String(r.user_id)))];
    const usersById = await this.loadUsersByIds(userIds);

    for (const row of rows) {
      const mid = String(row.meeting_id);
      const uid = String(row.user_id);
      const bundle = map.get(mid) ?? {
        assignedUserIds: [],
        assignees: [],
      };
      bundle.assignedUserIds.push(uid);
      const u = usersById.get(uid);
      if (u) {
        bundle.assignees.push({
          userId: uid,
          prenom: u.prenom,
          nom: u.nom,
          email: u.email,
          role: u.role,
        });
      } else {
        bundle.assignees.push({
          userId: uid,
          prenom: '',
          nom: '',
          email: '',
          role: '',
        });
      }
      map.set(mid, bundle);
    }
    return map;
  }

  private async loadUsersByIds(
    userIds: string[],
  ): Promise<Map<string, MeetingAssignee>> {
    const map = new Map<string, MeetingAssignee>();
    if (userIds.length === 0) return map;

    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .in('id', userIds);

    if (error) {
      this.logger.warn(`loadUsersByIds failed: ${error.message}`);
      return map;
    }

    for (const row of (data ?? []) as UserDbRow[]) {
      map.set(String(row.id), {
        userId: String(row.id),
        prenom: row.prenom?.trim() ?? '',
        nom: row.nom?.trim() ?? '',
        email: row.email,
        role: normalizeApiRole(row.role),
      });
    }
    return map;
  }

  /** Normalize + validate members; each needs phone and/or email. */
  private normalizeMembersInput(
    raw: MeetingMemberDto[] | undefined,
  ): MeetingMember[] {
    if (!raw || raw.length === 0) return [];

    const members: MeetingMember[] = [];
    for (const item of raw) {
      const name = clean(item.name);
      if (!name) {
        throw new BadRequestException({
          message: 'members[].name requis',
        });
      }
      const phone = normalizeMeetingPhone(item.phone);
      const email = clean(item.email).toLowerCase() || null;
      if (!phone && !email) {
        throw new BadRequestException({
          message: `Membre « ${name} » : téléphone ou email requis.`,
        });
      }
      members.push({
        leadId: item.leadId?.trim() || null,
        name,
        phone,
        email,
      });
    }
    return members;
  }

  /**
   * Resolve staff assignees. Creator always included.
   * fixed_meeting → [creatorId] only.
   */
  private resolveAssignedUserIds(
    raw: string[] | undefined,
    creatorId: string,
    actor: AppUser,
  ): string[] {
    if (!canAssignMeetingUsers(actor.role)) {
      return [creatorId];
    }
    const set = new Set<string>();
    for (const id of raw ?? []) {
      const t = String(id ?? '').trim();
      if (t) set.add(t);
    }
    set.add(creatorId);
    return [...set];
  }

  private async assertUsersExist(userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select('id')
      .in('id', userIds);

    if (error) {
      throw new ConflictException({
        message: error.message ?? 'Vérification des assignees impossible',
      });
    }
    const found = new Set((data ?? []).map((r) => String(r.id)));
    const missing = userIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        message: `assignedUserIds inconnu : ${missing.join(', ')}`,
      });
    }
  }

  /** Replace the full members list for a meeting (delete + insert). */
  private async replaceMembers(
    meetingId: string,
    members: MeetingMember[],
  ): Promise<MeetingMember[]> {
    const sb = this.supabase.getClient();

    const { error: delError } = await sb
      .from('meeting_members')
      .delete()
      .eq('meeting_id', meetingId);

    if (delError) {
      throw new ConflictException({
        message: delError.message ?? 'Suppression des membres impossible',
      });
    }

    if (members.length === 0) return [];

    const rows = members.map((m) => ({
      meeting_id: meetingId,
      lead_id: m.leadId,
      name: m.name,
      phone: m.phone,
      email: m.email,
    }));

    const { data, error } = await sb
      .from('meeting_members')
      .insert(rows)
      .select(MEMBER_SELECT);

    if (error) {
      throw new ConflictException({
        message: error.message ?? 'Enregistrement des membres impossible',
      });
    }

    return ((data ?? []) as MeetingMemberRow[]).map(mapMember);
  }

  /** Replace staff assignees (delete + insert). Not used for client reminders. */
  private async replaceAssignees(
    meetingId: string,
    userIds: string[],
  ): Promise<AssigneesBundle> {
    const sb = this.supabase.getClient();

    const { error: delError } = await sb
      .from('meeting_assignees')
      .delete()
      .eq('meeting_id', meetingId);

    if (delError) {
      throw new ConflictException({
        message: delError.message ?? 'Suppression des assignees impossible',
      });
    }

    if (userIds.length === 0) {
      return { assignedUserIds: [], assignees: [] };
    }

    const rows = userIds.map((user_id) => ({
      meeting_id: meetingId,
      user_id,
    }));

    const { error } = await sb.from('meeting_assignees').insert(rows);

    if (error) {
      throw new ConflictException({
        message: error.message ?? 'Enregistrement des assignees impossible',
      });
    }

    return this.loadAssigneesForMeeting(meetingId);
  }

  /**
   * Visibilité calendrier :
   * - admin + admin_whatsapp → tous les RDV (y compris legacy sans assignees)
   * - fixed_meeting → uniquement si userId ∈ assignedUserIds (legacy exclus)
   *
   * Les mentions servent surtout à ouvrir l’accès à fixed_meeting,
   * pas à cacher les RDV aux admins.
   */
  private async assignedMeetingIdsForUser(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_assignees')
      .select('meeting_id')
      .eq('user_id', userId);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return [...new Set((data ?? []).map((row) => String(row.meeting_id)))];
  }

  /** `null` = pas de filtre (admin / admin_whatsapp). Sinon liste d’ids. */
  private async visibilityMeetingIds(
    user: AppUser,
  ): Promise<string[] | null> {
    if (!isFixedMeeting(user.role)) return null;
    return this.assignedMeetingIdsForUser(user.id);
  }

  private async userCanViewMeeting(
    row: MeetingRow,
    user: AppUser,
  ): Promise<boolean> {
    if (!isFixedMeeting(user.role)) return true;

    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_assignees')
      .select('user_id')
      .eq('meeting_id', row.id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return !!data;
  }

  private async assertCanViewMeeting(
    meetingId: string,
    user: AppUser,
  ): Promise<MeetingRow> {
    const row = await this.findRowOrThrow(meetingId);
    if (!(await this.userCanViewMeeting(row, user))) {
      throw new NotFoundException({ message: 'Rendez-vous introuvable.' });
    }
    return row;
  }

  /** Picker équipe pour assignedUserIds (admin + admin_whatsapp + fixed_meeting). */
  async listAssignableUsers(user: AppUser) {
    assertCanAccessMeetings(user);

    const { data, error } = await this.supabase
      .getClient()
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ConflictException({
        message: error.message ?? 'Impossible de lister les utilisateurs.',
      });
    }

    return (data ?? []).map((row) => mapUserToTeamItem(row as UserDbRow));
  }

  async list(query: ListMeetingsQueryDto, user: AppUser) {
    assertCanAccessMeetings(user);
    const visibleIds = await this.visibilityMeetingIds(user);
    if (visibleIds && visibleIds.length === 0) {
      return { items: [] as Meeting[] };
    }

    const sb = this.supabase.getClient();
    let q = sb.from('meetings').select(SELECT_COLS);
    if (visibleIds) {
      q = q.in('id', visibleIds);
    }

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
      items: await this.enrichMany((data ?? []) as MeetingRow[]),
    };
  }

  async upcoming(user: AppUser) {
    assertCanAccessMeetings(user);
    const visibleIds = await this.visibilityMeetingIds(user);
    if (visibleIds && visibleIds.length === 0) {
      return { items: [] as Meeting[] };
    }

    const now = new Date();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const sb = this.supabase.getClient();
    let q = sb
      .from('meetings')
      .select(SELECT_COLS)
      .eq('status', 'scheduled')
      .gte('meeting_date', now.toISOString())
      .lte('meeting_date', to.toISOString());
    if (visibleIds) {
      q = q.in('id', visibleIds);
    }

    const { data, error } = await q.order('meeting_date', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: await this.enrichMany((data ?? []) as MeetingRow[]),
    };
  }

  async today(user: AppUser) {
    assertCanAccessMeetings(user);
    const visibleIds = await this.visibilityMeetingIds(user);
    if (visibleIds && visibleIds.length === 0) {
      return { items: [] as Meeting[] };
    }

    const { startIso, endIso } = casablancaDayBounds();

    const sb = this.supabase.getClient();
    let q = sb
      .from('meetings')
      .select(SELECT_COLS)
      .gte('meeting_date', startIso)
      .lt('meeting_date', endIso);
    if (visibleIds) {
      q = q.in('id', visibleIds);
    }

    const { data, error } = await q.order('meeting_date', { ascending: true });

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return {
      items: await this.enrichMany((data ?? []) as MeetingRow[]),
    };
  }

  async stats(user: AppUser) {
    assertCanAccessMeetings(user);
    const visibleIds = await this.visibilityMeetingIds(user);
    if (visibleIds && visibleIds.length === 0) {
      return { today: 0, thisWeek: 0, pending: 0, noShow: 0 };
    }

    const sb = this.supabase.getClient();
    const { startIso: todayStart, endIso: todayEnd } = casablancaDayBounds();
    const { startIso: weekStart, endIso: weekEnd } = casablancaWeekBounds();

    let todayQ = sb
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .gte('meeting_date', todayStart)
      .lt('meeting_date', todayEnd);
    let weekQ = sb
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .gte('meeting_date', weekStart)
      .lt('meeting_date', weekEnd);
    let pendingQ = sb
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled');
    let noShowQ = sb
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'no_show');

    if (visibleIds) {
      todayQ = todayQ.in('id', visibleIds);
      weekQ = weekQ.in('id', visibleIds);
      pendingQ = pendingQ.in('id', visibleIds);
      noShowQ = noShowQ.in('id', visibleIds);
    }

    const [todayRes, weekRes, pendingRes, noShowRes] = await Promise.all([
      todayQ,
      weekQ,
      pendingQ,
      noShowQ,
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
    assertCanAccessMeetings(user);

    const title = clean(dto.title);
    const contactName = clean(dto.contactName);
    const meetingDate = clean(dto.meetingDate);
    const contactPhone = normalizeMeetingPhone(dto.contactPhone);
    const contactEmail = clean(dto.contactEmail).toLowerCase() || null;
    const notes = clean(dto.notes) || null;
    const leadId = dto.leadId?.trim() || null;
    const status = (dto.status?.trim() || 'scheduled') as MeetingStatus;
    const reminders = normalizeRemindersConfig(dto.reminders);

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

    const assignedUserIds = this.resolveAssignedUserIds(
      dto.assignedUserIds,
      user.id,
      user,
    );
    await this.assertUsersExist(assignedUserIds);

    const meet = await this.googleMeet.createSpace();
    const meetingDateIso = new Date(meetingDate).toISOString();
    await this.blockedDays.assertMeetingDateNotBlocked(meetingDateIso);

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
        reminders,
        reminder_whatsapp_sent: false,
        reminder_email_sent: false,
        manual_reminder_sent_at: null,
        manual_reminder_whatsapp_sent: false,
        manual_reminder_email_sent: false,
        created_by: user.id,
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

    const meetingId = String((data as MeetingRow).id);
    const members = this.normalizeMembersInput(dto.members);
    const [savedMembers, savedAssignees] = await Promise.all([
      this.replaceMembers(meetingId, members),
      this.replaceAssignees(meetingId, assignedUserIds),
    ]);

    let meeting = mapMeetingBase(
      data as MeetingRow,
      [],
      savedMembers,
      savedAssignees,
    );

    // 1) Jobs auto 2d/24h/2h uniquement — aucun envoi immédiat ici.
    if (ACTIVE_REMINDER_STATUSES.includes(meeting.status)) {
      try {
        await this.reminderJobs.scheduleJobsForMeeting(meeting, reminders);
        meeting = await this.enrich(data as MeetingRow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Schedule reminders failed id=${meeting.id}: ${message}`,
        );
      }
    }

    this.logger.log(
      `Meeting created id=${meeting.id} meet=${meet?.meetLink ? 'yes' : 'no'} members=${savedMembers.length} assignees=${assignedUserIds.length} notifyOnCreate=${dto.notifyOnCreate === true}`,
    );

    // 2) Seul point d’envoi de la confirmation immédiate (WA + email).
    // Assignees (staff) ne reçoivent JAMAIS ces rappels — uniquement contact + members.
    let notificationSent:
      | {
          whatsapp: boolean;
          email: boolean;
          whatsappError?: string | null;
          emailError?: string | null;
        }
      | undefined;
    if (dto.notifyOnCreate === true) {
      notificationSent = { whatsapp: false, email: false };
      try {
        const result = await this.reminderJobs.sendCreateConfirmation(meeting);
        notificationSent = {
          whatsapp: result.whatsappSent,
          email: result.emailSent,
          whatsappError: result.whatsappError,
          emailError: result.emailError,
        };
        meeting = await this.enrich(data as MeetingRow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `notifyOnCreate failed id=${meeting.id}: ${message} — RDV conservé`,
        );
        notificationSent = {
          whatsapp: false,
          email: false,
          whatsappError: message,
          emailError: null,
        };
      }
    }

    return notificationSent ? { ...meeting, notificationSent } : meeting;
  }

  async saveMeetLink(
    id: string,
    meetLink: string,
    meetSpace: string,
  ): Promise<Meeting> {
    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('meetings')
      .update({
        meet_link: meetLink,
        meet_space: meetSpace,
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
    return this.enrich(data as MeetingRow);
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

    const updated = await this.saveMeetLink(id, meet.meetLink, meet.spaceName);
    this.logger.log(`Meeting meet link regenerated id=${id}`);
    return updated;
  }

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
    assertCanAccessMeetings(user);
    const existing = await this.assertCanViewMeeting(id, user);

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    let rescheduleJobs = false;
    let resetSentJobs = false;

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
      await this.blockedDays.assertMeetingDateNotBlocked(nextIso);
      patch.meeting_date = nextIso;

      if (nextIso !== existing.meeting_date) {
        patch.reminder_whatsapp_sent = false;
        patch.reminder_email_sent = false;
        patch.manual_reminder_sent_at = null;
        patch.manual_reminder_whatsapp_sent = false;
        patch.manual_reminder_email_sent = false;
        rescheduleJobs = true;
        resetSentJobs = true;
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
      rescheduleJobs = true;
    }

    if (dto.contactEmail !== undefined) {
      patch.contact_email =
        dto.contactEmail === null || dto.contactEmail === ''
          ? null
          : clean(dto.contactEmail).toLowerCase() || null;
      rescheduleJobs = true;
    }

    if (dto.leadId !== undefined) {
      patch.lead_id = dto.leadId || null;
    }

    if (dto.status !== undefined) {
      patch.status = dto.status;
      if (dto.status !== existing.status) {
        rescheduleJobs = true;
      }
    }

    if (dto.notes !== undefined) {
      patch.notes = dto.notes === null ? null : clean(dto.notes) || null;
    }

    if (dto.reminders !== undefined) {
      patch.reminders = normalizeRemindersConfig(dto.reminders);
      rescheduleJobs = true;
    }

    let membersToSave: MeetingMember[] | undefined;
    if (dto.members !== undefined) {
      membersToSave = this.normalizeMembersInput(dto.members);
      rescheduleJobs = true;
    }

    let assigneesToSave: string[] | undefined;
    if (dto.assignedUserIds !== undefined) {
      if (!canAssignMeetingUsers(user.role)) {
        throw new ForbiddenException({
          message: 'Vous ne pouvez pas modifier les assignees de ce RDV.',
        });
      }
      const creatorId = existing.created_by
        ? String(existing.created_by)
        : user.id;
      assigneesToSave = this.resolveAssignedUserIds(
        dto.assignedUserIds,
        creatorId,
        user,
      );
      await this.assertUsersExist(assigneesToSave);
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

    if (membersToSave !== undefined) {
      await this.replaceMembers(id, membersToSave);
    }
    if (assigneesToSave !== undefined) {
      await this.replaceAssignees(id, assigneesToSave);
    }

    let meeting = await this.enrich(data as MeetingRow);

    if (rescheduleJobs) {
      try {
        if (ACTIVE_REMINDER_STATUSES.includes(meeting.status)) {
          await this.reminderJobs.scheduleJobsForMeeting(meeting, undefined, {
            resetSent: resetSentJobs,
          });
        } else {
          await this.reminderJobs.cancelPendingJobs(meeting.id);
        }
        meeting = await this.enrich(data as MeetingRow);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Reschedule reminders failed id=${meeting.id}: ${message}`,
        );
      }
    }

    this.logger.log(`Meeting updated id=${id}`);
    return meeting;
  }

  async remove(id: string, user: AppUser) {
    assertCanAccessMeetings(user);
    await this.assertCanViewMeeting(id, user);

    const sb = this.supabase.getClient();
    const { error } = await sb.from('meetings').delete().eq('id', id);
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    this.logger.log(`Meeting deleted id=${id}`);
    return { ok: true, id };
  }

  async findById(id: string): Promise<Meeting> {
    return this.enrich(await this.findRowOrThrow(id));
  }

  async findByIdForUser(id: string, user: AppUser): Promise<Meeting> {
    assertCanAccessMeetings(user);
    const row = await this.assertCanViewMeeting(id, user);
    return this.enrich(row);
  }

  /**
   * Envoi manuel : met à jour les flags legacy + champs manual_*
   * sans toucher aux jobs auto (remindersStatus).
   */
  async markManualReminderSent(
    id: string,
    channels: { whatsapp?: boolean; email?: boolean },
  ): Promise<void> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      updated_at: now,
      manual_reminder_sent_at: now,
    };
    if (channels.whatsapp === true) {
      patch.manual_reminder_whatsapp_sent = true;
      patch.reminder_whatsapp_sent = true;
    }
    if (channels.email === true) {
      patch.manual_reminder_email_sent = true;
      patch.reminder_email_sent = true;
    }

    const { error } = await this.supabase
      .getClient()
      .from('meetings')
      .update(patch)
      .eq('id', id);

    if (error) {
      this.logger.warn(
        `markManualReminderSent failed id=${id}: ${error.message}`,
      );
    }
  }

  /** Sync legacy booleans from job statuses (at least one `sent` per channel). */
  async syncLegacyReminderFlags(id: string): Promise<void> {
    const jobs = await this.reminderJobs.listJobsForMeeting(id);
    const reminders = normalizeRemindersConfig(undefined);
    const status = buildRemindersStatusFromJobs(jobs, reminders);
    const flags = legacyFlagsFromStatus(status);

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (flags.reminderWhatsappSent) patch.reminder_whatsapp_sent = true;
    if (flags.reminderEmailSent) patch.reminder_email_sent = true;

    if (
      patch.reminder_whatsapp_sent === undefined &&
      patch.reminder_email_sent === undefined
    ) {
      return;
    }

    const { error } = await this.supabase
      .getClient()
      .from('meetings')
      .update(patch)
      .eq('id', id);

    if (error) {
      this.logger.warn(
        `syncLegacyReminderFlags failed id=${id}: ${error.message}`,
      );
    }
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
