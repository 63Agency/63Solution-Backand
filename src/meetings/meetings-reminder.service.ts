import { forwardRef, HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailerService } from '../common/mailer/mailer.service';
import { SupabaseService } from '../supabase/supabase.service';
import { MetaService } from '../whatsapp/meta.service';
import { GoogleMeetService } from './google-meet.service';
import { MeetingsService } from './meetings.service';
import type {
  Meeting,
  MeetingReminderRow,
  MeetingRemindersConfig,
  ReminderChannel,
  ReminderJobStatus,
  ReminderOffset,
} from './types/meeting.types';
import {
  firstNameOnly,
  formatMeetingDate,
} from './utils/meeting-datetime';
import { normalizeMeetingPhone } from './utils/meeting-phone';
import {
  computeSendAt,
  normalizeRemindersConfig,
  REMINDER_CHANNELS,
  REMINDER_OFFSETS,
} from './utils/meeting-reminders';

type DueJob = MeetingReminderRow & {
  meeting?: Meeting;
};

type WhatsappRecipient = { phone: string; name: string };
type EmailRecipient = { email: string; name: string };

type ChannelSendResult = {
  whatsappSent: boolean;
  emailSent: boolean;
  failures: number;
  whatsappError: string | null;
  emailError: string | null;
  whatsappMetaIds?: string[];
  whatsappTemplate?: string;
  whatsappWarning?: string | null;
};

/** Fenêtre anti-doublon notifyOnCreate ↔ send-reminder (front enchaîne les deux). */
const MANUAL_IDEMPOTENCY_MS = 5 * 60 * 1000;

const MEETING_WA_TEMPLATE = 'meeting_reminder_date';
const MEETING_WA_LANG = 'fr';

