import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { withEmailSignature } from '../common/mailer/email-signature';
import { EmailTrackingService } from './email-tracking.service';
import { UnsubscribeService } from './unsubscribe.service';

type BulkSendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Headers SMTP (ex. List-Unsubscribe). */
  headers?: Record<string, string>;
  /**
   * Lien de désabonnement personnalisé.
   * Appendé APRÈS la signature 63 Agency.
   */
  unsubscribeUrl?: string;
  /** Pixel open-tracking — injecté en TOUT DERNIER (après signature + désabo). */
  trackingId?: string | null;
};

/**
 * Dedicated SMTP for /email/broadcast + WhatsApp dual-channel email.
 * Completely independent from MailerService (SMTP_* / Contact63@…).
 * Never falls back to SMTP_* — missing BULK_SMTP_* fails loudly.
 * Toujours append la signature 63 Agency (html + text), puis le pied désabo.
 */
@Injectable()
export class BulkMailerService {
  private readonly logger = new Logger(BulkMailerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly unsubscribe: UnsubscribeService,
    private readonly tracking: EmailTrackingService,
  ) {}

  private requireBulkConfig(): {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
  } {
    const host = this.config.get<string>('BULK_SMTP_HOST')?.trim();
    const portRaw = this.config.get<string>('BULK_SMTP_PORT')?.trim();
    const user = this.config.get<string>('BULK_SMTP_USER')?.trim();
    const pass = this.config.get<string>('BULK_SMTP_PASS')?.trim();
    const fromName =
      this.config.get<string>('BULK_FROM_NAME')?.trim() || '63 Agency';
    const fromEmail =
      this.config.get<string>('BULK_FROM_EMAIL')?.trim() || user || '';

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

    return { host, port, secure, user, pass, fromName, fromEmail };
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

  private fromAddress(fromEmail: string, fromName: string): string {
    const safe = fromName.replace(/["\\]/g, '');
    return `"${safe}" <${fromEmail}>`;
  }

  async sendMail(
    input: BulkSendMailInput,
  ): Promise<{ messageId: string; sentAt: string }> {
    const { fromName, fromEmail } = this.requireBulkConfig();
    const transport = this.createTransport();
    let { text, html } = withEmailSignature({
      text: input.text,
      html: input.html,
    });

    // Ordre : corps → signature → pied désabonnement → pixel (tout dernier).
    if (input.unsubscribeUrl) {
      if (html) {
        html = this.unsubscribe.appendUnsubscribeFooter(
          html,
          input.unsubscribeUrl,
        );
      }
      text = this.unsubscribe.appendUnsubscribeText(
        text,
        input.unsubscribeUrl,
      );
    }

    // Ordre final HTML : corps → signature → désabo → pixel (tout dernier).
    const trackingId = (input.trackingId ?? '').trim();
    if (trackingId) {
      html = this.tracking.ensureHtmlWithPixel(html, text, trackingId);
    } else {
      this.logger.warn(
        `[BulkEmail] send without open-tracking pixel to=${input.to}`,
      );
    }

    try {
      const info = await transport.sendMail({
        from: this.fromAddress(fromEmail, fromName),
        replyTo: fromEmail,
        to: input.to,
        subject: input.subject,
        text,
        html,
        headers: input.headers,
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
