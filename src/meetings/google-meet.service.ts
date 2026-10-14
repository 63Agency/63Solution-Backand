import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { DateTime } from 'luxon';
import { CASABLANCA_TZ } from './utils/meeting-datetime';

type MeetSpaceResult = {
  meetLink: string;
  spaceName: string;
};

export type CreateEventWithMeetInput = {
  title: string;
  contactName: string;
  contactEmail?: string | null;
  meetingDateIso: string;
  durationMinutes: number;
  attendeeEmails: string[];
};

export type CreateEventWithMeetResult = {
  meetLink: string;
  eventId: string;
};

export type PatchEventInput = {
  eventId: string;
  title: string;
  contactName: string;
  meetingDateIso: string;
  durationMinutes: number;
  attendeeEmails: string[];
  /** Nouveau conferenceData.createRequest pour régénérer le lien Meet. */
  regenerateConference?: boolean;
};

export type PatchEventResult = {
  meetLink: string | null;
};

function isHttpStatus(err: unknown, codes: number[]): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; response?: { status?: unknown } };
  const code = typeof e.code === 'number' ? e.code : Number(e.code);
  const status =
    typeof e.response?.status === 'number'
      ? e.response.status
      : Number(e.response?.status);
  return codes.includes(code) || codes.includes(status);
}

function extractMeetLink(
  data: calendar_v3.Schema$Event | null | undefined,
): string {
  if (!data) return '';
  const hangout =
    typeof data.hangoutLink === 'string' ? data.hangoutLink.trim() : '';
  if (hangout) return hangout;

  const entries = data.conferenceData?.entryPoints ?? [];
  for (const ep of entries) {
    if (ep?.entryPointType === 'video' && typeof ep.uri === 'string') {
      const uri = ep.uri.trim();
      if (uri) return uri;
    }
  }
  return '';
}

function toCasaWindow(
  meetingDateIso: string,
  durationMinutes: number,
): { start: DateTime; end: DateTime } | null {
  const start = DateTime.fromISO(meetingDateIso, { zone: 'utc' }).setZone(
    CASABLANCA_TZ,
  );
  if (!start.isValid) return null;
  const end = start.plus({ minutes: durationMinutes });
  if (!end.isValid) return null;
  return { start, end };
}

@Injectable()
export class GoogleMeetService {
  private readonly logger = new Logger(GoogleMeetService.name);
  private readonly oauth2: InstanceType<typeof google.auth.OAuth2>;

