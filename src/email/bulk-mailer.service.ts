import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

type BulkSendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Dedicated SMTP for /email/broadcast only (info@63agency.ma).
 * Completely independent from MailerService (SMTP_* / Contact63@…).
 * Never falls back to SMTP_* — missing BULK_SMTP_* fails loudly.
 *
 * Deliverability: SPF / DKIM / DMARC must be set on 63agency.ma —
 * Nest does not manage DNS.
 */
@Injectable()
export class BulkMailerService {
  private readonly logger = new Logger(BulkMailerService.name);

  constructor(private readonly config: ConfigService) {}

  private requireBulkConfig(): {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
  } {
    const host = this.config.get<string>('BULK_SMTP_HOST')?.trim();
    const portRaw = this.config.get<string>('BULK_SMTP_PORT')?.trim();
    const user = this.config.get<string>('BULK_SMTP_USER')?.trim();
    const pass = this.config.get<string>('BULK_SMTP_PASS')?.trim();
    const fromName =
      this.config.get<string>('BULK_FROM_NAME')?.trim() || '63 Agency';

    if (!host || !portRaw || !user || !pass) {
      this.logger.error('[BulkEmail] BULK_SMTP_* not configured');
      throw new InternalServerErrorException({
        message:
          'Configuration BULK_SMTP_* manquante (BULK_SMTP_HOST/PORT/USER/PASS).',
      });
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
      this.logger.error('[BulkEmail] BULK_SMTP_* not configured');
      throw new InternalServerErrorException({
        message: 'BULK_SMTP_PORT invalide.',
      });
    }

    const secure =
      this.config.get<string>('BULK_SMTP_SECURE') === 'true' || port === 465;

    return { host, port, secure, user, pass, fromName };
  }

  private createTransport(): nodemailer.Transporter<SMTPTransport.SentMessageInfo> {
    const { host, port, secure, user, pass } = this.requireBulkConfig();
    // Independent transport — never reads SMTP_HOST / SMTP_USER / SMTP_PASS.
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  private fromAddress(user: string, fromName: string): string {
    const safe = fromName.replace(/["\\]/g, '');
    return `"${safe}" <${user}>`;
  }

  async sendMail(
    input: BulkSendMailInput,
  ): Promise<{ messageId: string; sentAt: string }> {
    const { user, fromName } = this.requireBulkConfig();
    const transport = this.createTransport();

    try {
      const info = await transport.sendMail({
        from: this.fromAddress(user, fromName),
        replyTo: user,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      return {
        messageId: String(info.messageId || ''),
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const err = error as Error;
      // Do not log credentials / pass.
      throw new InternalServerErrorException({
        message: err.message || "Échec d'envoi de l'email bulk.",
      });
    }
  }
}
