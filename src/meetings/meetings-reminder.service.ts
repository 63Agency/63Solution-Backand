import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MailerService } from '../common/mailer/mailer.service';
import { MetaService } from '../whatsapp/meta.service';
import { GoogleMeetService } from './google-meet.service';
import { MeetingsService } from './meetings.service';
import type { Meeting } from './types/meeting.types';
import {
  firstNameOnly,
  formatMeetingDate,
} from './utils/meeting-datetime';

@Injectable()
export class MeetingsReminderService {
  private readonly logger = new Logger(MeetingsReminderService.name);

  constructor(
    @Inject(forwardRef(() => MeetingsService))
    private readonly meetings: MeetingsService,
    private readonly meta: MetaService,
    private readonly mailer: MailerService,
    private readonly googleMeet: GoogleMeetService,
  ) {}

  /** Every 15 minutes (Nest cron includes seconds). */
  @Cron('0 */15 * * * *')
  async handleCron(): Promise<void> {
    await this.processDueReminders();
  }

  /**
   * Find scheduled meetings ~24h ahead (NOW+23h … NOW+25h) and send reminders.
   * Safe to call manually for testing.
   */
  async processDueReminders(): Promise<{
    found: number;
    sentWhatsapp: number;
    sentEmail: number;
    failed: number;
  }> {
    const now = Date.now();
    const windowStart = new Date(now + 23 * 60 * 60 * 1000);
    const windowEnd = new Date(now + 25 * 60 * 60 * 1000);

    let found = 0;
    let sentWhatsapp = 0;
    let sentEmail = 0;
    let failed = 0;

    try {
      const due = await this.meetings.findDueForReminder(windowStart, windowEnd);
      found = due.length;

      for (const meeting of due) {
        const result = await this.sendRemindersForMeeting(meeting, {
          force: false,
        });
        sentWhatsapp += result.whatsappSent ? 1 : 0;
        sentEmail += result.emailSent ? 1 : 0;
        failed += result.failures;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[MeetingsReminder] batch failed: ${message}`);
      failed += 1;
    }

    this.logger.log(
      `[MeetingsReminder] found=${found} sent_whatsapp=${sentWhatsapp} sent_email=${sentEmail} failed=${failed}`,
    );

    return { found, sentWhatsapp, sentEmail, failed };
  }

  /**
   * Force-send reminder channels for one meeting (admin test endpoint).
   * Respects already-sent flags unless force=true.
   */
  async sendReminderForMeetingId(
    id: string,
    options: { force?: boolean } = {},
  ): Promise<{
    whatsappSent: boolean;
    emailSent: boolean;
    failures: number;
    meeting: Meeting;
  }> {
    const meeting = await this.meetings.findById(id);
    const result = await this.sendRemindersForMeeting(meeting, {
      force: options.force === true,
    });

    this.logger.log(
      `[MeetingsReminder] manual id=${id} whatsapp=${result.whatsappSent} email=${result.emailSent} failed=${result.failures}`,
    );

    return {
      ...result,
      meeting: await this.meetings.findById(id),
    };
  }

  private async sendRemindersForMeeting(
    meeting: Meeting,
    options: { force: boolean },
  ): Promise<{ whatsappSent: boolean; emailSent: boolean; failures: number }> {
    let whatsappSent = false;
    let emailSent = false;
    let failures = 0;

    // Never remind cancelled / done / no_show meetings.
    if (meeting.status !== 'scheduled') {
      this.logger.log(
        `[MeetingsReminder] skip id=${meeting.id} status=${meeting.status}`,
      );
      return { whatsappSent, emailSent, failures };
    }

    const shouldWhatsapp =
      Boolean(meeting.contactPhone) &&
      (options.force || !meeting.reminderWhatsappSent);
    const shouldEmail =
      Boolean(meeting.contactEmail) &&
      (options.force || !meeting.reminderEmailSent);

    // Ensure Meet link once for both channels (WhatsApp requires {{4}}).
    let current = meeting;
    if (shouldWhatsapp || shouldEmail) {
      current = await this.ensureMeetLink(current);
    }

    if (shouldWhatsapp && current.contactPhone) {
      try {
        const sent = await this.sendWhatsappReminder(current);
        if (sent) {
          await this.meetings.markReminderFlags(current.id, { whatsapp: true });
          whatsappSent = true;
        }
      } catch (err) {
        failures += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[MeetingsReminder] whatsapp failed id=${current.id}: ${message}`,
        );
      }
    }

    if (shouldEmail && current.contactEmail) {
      try {
        await this.sendEmailReminder(current);
        await this.meetings.markReminderFlags(current.id, { email: true });
        emailSent = true;
      } catch (err) {
        failures += 1;
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[MeetingsReminder] email failed id=${current.id}: ${message}`,
        );
      }
    }

    return { whatsappSent, emailSent, failures };
  }

  /**
   * If meet_link is missing, try to create a Google Meet space and persist it.
   */
  private async ensureMeetLink(meeting: Meeting): Promise<Meeting> {
    if (meeting.meetLink?.trim()) {
      return meeting;
    }

    const created = await this.googleMeet.createSpace();
    if (!created?.meetLink) {
      this.logger.warn(
        `[MeetingsReminder] meet_link manquant et génération Google Meet échouée id=${meeting.id} — WhatsApp sera ignoré (4e paramètre requis)`,
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
      // Still use the freshly generated link for this send attempt.
      return {
        ...meeting,
        meetLink: created.meetLink,
        meetSpace: created.spaceName,
      };
    }
  }

  /**
   * Always uses meeting_reminder_date with 4 params: nom, date, heure, lien.
   * Returns false if WhatsApp was skipped (no Meet link).
   */
  private async sendWhatsappReminder(meeting: Meeting): Promise<boolean> {
    const meetLink = meeting.meetLink?.trim() || '';
    if (!meetLink) {
      this.logger.warn(
        `[MeetingsReminder] WhatsApp non envoyé id=${meeting.id} — meet_link absent (Meta exige 4 params, paramètre vide rejeté)`,
      );
      return false;
    }

    const prenom = firstNameOnly(meeting.contactName);
    const { date, time } = formatMeetingDate(meeting.meetingDate);

    await this.meta.sendTemplateMessage(
      meeting.contactPhone!,
      'meeting_reminder_date',
      'fr',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: prenom }, // {{1}}
            { type: 'text', text: date }, // {{2}} prévu le …
            { type: 'text', text: time }, // {{3}} à …
            { type: 'text', text: meetLink }, // {{4}}
          ],
        },
      ],
    );
    return true;
  }

  private async sendEmailReminder(meeting: Meeting): Promise<void> {
    const { date, time } = formatMeetingDate(meeting.meetingDate);
    const name = meeting.contactName.trim();
    const meetLink = meeting.meetLink?.trim() || '';

    const lines = [
      `Bonjour ${name},`,
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

    await this.mailer.sendMail({
      to: meeting.contactEmail!,
      subject: 'Rappel : votre rendez-vous avec 63 Agency',
      text: lines.join('\n'),
    });
  }
}
