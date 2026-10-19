import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { DateTime } from 'luxon';
import { CASABLANCA_TZ } from './utils/meeting-datetime';

type MeetSpaceResult = {
  meetLink: string;
  spaceName: string;
  meetingCode: string;
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
  spaceName: string | null;
};

export type PatchEventInput = {
  eventId: string;
  title: string;
  contactName: string;
  meetingDateIso: string;
  durationMinutes: number;
  attendeeEmails: string[];
  /**
   * Nouveau lien Meet OPEN (spaces.create), rattaché à l’événement.
   * Pas de createRequest : celui-ci impose la salle d’attente.
   */
  regenerateConference?: boolean;
};

export type PatchEventResult = {
  meetLink: string | null;
  spaceName: string | null;
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

function meetingCodeFromLink(meetLink: string): string {
  const trimmed = meetLink.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    return (parts[parts.length - 1] ?? '').trim();
  } catch {
    const slash = trimmed.lastIndexOf('/');
    return (slash >= 0 ? trimmed.slice(slash + 1) : trimmed).trim();
  }
}

function conferenceDataForSpace(
  space: MeetSpaceResult,
): calendar_v3.Schema$ConferenceData {
  const code = space.meetingCode || meetingCodeFromLink(space.meetLink);
  return {
    conferenceId: code || undefined,
    conferenceSolution: {
      key: { type: 'hangoutsMeet' },
      name: 'Google Meet',
    },
    entryPoints: [
      {
        entryPointType: 'video',
        uri: space.meetLink,
        label: code ? `meet.google.com/${code}` : space.meetLink,
      },
    ],
  };
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

      const meetingCode =
        typeof data.meetingCode === 'string' && data.meetingCode.trim()
          ? data.meetingCode.trim()
          : meetingCodeFromLink(meetLink);

      this.logger.log(
        `[GoogleMeet] space created name=${spaceName || '-'} code=${meetingCode || '-'} link=${meetLink} accessType=OPEN`,
      );
      return { meetLink, spaceName, meetingCode };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[GoogleMeet] createSpace error: ${message}`);
      return null;
    }
  }

  /**
   * Événement Calendar (primary) + Meet OPEN.
   * spaces.create (accessType OPEN) puis events.insert avec ce lien
   * (pas de createRequest, qui impose la salle d’attente).
   * Ne throw jamais.
   */
  async createEventWithMeet(
    input: CreateEventWithMeetInput,
  ): Promise<CreateEventWithMeetResult | null> {
    try {
      const base = this.eventBody(input);
      if (!base) return null;

      const space = await this.createSpace();
      if (space) {
        const withConference = await this.insertEvent({
          ...base,
          location: space.meetLink,
          conferenceData: conferenceDataForSpace(space),
        });
        if (withConference?.id) {
          this.warnIfCalendarRewroteLink(withConference, space.meetLink);
          this.logger.log(
            `[GoogleMeet] calendar event created id=${withConference.id} link=${space.meetLink} accessType=OPEN attendees=${input.attendeeEmails.length}`,
          );
          return {
            meetLink: space.meetLink,
            eventId: withConference.id,
            spaceName: space.spaceName || null,
          };
        }

        this.logger.warn(
          '[GoogleMeet] events.insert a refusé le conferenceData OPEN ; nouvel essai avec location = lien Meet.',
        );
        const withLocation = await this.insertEvent({
          ...base,
          location: space.meetLink,
        });
        if (withLocation?.id) {
          this.logger.log(
            `[GoogleMeet] calendar event created id=${withLocation.id} link=${space.meetLink} (location only, space OPEN)`,
          );
          return {
            meetLink: space.meetLink,
            eventId: withLocation.id,
            spaceName: space.spaceName || null,
          };
        }
      }

      this.logger.warn(
        '[GoogleMeet] space OPEN indisponible ; repli createRequest puis spaces.patch accessType=OPEN.',
      );
      const created = await this.insertEvent({
        ...base,
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      });
      const eventId = created?.id?.trim() ?? '';
      if (!eventId) {
        this.logger.error(
          '[GoogleMeet] createEventWithMeet: event id manquant',
        );
        return null;
      }

      let meetLink = extractMeetLink(created);
      if (!meetLink) {
        meetLink = await this.fetchMeetLink(eventId);
      }
      if (!meetLink) {
        this.logger.error(
          `[GoogleMeet] createEventWithMeet: meet link manquant eventId=${eventId}`,
        );
        return null;
      }

      await this.trySetAccessOpen(meetLink);
      this.logger.log(
        `[GoogleMeet] calendar event created id=${eventId} link=${meetLink} attendees=${input.attendeeEmails.length}`,
      );
      return { meetLink, eventId, spaceName: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[GoogleMeet] createEventWithMeet error: ${message}`);
      return null;
    }
  }

  /**
   * Met à jour un événement Calendar (start/end/summary/attendees).
   * Si regenerateConference : nouveau space OPEN, rattaché à l’événement.
   * Ne throw jamais.
   */
  async patchEvent(input: PatchEventInput): Promise<PatchEventResult | null> {
    try {
      const base = this.eventBody(input);
      if (!base) return null;

      if (!input.regenerateConference) {
        const patched = await this.patchCalendarEvent(input.eventId, base);
        if (!patched) return null;
        this.logger.log(
          `[GoogleMeet] calendar event patched id=${input.eventId} regenerate=false`,
        );
        return {
          meetLink: extractMeetLink(patched) || null,
          spaceName: null,
        };
      }

      const space = await this.createSpace();
      if (space) {
        const patched = await this.patchCalendarEvent(input.eventId, {
          ...base,
          location: space.meetLink,
          conferenceData: conferenceDataForSpace(space),
        });
        if (patched) {
          this.warnIfCalendarRewroteLink(patched, space.meetLink);
        } else {
          this.logger.warn(
            `[GoogleMeet] patch conference OPEN refusé id=${input.eventId} ; mise à jour avec location uniquement.`,
          );
          const plain = await this.patchCalendarEvent(input.eventId, {
            ...base,
            location: space.meetLink,
          });
          if (!plain) return null;
        }
        this.logger.log(
          `[GoogleMeet] calendar event patched id=${input.eventId} regenerate=true link=${space.meetLink} accessType=OPEN`,
        );
        return {
          meetLink: space.meetLink,
          spaceName: space.spaceName || null,
        };
      }

      this.logger.warn(
        `[GoogleMeet] createSpace failed on regenerate id=${input.eventId} ; repli createRequest + spaces.patch OPEN.`,
      );
      const patched = await this.patchCalendarEvent(input.eventId, {
        ...base,
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      });
      if (!patched) return null;
      let meetLink = extractMeetLink(patched) || null;
      if (!meetLink) {
        meetLink = (await this.fetchMeetLink(input.eventId)) || null;
      }
      if (meetLink) {
        await this.trySetAccessOpen(meetLink);
      }
      this.logger.log(
        `[GoogleMeet] calendar event patched id=${input.eventId} regenerate=true link=${meetLink ?? '-'}`,
      );
      return { meetLink, spaceName: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[GoogleMeet] patchEvent error id=${input.eventId}: ${message}`,
      );
      return null;
    }
  }

  private eventBody(input: {
    title: string;
    contactName: string;
    meetingDateIso: string;
    durationMinutes: number;
    attendeeEmails: string[];
  }): calendar_v3.Schema$Event | null {
    const window = toCasaWindow(input.meetingDateIso, input.durationMinutes);
    if (!window) {
      this.logger.error(
        `[GoogleMeet] date invalide iso=${input.meetingDateIso}`,
      );
      return null;
    }
    const startIso = window.start.toISO({ suppressMilliseconds: true });
    const endIso = window.end.toISO({ suppressMilliseconds: true });
    if (!startIso || !endIso) {
      this.logger.error('[GoogleMeet] toISO failed');
      return null;
    }
    return {
      summary: `${input.title} — ${input.contactName}`,
      start: { dateTime: startIso, timeZone: CASABLANCA_TZ },
      end: { dateTime: endIso, timeZone: CASABLANCA_TZ },
      attendees: input.attendeeEmails.map((email) => ({ email })),
    };
  }

  private async insertEvent(
    requestBody: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event | null> {
    try {
      const res = await this.calendar().events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        sendUpdates: 'all',
        requestBody,
      });
      const id = typeof res.data.id === 'string' ? res.data.id.trim() : '';
      if (!id) return null;
      return { ...res.data, id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[GoogleMeet] events.insert failed: ${message}`);
      return null;
    }
  }

  private async patchCalendarEvent(
    eventId: string,
    requestBody: calendar_v3.Schema$Event,
  ): Promise<calendar_v3.Schema$Event | null> {
    try {
      const res = await this.calendar().events.patch({
        calendarId: 'primary',
        eventId,
        conferenceDataVersion: requestBody.conferenceData ? 1 : undefined,
        sendUpdates: 'all',
        requestBody,
      });
      return res.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[GoogleMeet] events.patch failed id=${eventId}: ${message}`,
      );
      return null;
    }
  }

  private async fetchMeetLink(eventId: string): Promise<string> {
    try {
      const got = await this.calendar().events.get({
        calendarId: 'primary',
        eventId,
      });
      return extractMeetLink(got.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[GoogleMeet] events.get failed id=${eventId}: ${message}`,
      );
      return '';
    }
  }

  private warnIfCalendarRewroteLink(
    event: calendar_v3.Schema$Event,
    openLink: string,
  ): void {
    const returned = extractMeetLink(event);
    if (returned && returned !== openLink) {
      this.logger.warn(
        `[GoogleMeet] Calendar a renvoyé ${returned} au lieu du space OPEN ${openLink}. Le lien stocké reste le space OPEN.`,
      );
    }
  }

  /**
   * spaces.get par meeting code, puis spaces.patch accessType=OPEN.
   * Échoue pour un Meet né d’un createRequest Calendar : le scope
   * meetings.space.created ne peut modifier que les spaces créés par cette app.
   * meetings.space.settings serait requis, et peut quand même être refusé.
   * Ne throw jamais.
   */
  private async trySetAccessOpen(meetLink: string): Promise<boolean> {
    const code = meetingCodeFromLink(meetLink);
    if (!code) {
      this.logger.warn(
        `[GoogleMeet] spaces.patch OPEN ignoré : meeting code absent link=${meetLink}`,
      );
      return false;
    }

    try {
      const { token } = await this.oauth2.getAccessToken();
      if (!token) {
        this.logger.error(
          '[GoogleMeet] spaces.patch OPEN: access token manquant.',
        );
        return false;
      }

      const spaceName = `spaces/${code}`;
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      const got = await fetch(
        `https://meet.googleapis.com/v2/${spaceName}`,
        { headers },
      );
      const gotText = await got.text().catch(() => '');
      if (!got.ok) {
        this.logger.warn(
          `[GoogleMeet] spaces.get ${spaceName} failed status=${got.status} body=${gotText.slice(0, 500)}. ` +
            'Impossible de passer le Meet en OPEN. Scope actuel : meetings.space.created (spaces créés par cette app seulement). ' +
            'Un Meet issu de conferenceData.createRequest appartient à Calendar ; le modifier exige https://www.googleapis.com/auth/meetings.space.settings et un nouveau consentement. Lien conservé.',
        );
        return false;
      }

      const patched = await fetch(
        `https://meet.googleapis.com/v2/${spaceName}?updateMask=config.accessType,config.entryPointAccess`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            name: spaceName,
            config: { accessType: 'OPEN', entryPointAccess: 'ALL' },
          }),
        },
      );
      const patchedText = await patched.text().catch(() => '');
      if (!patched.ok) {
        this.logger.warn(
          `[GoogleMeet] spaces.patch OPEN failed status=${patched.status} space=${spaceName} body=${patchedText.slice(0, 500)}. ` +
            'Le refresh token a meetings.space.created, qui ne peut pas changer un space créé par Calendar. ' +
            'Scope manquant : https://www.googleapis.com/auth/meetings.space.settings. Lien conservé tel quel.',
        );
        return false;
      }

      this.logger.log(
        `[GoogleMeet] space patched OPEN name=${spaceName} entryPointAccess=ALL`,
      );
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[GoogleMeet] spaces.patch OPEN error code=${code}: ${message}. Lien conservé.`,
      );
      return false;
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