function extractErrorMessage(err: unknown): string {
  if (!err) return 'erreur inconnue';
  if (typeof err === 'string') return err;
  if (err instanceof HttpException) {
    const res = err.getResponse();
    if (typeof res === 'string') return res;
    if (res && typeof res === 'object') {
      const r = res as Record<string, unknown>;
      if (typeof r.message === 'string') return r.message;
      if (Array.isArray(r.message)) return r.message.map(String).join(', ');
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function recentlyManualSent(
  sentAt: string | null | undefined,
  channelAlreadySent: boolean,
): boolean {
  if (!channelAlreadySent || !sentAt) return false;
  const t = Date.parse(sentAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < MANUAL_IDEMPOTENCY_MS;
}

function meetingWhatsappRecipients(meeting: Meeting): WhatsappRecipient[] {
  const seen = new Set<string>();
  const out: WhatsappRecipient[] = [];

  const add = (phone: string | null | undefined, name: string) => {
    // Meeting contact_phone / members[].phone → 212XXXXXXXXX (no +, spaces, or 00).
    const normalized = normalizeMeetingPhone(phone);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ phone: normalized, name: name.trim() || 'Contact' });
  };

  add(meeting.contactPhone, meeting.contactName);
  for (const m of meeting.members ?? []) {
    add(m.phone, m.name);
  }
  return out;
}

function meetingEmailRecipients(meeting: Meeting): EmailRecipient[] {
  const seen = new Set<string>();
  const out: EmailRecipient[] = [];

  const add = (email: string | null | undefined, name: string) => {
    const e = (email ?? '').trim().toLowerCase();
    if (!e || seen.has(e)) return;
    seen.add(e);
    out.push({ email: e, name: name.trim() || 'Contact' });
  };

  add(meeting.contactEmail, meeting.contactName);
  for (const m of meeting.members ?? []) {
    add(m.email, m.name);
  }
  return out;
}

@Injectable()
export class MeetingsReminderService {
  private readonly logger = new Logger(MeetingsReminderService.name);

  constructor(
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetings: MeetingsService,
    private readonly supabase: SupabaseService,
    private readonly meta: MetaService,
    private readonly mailer: MailerService,
    private readonly googleMeet: GoogleMeetService,
  ) {}

  /** Every 5 minutes — process pending reminder jobs. */
  @Cron('0 */5 * * * *')
  async handleCron(): Promise<void> {
    await this.processDueReminders();
  }

  /**
   * Create / refresh up to 6 jobs for a scheduled meeting.
   * Past offsets or unavailable channels → skipped.
   * Keeps already-sent jobs intact when rescheduling.
   */
  async scheduleJobsForMeeting(
    meeting: Meeting,
    config?: MeetingRemindersConfig,
    options: { resetSent?: boolean } = {},
  ): Promise<void> {
    const reminders = normalizeRemindersConfig(
      config ?? meeting.reminders,
    );
    const now = Date.now();
    const sb = this.supabase.getClient();
    const nowIso = new Date().toISOString();

    if (meeting.status !== 'scheduled') {
      await this.cancelPendingJobs(meeting.id);
      return;
    }

    const existing = await this.listJobsForMeeting(meeting.id);
    const existingByKey = new Map(
      existing.map((j) => [`${j.channel}:${j.reminder_offset}`, j]),
    );

    const rows: Array<Record<string, unknown>> = [];

    for (const channel of REMINDER_CHANNELS) {
      for (const offset of REMINDER_OFFSETS) {
        const key = `${channel}:${offset}`;
        const prev = existingByKey.get(key);
        const enabled = reminders[channel][offset] === true;
        const sendAt = computeSendAt(meeting.meetingDate, offset);
        const hasContact =
          channel === 'whatsapp'
            ? meetingWhatsappRecipients(meeting).length > 0
            : meetingEmailRecipients(meeting).length > 0;

        // Keep already-sent jobs unless date/reminders force a full reset.
        if (prev && prev.status === 'sent' && !options.resetSent) {
          continue;
        }

        let status: ReminderJobStatus = 'pending';
        let error: string | null = null;

        if (!enabled) {
          status = 'skipped';
          error = 'désactivé';
        } else if (!hasContact) {
          status = 'skipped';
          error =
            channel === 'whatsapp'
              ? 'pas de téléphone'
              : 'pas d’email';
        } else if (sendAt.getTime() <= now) {
          status = 'skipped';
          error = 'send_at dans le passé';
        }

        rows.push({
          meeting_id: meeting.id,
          channel,
          reminder_offset: offset,
          enabled,
          send_at: sendAt.toISOString(),
          status,
          sent_at: null,
          error,
          updated_at: nowIso,
          ...(prev ? {} : { created_at: nowIso }),
        });
      }
    }

    if (rows.length === 0) return;

    const { error } = await sb.from('meeting_reminders').upsert(rows, {
      onConflict: 'meeting_id,channel,reminder_offset',
    });

    if (error) {
      this.logger.error(
        `[MeetingsReminder] schedule failed meetingId=${meeting.id}: ${error.message}`,
      );
      throw error;
    }

    this.logger.log(
      `[MeetingsReminder] scheduled meetingId=${meeting.id} jobs=${rows.length} resetSent=${options.resetSent === true}`,
    );
  }

  async cancelPendingJobs(meetingId: string): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from('meeting_reminders')
      .update({
        status: 'skipped',
        error: 'meeting annulé / terminé',
        updated_at: new Date().toISOString(),
      })
      .eq('meeting_id', meetingId)
      .eq('status', 'pending');

    if (error) {
      this.logger.warn(
        `[MeetingsReminder] cancelPending failed meetingId=${meetingId}: ${error.message}`,
      );
    }
  }

  async listJobsForMeeting(meetingId: string): Promise<MeetingReminderRow[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_reminders')
      .select(
        'id, meeting_id, channel, reminder_offset, enabled, send_at, status, sent_at, error',
      )
      .eq('meeting_id', meetingId);

    if (error) {
      this.logger.warn(
        `[MeetingsReminder] listJobs failed meetingId=${meetingId}: ${error.message}`,
      );
      return [];
    }
    return (data ?? []) as MeetingReminderRow[];
  }

  async listJobsForMeetings(
    meetingIds: string[],
  ): Promise<Map<string, MeetingReminderRow[]>> {
    const map = new Map<string, MeetingReminderRow[]>();
    if (meetingIds.length === 0) return map;

    const { data, error } = await this.supabase
      .getClient()
      .from('meeting_reminders')
      .select(
        'id, meeting_id, channel, reminder_offset, enabled, send_at, status, sent_at, error',
      )
      .in('meeting_id', meetingIds);

    if (error) {
      this.logger.warn(
        `[MeetingsReminder] listJobsForMeetings failed: ${error.message}`,
      );
      return map;
    }

    for (const row of (data ?? []) as MeetingReminderRow[]) {
      const list = map.get(row.meeting_id) ?? [];
      list.push(row);
      map.set(row.meeting_id, list);
    }
    return map;
  }

  async processDueReminders(): Promise<{
    found: number;
    sentWhatsapp: number;
    sentEmail: number;
    failed: number;
  }> {
    let found = 0;
    let sentWhatsapp = 0;
    let sentEmail = 0;
    let failed = 0;

    try {
      const nowIso = new Date().toISOString();
      const { data, error } = await this.supabase
        .getClient()
        .from('meeting_reminders')
        .select(
          'id, meeting_id, channel, reminder_offset, enabled, send_at, status, sent_at, error',
        )
        .eq('status', 'pending')
        .lte('send_at', nowIso)
        .order('send_at', { ascending: true })
        .limit(100);

      if (error) {
        throw new Error(error.message);
      }

      const jobs = (data ?? []) as MeetingReminderRow[];
      found = jobs.length;

      for (const job of jobs) {
        const result = await this.executeJob(job, { force: false });
        if (result.sent) {
          if (job.channel === 'whatsapp') sentWhatsapp += 1;
          else sentEmail += 1;
        }
        if (result.failed) failed += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[MeetingsReminder] batch failed: ${message}`);
      failed += 1;
    }

    this.logger.log(
      `[MeetingsReminder] due found=${found} sent_whatsapp=${sentWhatsapp} sent_email=${sentEmail} failed=${failed}`,
    );

    return { found, sentWhatsapp, sentEmail, failed };
  }

  /**
   * Confirmation immédiate à la création (notifyOnCreate).
   * Même fan-out que le rappel manuel — ne touche PAS aux jobs auto 2d/24h/2h.
   */
  async sendCreateConfirmation(meeting: Meeting): Promise<ChannelSendResult> {
    if (meeting.status !== 'scheduled') {
      return {
        whatsappSent: false,
        emailSent: false,
        failures: 0,
        whatsappError: 'meeting non scheduled',
        emailError: null,
        whatsappMetaIds: [],
        whatsappTemplate: `${MEETING_WA_TEMPLATE}/${MEETING_WA_LANG}`,
        whatsappWarning: null,
      };
    }

    const result = await this.sendManualChannelsNow(meeting, {
      whatsapp: true,
      email: true,
    });

    if (result.whatsappSent || result.emailSent) {
      await this.meetings.markManualReminderSent(meeting.id, {
        whatsapp: result.whatsappSent,
        email: result.emailSent,
      });
    }

    this.logger.log(
      `[MeetingsReminder] create-confirm id=${meeting.id} whatsapp=${result.whatsappSent} email=${result.emailSent} waErr=${result.whatsappError ?? '-'} emailErr=${result.emailError ?? '-'} — jobs auto inchangés`,
    );

    return result;
  }

  /**
   * Envoi manuel immédiat (bouton admin) — indépendant du scheduler.
   * N'altère JAMAIS les jobs auto (remindersStatus reste pending/sent selon le cron).
   * Réponse explicite : whatsappSent / emailSent + erreurs Meta/SMTP.
   */
  async sendReminderForMeetingId(
    id: string,
    options: {
      force?: boolean;
      channel?: ReminderChannel;
      offset?: ReminderOffset;
    } = {},
  ): Promise<{
    ok: true;
    whatsappSent: boolean;
    emailSent: boolean;
    whatsappError: string | null;
    emailError: string | null;
    whatsappMetaIds: string[];
    whatsappTemplate: string;
    whatsappWarning: string | null;
    failures: number;
    skipped?: { whatsapp: boolean; email: boolean };
    meeting: Meeting;
  }> {
    const meeting = await this.meetings.findById(id);
    const templateLabel = `${MEETING_WA_TEMPLATE}/${MEETING_WA_LANG}`;

    if (meeting.status !== 'scheduled') {
      return {
        ok: true,
        whatsappSent: false,
        emailSent: false,
        whatsappError: `meeting status=${meeting.status}`,
        emailError: null,
        whatsappMetaIds: [],
        whatsappTemplate: templateLabel,
        whatsappWarning: null,
        failures: 0,
        meeting,
      };
    }

    const wantWhatsapp =
      !options.channel || options.channel === 'whatsapp';
    const wantEmail = !options.channel || options.channel === 'email';

    // Idempotence courte sauf force=true (bouton « Envoyer maintenant »).
    const skipWhatsapp =
      !options.force &&
      wantWhatsapp &&
      recentlyManualSent(
        meeting.manualReminderSentAt,
        meeting.manualReminderWhatsappSent,
      );
    const skipEmail =
      !options.force &&
      wantEmail &&
      recentlyManualSent(
        meeting.manualReminderSentAt,
        meeting.manualReminderEmailSent,
      );

    if (skipWhatsapp || skipEmail) {
      this.logger.log(
        `[MeetingsReminder] idempotent skip id=${id} whatsapp=${skipWhatsapp} email=${skipEmail}`,
      );
    }

    const result = await this.sendManualChannelsNow(meeting, {
      whatsapp: wantWhatsapp && !skipWhatsapp,
      email: wantEmail && !skipEmail,
    });

    const whatsappSent = result.whatsappSent || skipWhatsapp;
    const emailSent = result.emailSent || skipEmail;

    if (result.whatsappSent || result.emailSent) {
      await this.meetings.markManualReminderSent(meeting.id, {
        whatsapp: result.whatsappSent,
        email: result.emailSent,
      });
    }

    this.logger.log(
      `[MeetingsReminder] manual id=${id} whatsapp=${whatsappSent} email=${emailSent} waErr=${result.whatsappError ?? '-'} emailErr=${result.emailError ?? '-'} wamids=${(result.whatsappMetaIds ?? []).join(',') || '-'} offset=${options.offset ?? '(none)'} force=${options.force === true} — jobs auto inchangés`,
    );

    return {
      ok: true,
      whatsappSent,
      emailSent,
      whatsappError: skipWhatsapp
        ? null
        : wantWhatsapp
          ? result.whatsappError
          : null,
      emailError: skipEmail
        ? null
        : wantEmail
          ? result.emailError
          : null,
      whatsappMetaIds: result.whatsappMetaIds ?? [],
      whatsappTemplate: templateLabel,
      whatsappWarning: result.whatsappWarning ?? null,
      failures: result.failures,
      skipped: { whatsapp: skipWhatsapp, email: skipEmail },
      meeting: await this.meetings.findById(id),
    };
  }

  /** Envoi immédiat sans toucher meeting_reminders. */
  private async sendManualChannelsNow(
    meeting: Meeting,
    channels: { whatsapp: boolean; email: boolean },
  ): Promise<ChannelSendResult> {
    let whatsappSent = false;
    let emailSent = false;
    let failures = 0;
    let whatsappError: string | null = null;
    let emailError: string | null = null;
    let whatsappMetaIds: string[] = [];
    let whatsappWarning: string | null = null;

    const waRecipients = meetingWhatsappRecipients(meeting);
    const emailRecipients = meetingEmailRecipients(meeting);

    this.logger.log(
      `[MeetingsReminder] sendNow id=${meeting.id} waRecipients=${waRecipients.map((r) => r.phone).join(',') || '(none)'} emailRecipients=${emailRecipients.map((r) => r.email).join(',') || '(none)'} channels=${JSON.stringify(channels)}`,
    );

    let current = meeting;
    if (
      (channels.whatsapp && waRecipients.length > 0) ||
      (channels.email && emailRecipients.length > 0)
    ) {
      current = await this.ensureMeetLink(current);
    }

    if (channels.whatsapp) {
      if (waRecipients.length === 0) {
        whatsappError =
          'pas de téléphone (contactPhone / members[].phone)';
        this.logger.warn(
          `[MeetingsReminder] WhatsApp skip id=${meeting.id} — ${whatsappError}`,
        );
      } else {
        const wa = await this.sendWhatsappReminder(current);
        whatsappSent = wa.sent;
        whatsappError = wa.error;
        whatsappMetaIds = wa.metaIds;
        whatsappWarning = wa.warning;
        if (!wa.sent) failures += 1;
      }
    }

    if (channels.email) {
      if (emailRecipients.length === 0) {
        emailError = 'pas d’email (contactEmail / members[].email)';
        this.logger.warn(
          `[MeetingsReminder] Email skip id=${meeting.id} — ${emailError}`,
        );
      } else {
        const em = await this.sendEmailReminder(current);
        emailSent = em.sent;
        emailError = em.error;
        if (!em.sent) failures += 1;
      }
    }

    return {
      whatsappSent,
      emailSent,
      failures,
      whatsappError,
      emailError,
      whatsappMetaIds,
      whatsappTemplate: `${MEETING_WA_TEMPLATE}/${MEETING_WA_LANG}`,
      whatsappWarning,
    };
  }

  private async executeJob(
    job: DueJob,
    options: { force: boolean },
  ): Promise<{ sent: boolean; failed: boolean }> {
    if (!options.force && job.status === 'sent') {
      return { sent: false, failed: false };
    }
    if (!options.force && job.status !== 'pending' && job.status !== 'failed') {
      return { sent: false, failed: false };
    }

    let meeting: Meeting;
    try {
      meeting = await this.meetings.findById(job.meeting_id);
    } catch {
      await this.markJob(job.id, {
        status: 'skipped',
        error: 'meeting introuvable',
      });
      return { sent: false, failed: false };
    }

    if (meeting.status !== 'scheduled') {
      await this.markJob(job.id, {
        status: 'skipped',
        error: `status=${meeting.status}`,
      });
      return { sent: false, failed: false };
    }

    const channel = job.channel as ReminderChannel;
    meeting = await this.ensureMeetLink(meeting);

    try {
      if (channel === 'whatsapp') {
        if (meetingWhatsappRecipients(meeting).length === 0) {
          await this.markJob(job.id, {
            status: 'skipped',
            error: 'pas de téléphone',
          });
          return { sent: false, failed: false };
        }
        const wa = await this.sendWhatsappReminder(meeting);
        if (!wa.sent) {
          await this.markJob(job.id, {
            status: 'failed',
            error: (wa.error || 'envoi WhatsApp échoué').slice(0, 500),
          });
          return { sent: false, failed: true };
        }
      } else {
        if (meetingEmailRecipients(meeting).length === 0) {
          await this.markJob(job.id, {
            status: 'skipped',
            error: 'pas d’email',
          });
          return { sent: false, failed: false };
        }
        const em = await this.sendEmailReminder(meeting);
        if (!em.sent) {
          await this.markJob(job.id, {
            status: 'failed',
            error: (em.error || 'envoi email échoué').slice(0, 500),
          });
          return { sent: false, failed: true };
        }
      }

      await this.markJob(job.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        error: null,
      });
      await this.meetings.syncLegacyReminderFlags(meeting.id);
      return { sent: true, failed: false };
    } catch (err) {
      const message = extractErrorMessage(err);
      this.logger.warn(
        `[MeetingsReminder] job failed id=${job.id} channel=${channel} offset=${job.reminder_offset}: ${message}`,
      );
      await this.markJob(job.id, {
        status: 'failed',
        error: message.slice(0, 500),
      });
      return { sent: false, failed: true };
    }
  }

  private async markJob(
    jobId: string,
    patch: {
      status: ReminderJobStatus;
      sentAt?: string | null;
      error?: string | null;
    },
  ): Promise<void> {
    const update: Record<string, unknown> = {
      status: patch.status,
      updated_at: new Date().toISOString(),
    };
    if (patch.sentAt !== undefined) update.sent_at = patch.sentAt;
    if (patch.status === 'sent' && patch.sentAt === undefined) {
      update.sent_at = new Date().toISOString();
    }
    if (patch.error !== undefined) update.error = patch.error;

    const { error } = await this.supabase
      .getClient()
      .from('meeting_reminders')
      .update(update)
      .eq('id', jobId);

    if (error) {
      this.logger.warn(
        `[MeetingsReminder] markJob failed id=${jobId}: ${error.message}`,
      );
    }
  }

  private async ensureMeetLink(meeting: Meeting): Promise<Meeting> {
    if (meeting.meetLink?.trim()) {
      return meeting;
    }

    const created = await this.googleMeet.createSpace();
    if (!created?.meetLink) {
      this.logger.warn(
        `[MeetingsReminder] meet_link manquant et génération Google Meet échouée id=${meeting.id}`,
      );
      return meeting;
    }

    try {
      return await this.meetings.saveMeetLink(
        meeting.id,
        created.meetLink,
        created.spaceName,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[MeetingsReminder] impossible de persister meet_link id=${meeting.id}: ${message}`,
      );
      return {
        ...meeting,
        meetLink: created.meetLink,
        meetSpace: created.spaceName,
      };
    }
  }

  private async sendWhatsappReminder(
    meeting: Meeting,
  ): Promise<{
    sent: boolean;
    error: string | null;
    metaIds: string[];
    warning: string | null;
  }> {
    const recipients = meetingWhatsappRecipients(meeting);
    if (recipients.length === 0) {
      return {
        sent: false,
        error: 'pas de téléphone (contactPhone / members[].phone)',
        metaIds: [],
        warning: null,
      };
    }

    // Template APPROVED: meeting_reminder_date (fr) — category MARKETING (delivery may be filtered).
    // Bonjour {{1}}, … le {{2}} à {{3}}. … lien : {{4}}  ({{4}} must be an https URL)
    const { date, time } = formatMeetingDate(meeting.meetingDate);
    let meetLink = meeting.meetLink?.trim() || '';
    if (!/^https:\/\//i.test(meetLink)) {
      // Retry Meet generation once more before failing — Meta rejects non-URL {{4}}.
      const refreshed = await this.ensureMeetLink(meeting);
      meetLink = refreshed.meetLink?.trim() || '';
    }
    if (!/^https:\/\//i.test(meetLink)) {
      const error =
        'meet_link manquant ou invalide — le template meeting_reminder_date exige une URL https pour {{4}}';
      this.logger.warn(
        `[MeetingsReminder] WhatsApp skip id=${meeting.id} — ${error}`,
      );
      return { sent: false, error, metaIds: [], warning: null };
    }

    const warning =
      'Template meeting_reminder_date est category=MARKETING (pas UTILITY). Meta peut accepter (wamid) sans livrer sur le téléphone. Créer/reclasser le template en UTILITY dans Meta Business.';

    let anySent = false;
    let lastError: string | null = null;
    const metaIds: string[] = [];

    for (const recipient of recipients) {
      const prenom = firstNameOnly(recipient.name) || 'Client';
      // Avoid special dashes — Meta can reject some unicode in body params.
      const params = [
        prenom,
        (date || '-').replace(/—/g, '-'),
        (time || '-').replace(/—/g, '-'),
        meetLink,
      ].map((t) => t.trim() || '-');

      this.logger.log(
        `[WA SEND] meeting reminder prep to="${recipient.phone}" (from contactPhone/members via normalizeMeetingPhone) template=${MEETING_WA_TEMPLATE} meetingId=${meeting.id} params=${JSON.stringify(params)}`,
      );

      try {
        const result = await this.meta.sendTemplateMessage(
          recipient.phone,
          MEETING_WA_TEMPLATE,
          MEETING_WA_LANG,
          [
            {
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            },
          ],
        );
        anySent = true;
        if (result.whatsappMessageId) metaIds.push(result.whatsappMessageId);
        this.logger.log(
          `[MeetingsReminder] WhatsApp OK (Meta accepted) id=${meeting.id} to=${recipient.phone} wamid=${result.whatsappMessageId ?? '-'} — NOTE: template category=MARKETING`,
        );
      } catch (err) {
        lastError = extractErrorMessage(err);
        this.logger.warn(
          `[MeetingsReminder] WhatsApp FAILED id=${meeting.id} to=${recipient.phone}: ${lastError}`,
        );
      }
    }

    return {
      sent: anySent,
      error: anySent ? null : lastError || 'envoi WhatsApp échoué',
      metaIds,
      warning: anySent ? warning : null,
    };
  }

  private async sendEmailReminder(
    meeting: Meeting,
  ): Promise<{ sent: boolean; error: string | null }> {
    const recipients = meetingEmailRecipients(meeting);
    if (recipients.length === 0) {
      return {
        sent: false,
        error: 'pas d’email (contactEmail / members[].email)',
      };
    }

    const { date, time } = formatMeetingDate(meeting.meetingDate);
    const meetLink = meeting.meetLink?.trim() || '';
    let anySent = false;
    let lastError: string | null = null;

    for (const recipient of recipients) {
      const lines = [
        `Bonjour ${recipient.name},`,
        '',
        `Nous vous rappelons votre rendez-vous « ${meeting.title} ».`,
        '',
        `Date : ${date}`,
        `Heure : ${time}`,
      ];

      if (meetLink) {
        lines.push('', 'Rejoindre la réunion :', meetLink);
      }

      lines.push(
        '',
        'Merci de confirmer votre présence ou de nous contacter si vous souhaitez reporter.',
        '',
        'Cordialement,',
        "L'équipe 63 Agency",
      );

      try {
        await this.mailer.sendMail({
          to: recipient.email,
          subject: 'Rappel : votre rendez-vous avec 63 Agency',
          text: lines.join('\n'),
        });
        anySent = true;
        this.logger.log(
          `[MeetingsReminder] Email OK id=${meeting.id} to=${recipient.email}`,
        );
      } catch (err) {
        lastError = extractErrorMessage(err);
        this.logger.warn(
          `[MeetingsReminder] Email FAILED id=${meeting.id} to=${recipient.email}: ${lastError}`,
        );
      }
    }

    return {
      sent: anySent,
      error: anySent ? null : lastError || 'envoi email échoué',
    };
  }
}
