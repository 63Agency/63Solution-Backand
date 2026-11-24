import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';

const UNSUBSCRIBE_MAILTO = 'mailto:contact@63agency.ma?subject=unsubscribe';

@Injectable()
export class UnsubscribeService {
  private readonly logger = new Logger(UnsubscribeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {}

  private secret(): string {
    return this.config.get<string>('UNSUBSCRIBE_SECRET')?.trim() || '';
  }

  private publicApiUrl(): string {
    const raw =
      this.config.get<string>('PUBLIC_API_URL')?.trim() ||
      this.config.get<string>('API_PUBLIC_URL')?.trim() ||
      'https://api.63agency.com';
    return raw.replace(/\/+$/, '');
  }

  private sign(email: string): string {
    return createHmac('sha256', this.secret())
      .update(email)
      .digest('base64url');
  }

  /**
   * token = base64url(email) + '.' + HMAC-SHA256(email, UNSUBSCRIBE_SECRET) base64url
   */
  buildToken(email: string): string {
    const e = email.trim().toLowerCase();
    const secret = this.secret();
    if (!secret) {
      throw new ConflictException({
        message: 'UNSUBSCRIBE_SECRET manquant — envoi bulk impossible.',
      });
    }
    return `${Buffer.from(e, 'utf8').toString('base64url')}.${this.sign(e)}`;
  }

  buildUnsubscribeUrl(email: string): string {
    const token = this.buildToken(email);
    return `${this.publicApiUrl()}/email/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  verifyToken(token: string): string | null {
    const secret = this.secret();
    if (!secret || !token?.trim()) return null;
    const parts = token.trim().split('.');
    if (parts.length !== 2) return null;
    const [emailB64, sig] = parts;
    if (!emailB64 || !sig) return null;

    let email: string;
    try {
      email = Buffer.from(emailB64, 'base64url')
        .toString('utf8')
        .trim()
        .toLowerCase();
    } catch {
      return null;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

    const expected = this.sign(email);
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    } catch {
      return null;
    }
    return email;
  }

  async addUnsubscribe(
    email: string,
    source: string | null,
  ): Promise<void> {
    const e = email.trim().toLowerCase();
    if (!e) return;

    const { error } = await this.supabase
      .getClient()
      .from('email_unsubscribes')
      .upsert(
        {
          email: e,
          unsubscribed_at: new Date().toISOString(),
          source,
        },
        { onConflict: 'email' },
      );

    if (error) {
      this.logger.error(
        `[Unsubscribe] upsert failed email=${e}: ${error.message}`,
      );
      throw new ConflictException({
        message: error.message ?? 'Enregistrement du désabonnement impossible.',
      });
    }

    this.logger.log(`[Unsubscribe] added email=${e} source=${source || '-'}`);
  }

  /**
   * Retire les emails présents dans email_unsubscribes.
   * Fail-CLOSED : erreur DB → throw (ne pas envoyer).
   */
  async filterUnsubscribed(emails: string[]): Promise<string[]> {
    const unique = [
      ...new Set(
        emails.map((e) => e.trim().toLowerCase()).filter(Boolean),
      ),
    ];
    if (unique.length === 0) return [];

    const { data, error } = await this.supabase
      .getClient()
      .from('email_unsubscribes')
      .select('email')
      .in('email', unique);

    if (error) {
      this.logger.error(`[Unsubscribe] filter failed: ${error.message}`);
      throw new ConflictException({
        message:
          'Impossible de vérifier les désabonnements (table email_unsubscribes). Envoi annulé.',
      });
    }

    const blocked = new Set(
      (data ?? []).map((r) => String(r.email).toLowerCase()),
    );
    return unique.filter((e) => !blocked.has(e));
  }

  listUnsubscribeHeaders(url: string): Record<string, string> {
    return {
      'List-Unsubscribe': `<${url}>, <${UNSUBSCRIBE_MAILTO}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  /** Pied HTML — à placer en dernier (après la signature). */
  appendUnsubscribeFooter(html: string, url: string): string {
    const safeUrl = url.replace(/"/g, '&quot;');
    const footer = `<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px;" />
<p style="font-size:12px;color:#666;line-height:1.4;margin:0;">
  Si vous ne souhaitez plus recevoir ces emails,
  <a href="${safeUrl}" style="color:#666;text-decoration:underline;">cliquez ici pour vous désabonner</a>.
</p>`;
    return `${html}\n${footer}`;
  }

  appendUnsubscribeText(text: string, url: string): string {
    return `${text}\n\n---\nPour vous désabonner : ${url}`;
  }
}
