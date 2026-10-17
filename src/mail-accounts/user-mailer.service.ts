import { ConflictException, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { decrypt } from '../common/crypto/mail-crypto';
import { SupabaseService } from '../supabase/supabase.service';
import type { UserMailAccountRow } from './types/mail-account.types';
import { MAIL_ACCOUNT_SELECT } from './types/mail-account.types';

export type UserMailTransport = {
  transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  fromEmail: string;
  fromName: string | null;
};

@Injectable()
export class UserMailerService {
  private readonly logger = new Logger(UserMailerService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Transporteur SMTP de la boîte personnelle (user_mail_accounts).
   * 409 si absente ou inactive.
   */
  async getTransporterForUser(userId: string): Promise<UserMailTransport> {
    const { data, error } = await this.supabase
      .getClient()
      .from('user_mail_accounts')
      .select(MAIL_ACCOUNT_SELECT)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const row = (data as UserMailAccountRow | null) ?? null;
    if (!row || row.active === false) {
      throw new ConflictException({ message: 'Boîte mail non connectée' });
    }

    let password: string;
    try {
      password = decrypt(row.password_enc);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Mail decrypt failed user=${userId}: ${message}`,
      );
      throw new ConflictException({
        message: 'Boîte mail non connectée (mot de passe illisible).',
      });
    }

    const transporter = nodemailer.createTransport({
      host: String(row.smtp_host),
      port: Number(row.smtp_port) || 465,
      secure: Boolean(row.smtp_secure),
      auth: {
        user: String(row.username),
        pass: password,
      },
    });

    return {
      transporter,
      fromEmail: String(row.email).trim(),
      fromName: row.from_name ? String(row.from_name).trim() : null,
    };
  }
}