  constructor() {
    this.oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
    );
    this.oauth2.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
  }

  private calendar(): calendar_v3.Calendar {
    return google.calendar({ version: 'v3', auth: this.oauth2 });
  }

  /**
   * Create a Google Meet space (OPEN — external guests can join freely).
   * Returns null on any failure so meeting creation never depends on Meet.
   */
  async createSpace(): Promise<MeetSpaceResult | null> {
    try {
      const { token } = await this.oauth2.getAccessToken();
      if (!token) {
        this.logger.error(
          '[GoogleMeet] Impossible d’obtenir un access token (refresh token / credentials).',
        );
        return null;
      }

      const res = await fetch('https://meet.googleapis.com/v2/spaces', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            accessType: 'OPEN',
            entryPointAccess: 'ALL',
          },
        }),
      });

      const rawText = await res.text().catch(() => '');
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        data = { parseError: rawText.slice(0, 300) };
      }

      if (!res.ok) {
        this.logger.error(
          `[GoogleMeet] createSpace failed status=${res.status} body=${rawText.slice(0, 500)}`,
        );
        return null;
      }

      const meetLink =
        typeof data.meetingUri === 'string' ? data.meetingUri.trim() : '';
      const spaceName =
        typeof data.name === 'string' ? data.name.trim() : '';

      if (!meetLink) {
        this.logger.error(
          `[GoogleMeet] createSpace: meetingUri manquant body=${rawText.slice(0, 500)}`,
        );
        return null;
      }

      this.logger.log(
        `[GoogleMeet] space created name=${spaceName || '-'} link=${meetLink}`,
      );
      return { meetLink, spaceName };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[GoogleMeet] createSpace error: ${message}`);
      return null;
    }
  }

  /**
   * Crée un événement Calendar (primary) + lien Meet via conferenceData.
   * Ne throw jamais — null si échec / pas de lien (l’appelant fait createSpace).
   */
  async createEventWithMeet(
    input: CreateEventWithMeetInput,
  ): Promise<CreateEventWithMeetResult | null> {
    try {
      const window = toCasaWindow(input.meetingDateIso, input.durationMinutes);
      if (!window) {
        this.logger.error(
          `[GoogleMeet] createEventWithMeet: date invalide iso=${input.meetingDateIso}`,
        );
        return null;
      }

      const { start, end } = window;
      const startIso = start.toISO({ suppressMilliseconds: true });
      const endIso = end.toISO({ suppressMilliseconds: true });
      if (!startIso || !endIso) {
        this.logger.error('[GoogleMeet] createEventWithMeet: toISO failed');
        return null;
      }

      const calendar = this.calendar();
      const res = await calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody: {
          summary: `${input.title} — ${input.contactName}`,
          start: {
            dateTime: startIso,
            timeZone: CASABLANCA_TZ,
          },
          end: {
            dateTime: endIso,
            timeZone: CASABLANCA_TZ,
          },
          attendees: input.attendeeEmails.map((email) => ({ email })),
          conferenceData: {
            createRequest: {
              requestId: randomUUID(),
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        },
      });

      const eventId =
        typeof res.data.id === 'string' ? res.data.id.trim() : '';
      if (!eventId) {
        this.logger.error(
          '[GoogleMeet] createEventWithMeet: event id manquant',
        );
        return null;
      }

      let meetLink = extractMeetLink(res.data);
      if (!meetLink) {
        try {
          const got = await calendar.events.get({
            calendarId: 'primary',
            eventId,
          });
          meetLink = extractMeetLink(got.data);
        } catch (getErr) {
          const message =
            getErr instanceof Error ? getErr.message : String(getErr);
          this.logger.warn(
            `[GoogleMeet] createEventWithMeet events.get failed id=${eventId}: ${message}`,
          );
        }
      }

      if (!meetLink) {
        this.logger.error(
          `[GoogleMeet] createEventWithMeet: meet link manquant eventId=${eventId}`,
        );
        return null;
      }

      this.logger.log(
        `[GoogleMeet] calendar event created id=${eventId} link=${meetLink} attendees=${input.attendeeEmails.length}`,
      );
      return { meetLink, eventId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[GoogleMeet] createEventWithMeet error: ${message}`);
      return null;
    }
  }

  /**
   * Met à jour un événement Calendar (start/end/summary/attendees).
   * Optionnel : régénère la conférence Meet.
   * Ne throw jamais.
   */
  async patchEvent(input: PatchEventInput): Promise<PatchEventResult | null> {
    try {
      const window = toCasaWindow(input.meetingDateIso, input.durationMinutes);
      if (!window) {
        this.logger.error(
          `[GoogleMeet] patchEvent: date invalide iso=${input.meetingDateIso}`,
        );
        return null;
      }

      const { start, end } = window;
      const startIso = start.toISO({ suppressMilliseconds: true });
      const endIso = end.toISO({ suppressMilliseconds: true });
      if (!startIso || !endIso) {
        this.logger.error('[GoogleMeet] patchEvent: toISO failed');
        return null;
      }

      const requestBody: calendar_v3.Schema$Event = {
        summary: `${input.title} — ${input.contactName}`,
        start: {
          dateTime: startIso,
          timeZone: CASABLANCA_TZ,
        },
        end: {
          dateTime: endIso,
          timeZone: CASABLANCA_TZ,
        },
        attendees: input.attendeeEmails.map((email) => ({ email })),
      };

      if (input.regenerateConference) {
        requestBody.conferenceData = {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        };
      }

      const calendar = this.calendar();
      const res = await calendar.events.patch({
        calendarId: 'primary',
        eventId: input.eventId,
        conferenceDataVersion: input.regenerateConference ? 1 : undefined,
        sendUpdates: 'all',
        requestBody,
      });

      let meetLink: string | null = extractMeetLink(res.data) || null;
      if (input.regenerateConference && !meetLink) {
        try {
          const got = await calendar.events.get({
            calendarId: 'primary',
            eventId: input.eventId,
          });
          meetLink = extractMeetLink(got.data) || null;
        } catch {
          meetLink = null;
        }
      }

      this.logger.log(
        `[GoogleMeet] calendar event patched id=${input.eventId} regenerate=${Boolean(input.regenerateConference)}`,
      );
      return { meetLink };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[GoogleMeet] patchEvent error id=${input.eventId}: ${message}`,
      );
      return null;
    }
  }

  /**
   * Supprime un événement Calendar. Ignore 404/410. Ne throw jamais.
   */
  async deleteEvent(eventId: string): Promise<void> {
    const id = (eventId ?? '').trim();
    if (!id) return;

    try {
      await this.calendar().events.delete({
        calendarId: 'primary',
        eventId: id,
        sendUpdates: 'all',
      });
      this.logger.log(`[GoogleMeet] calendar event deleted id=${id}`);
    } catch (err) {
      if (isHttpStatus(err, [404, 410])) {
        this.logger.warn(
          `[GoogleMeet] deleteEvent already gone id=${id}`,
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[GoogleMeet] deleteEvent error id=${id}: ${message}`);
    }
  }
}
