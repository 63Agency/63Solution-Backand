import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import type { AppUser } from '../auth/types/app-user';
import { decrypt, encrypt } from '../common/crypto/mail-crypto';
import { SupabaseService } from '../supabase/supabase.service';
import type { TestMailAccountDto } from './dto/test-mail-account.dto';
import type { UpsertMailAccountDto } from './dto/upsert-mail-account.dto';
import type {
  MailAccountGetResponse,
  MailAccountTestResponse,
  MailProbeResult,
  UserMailAccountPublic,
  UserMailAccountRow,
} from './types/mail-account.types';
import {
  MAIL_ACCOUNT_PUBLIC_SELECT,
  MAIL_ACCOUNT_SELECT,
} from './types/mail-account.types';

type ProbeCreds = {
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  username: string;
  password: string;
};

function clean(v: string | null | undefined): string {
  return String(v ?? '').trim();
}

function mapPublic(row: UserMailAccountRow): UserMailAccountPublic {
  return {
    id: String(row.id),
    email: String(row.email),
    fromName: row.from_name != null ? String(row.from_name) : null,
    smtpHost: String(row.smtp_host),
    smtpPort: Number(row.smtp_port),
    smtpSecure: Boolean(row.smtp_secure),
    imapHost: String(row.imap_host),
    imapPort: Number(row.imap_port),
    imapSecure: Boolean(row.imap_secure),
    username: String(row.username),
    active: Boolean(row.active),
    lastSyncAt: row.last_sync_at ? String(row.last_sync_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

@Injectable()
export class MailAccountsService {
  private readonly logger = new Logger(MailAccountsService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async getMine(user: AppUser): Promise<MailAccountGetResponse> {
    const row = await this.findRowByUserId(user.id, false);
    if (!row) {
      return { configured: false };
    }
    return { configured: true, ...mapPublic(row) };
  }

  async upsertMine(
    user: AppUser,
    dto: UpsertMailAccountDto,
  ): Promise<MailAccountGetResponse> {
    const existing = await this.findRowByUserId(user.id, true);
    const passwordPlain = clean(dto.password);

    let passwordEnc: string;
    if (passwordPlain) {
      try {
        passwordEnc = encrypt(passwordPlain);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException({ message });
      }
    } else if (existing?.password_enc) {
      passwordEnc = existing.password_enc;
    } else {
      throw new BadRequestException({
        message: 'password requis pour créer le compte mail.',
      });
    }

    const now = new Date().toISOString();
    const payload = {
      user_id: user.id,
      email: clean(dto.email).toLowerCase(),
      from_name: clean(dto.from_name) || null,
      smtp_host: clean(dto.smtp_host),
      smtp_port: Number(dto.smtp_port) || 465,
      smtp_secure: dto.smtp_secure !== false,
      imap_host: clean(dto.imap_host),
      imap_port: Number(dto.imap_port) || 993,
      imap_secure: dto.imap_secure !== false,
      username: clean(dto.username),
      password_enc: passwordEnc,
      active: true,
      updated_at: now,
      ...(existing ? {} : { created_at: now }),
    };

    const { data, error } = await this.supabase
      .getClient()
      .from('user_mail_accounts')
      .upsert(payload, { onConflict: 'user_id' })
      .select(MAIL_ACCOUNT_PUBLIC_SELECT)
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Enregistrement du compte mail impossible',
      });
    }

    this.logger.log(`Mail account upserted user=${user.id}`);
    return {
      configured: true,
      ...mapPublic(data as UserMailAccountRow),
    };
  }

  async deleteMine(user: AppUser): Promise<{ ok: true }> {
    const { error } = await this.supabase
      .getClient()
      .from('user_mail_accounts')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      throw new ConflictException({ message: error.message });
    }

    this.logger.log(`Mail account deleted user=${user.id}`);
    return { ok: true };
  }

  async testMine(
    user: AppUser,
    dto: TestMailAccountDto,
  ): Promise<MailAccountTestResponse> {
    const creds = await this.resolveProbeCreds(user, dto);
    const [smtp, imap] = await Promise.all([
      this.probeSmtp(creds),
      this.probeImap(creds),
    ]);
    return { smtp, imap };
  }

  private async resolveProbeCreds(
    user: AppUser,
    dto: TestMailAccountDto,
  ): Promise<ProbeCreds> {
    const stored = await this.findRowByUserId(user.id, true);

    const email = clean(dto.email) || (stored ? String(stored.email) : '');
    const smtp_host =
      clean(dto.smtp_host) || (stored ? String(stored.smtp_host) : '');
    const imap_host =
      clean(dto.imap_host) || (stored ? String(stored.imap_host) : '');
    const username =
      clean(dto.username) || (stored ? String(stored.username) : '');

    let password = clean(dto.password);
    if (!password && stored?.password_enc) {
      try {
        password = decrypt(stored.password_enc);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new BadRequestException({
          message: `Impossible de déchiffrer le mot de passe stocké : ${message}`,
        });
      }
    }

    if (!email || !smtp_host || !imap_host || !username || !password) {
      throw new BadRequestException({
        message:
          'Credentials incomplets : fournissez le body ou configurez d’abord /me/mail-account.',
      });
    }

    return {
      email,
      smtp_host,
      smtp_port:
        dto.smtp_port != null
          ? Number(dto.smtp_port)
          : stored
            ? Number(stored.smtp_port)
            : 465,
      smtp_secure:
        dto.smtp_secure != null
          ? Boolean(dto.smtp_secure)
          : stored
            ? Boolean(stored.smtp_secure)
            : true,
      imap_host,
      imap_port:
        dto.imap_port != null
          ? Number(dto.imap_port)
          : stored
            ? Number(stored.imap_port)
            : 993,
      imap_secure:
        dto.imap_secure != null
          ? Boolean(dto.imap_secure)
          : stored
            ? Boolean(stored.imap_secure)
            : true,
      username,
      password,
    };
  }

  private async probeSmtp(creds: ProbeCreds): Promise<MailProbeResult> {
    try {
      const transport = nodemailer.createTransport({
        host: creds.smtp_host,
        port: creds.smtp_port,
        secure: creds.smtp_secure,
        auth: { user: creds.username, pass: creds.password },
      });
      await transport.verify();
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP probe failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  private async probeImap(creds: ProbeCreds): Promise<MailProbeResult> {
    const client = new ImapFlow({
      host: creds.imap_host,
      port: creds.imap_port,
      secure: creds.imap_secure,
      auth: { user: creds.username, pass: creds.password },
      logger: false,
    });

    try {
      await client.connect();
      try {
        await client.logout();
      } catch {
        // ignore logout errors after successful connect
      }
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`IMAP probe failed: ${message}`);
      try {
        client.close();
      } catch {
        // ignore
      }
      return { ok: false, error: message };
    }
  }

  private async findRowByUserId(
    userId: string,
    includePassword: boolean,
  ): Promise<UserMailAccountRow | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from('user_mail_accounts')
      .select(includePassword ? MAIL_ACCOUNT_SELECT : MAIL_ACCOUNT_PUBLIC_SELECT)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return (data as UserMailAccountRow | null) ?? null;
  }
}
