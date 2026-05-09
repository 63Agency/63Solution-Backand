import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
};

@Injectable()
export class MailerService {
  constructor(private readonly config: ConfigService) {}

  private createTransport() {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const portRaw = this.config.get<string>('SMTP_PORT')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const pass = this.config.get<string>('SMTP_PASS')?.trim();

    if (!host || !portRaw || !user || !pass) {
      throw new InternalServerErrorException({
        message: 'Configuration SMTP manquante (SMTP_HOST/PORT/USER/PASS).',
      });
    }

    const port = Number(portRaw);
    if (!Number.isFinite(port) || port <= 0) {
      throw new InternalServerErrorException({
        message: 'SMTP_PORT invalide.',
      });
    }

    const secure = this.config.get<string>('SMTP_SECURE') === 'true' || port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  private fromAddress(): string {
    const from = this.config.get<string>('SMTP_FROM');
    if (from && from.trim()) return from.trim();
    const fallbackUser = this.config.get<string>('SMTP_USER');
    if (fallbackUser && fallbackUser.trim()) return fallbackUser.trim();
    throw new InternalServerErrorException({
      message: 'Configuration SMTP_FROM manquante.',
    });
  }

  async sendMail(input: SendMailInput): Promise<{ messageId: string; sentAt: string }> {
    try {
      const transport = this.createTransport();
      const info = await transport.sendMail({
        from: this.fromAddress(),
        to: input.to,
        subject: input.subject,
        text: input.text,
        attachments: input.attachments,
      });
      return {
        messageId: String(info.messageId || ''),
        sentAt: new Date().toISOString(),
      };
    } catch (error) {
      const err = error as Error;
      throw new InternalServerErrorException({
        message: err.message || "Échec d'envoi de l'email.",
      });
    }
  }
}
