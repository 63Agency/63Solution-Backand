import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

type MeetSpaceResult = {
  meetLink: string;
  spaceName: string;
};

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
}
