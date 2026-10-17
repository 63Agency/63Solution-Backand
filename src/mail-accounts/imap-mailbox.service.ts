import { createRequire } from 'node:module';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ImapFlow } from 'imapflow';
import type {
  FetchMessageObject,
  ListResponse,
  MessageAddressObject,
  MessageStructureObject,
  SearchObject,
} from 'imapflow';
import { simpleParser } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import { decrypt } from '../common/crypto/mail-crypto';
import { SupabaseService } from '../supabase/supabase.service';
import type { UserMailAccountRow } from './types/mail-account.types';
import { MAIL_ACCOUNT_SELECT } from './types/mail-account.types';
import { UserMailerService } from './user-mailer.service';

const nodeRequire = createRequire(__filename);
const MailComposer = nodeRequire('nodemailer/lib/mail-composer') as new (
  mail: Record<string, unknown>,
) => {
  compile: () => {
    build: (cb: (err: Error | null, buf: Buffer) => void) => void;
  };
};

const CONNECT_TIMEOUT_MS = 20_000;
const OP_TIMEOUT_MS = 40_000;
const SNIPPET_LEN = 140;

export type MailFolderItem = {
  path: string;
  name: string;
  specialUse?: string;
};

export type MailListItem = {
  uid: number;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  seen: boolean;
  snippet: string;
  hasAttachments: boolean;
};

export type MailListResponse = {
  items: MailListItem[];
  total: number;
  page: number;
  limit: number;
};

export type MailAttachmentMeta = {
  filename: string;
  contentType: string;
  size: number;
};

export type MailMessageDetail = {
  uid: number;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: MailAttachmentMeta[];
};

export type MailSendResult = {
  ok: true;
  messageId: string | null;
  appendedToSent: boolean;
};

@Injectable()
export class ImapMailboxService {
  private readonly logger = new Logger(ImapMailboxService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly userMailer: UserMailerService,
  ) {}

  async listFolders(userId: string): Promise<MailFolderItem[]> {
    return this.withClient(userId, async (client) => {
      const list = await client.list();
      return list.map((box) => this.mapFolder(box));
    });
  }

  async listMessages(
    userId: string,
    folder = 'INBOX',
    page = 1,
    limit = 30,
    search?: string,
  ): Promise<MailListResponse> {
    const safePage = Math.max(1, page || 1);
    const safeLimit = Math.min(50, Math.max(1, limit || 30));
    const mailbox = (folder || 'INBOX').trim() || 'INBOX';
    const term = (search ?? '').trim();

    return this.withClient(userId, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });
      const query: SearchObject = term
        ? { or: [{ subject: term }, { from: term }] }
        : { all: true };
      const found = await client.search(query, { uid: true });
      const uids = (Array.isArray(found) ? found : [])
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => b - a);

      const total = uids.length;
      const slice = uids.slice((safePage - 1) * safeLimit, safePage * safeLimit);
      const items: MailListItem[] = [];

      for (const uid of slice) {
        const msg = await client.fetchOne(
          String(uid),
          {
            envelope: true,
            flags: true,
            bodyStructure: true,
            source: { maxLength: 16_384 },
          },
          { uid: true },
        );
        if (!msg) continue;
        items.push(await this.mapListItem(uid, msg));
      }

      return { items, total, page: safePage, limit: safeLimit };
    });
  }

  async getMessage(
    userId: string,
    folder: string,
    uid: number,
  ): Promise<MailMessageDetail> {
    this.assertUid(uid);
    const mailbox = (folder || 'INBOX').trim() || 'INBOX';

    return this.withClient(userId, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });
      const msg = await client.fetchOne(
        String(uid),
        { source: true, envelope: true },
        { uid: true },
      );
      if (!msg || !msg.source) {
        throw new NotFoundException({ message: 'Message introuvable.' });
      }
      const parsed = await simpleParser(msg.source);
      return this.mapDetail(uid, parsed);
    });
  }

  async markSeen(userId: string, folder: string, uid: number): Promise<{ ok: true }> {
    this.assertUid(uid);
    const mailbox = (folder || 'INBOX').trim() || 'INBOX';

    await this.withClient(userId, async (client) => {
      await client.mailboxOpen(mailbox);
      const ok = await client.messageFlagsAdd(String(uid), ['\\Seen'], {
        uid: true,
      });
      if (!ok) {
        throw new NotFoundException({ message: 'Message introuvable.' });
      }
    });

    return { ok: true };
  }

  async send(
    userId: string,
    input: { to: string; subject: string; bodyHtml?: string; bodyText?: string },
  ): Promise<MailSendResult> {
    const toList = splitAddresses(input.to);
    if (toList.length === 0) {
      throw new BadRequestException({ message: 'to requis' });
    }
    const subject = input.subject.trim();
    if (!subject) {
      throw new BadRequestException({ message: 'subject requis' });
    }
    const bodies = resolveBodies(input.bodyHtml, input.bodyText);

    const { transporter, fromEmail, fromName } =
      await this.userMailer.getTransporterForUser(userId);
    const from = formatFrom(fromName, fromEmail);
    const raw = await buildRaw({
      from,
      to: toList.join(', '),
      subject,
      html: bodies.html,
      text: bodies.text,
    });

    let messageId: string | null = null;
    try {
      const info = await transporter.sendMail({
        envelope: { from: fromEmail, to: toList },
        raw,
      });
      messageId = info.messageId ? String(info.messageId) : null;
    } catch (err) {
      throw new BadGatewayException({
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const appendedToSent = await this.appendToSent(userId, raw);
    return { ok: true, messageId, appendedToSent };
  }

  async reply(
    userId: string,
    folder: string,
    uid: number,
    input: { bodyHtml?: string; bodyText?: string },
  ): Promise<MailSendResult> {
    this.assertUid(uid);
    const bodies = resolveBodies(input.bodyHtml, input.bodyText);
    const mailbox = (folder || 'INBOX').trim() || 'INBOX';

    const original = await this.withClient(userId, async (client) => {
      await client.mailboxOpen(mailbox, { readOnly: true });
      const msg = await client.fetchOne(
        String(uid),
        { envelope: true, headers: ['references', 'message-id'] },
        { uid: true },
      );
      if (!msg || !msg.envelope) {
        throw new NotFoundException({ message: 'Message introuvable.' });
      }
      const fromAddr = firstAddress(msg.envelope.from);
      if (!fromAddr) {
        throw new BadRequestException({
          message: 'Expéditeur du message d’origine introuvable.',
        });
      }
      const messageId = (msg.envelope.messageId || '').trim();
      const referencesHeader = headerValue(msg.headers, 'references');
      const subject = (msg.envelope.subject || '').trim();
      return { fromAddr, messageId, referencesHeader, subject };
    });

    const subject = /^re:/i.test(original.subject)
      ? original.subject
      : `Re: ${original.subject || '(sans objet)'}`;

    const references = [original.referencesHeader, original.messageId]
      .filter((p) => p && p.trim())
      .join(' ')
      .trim();

    const { transporter, fromEmail, fromName } =
      await this.userMailer.getTransporterForUser(userId);
    const from = formatFrom(fromName, fromEmail);
    const headers: Record<string, string> = {};
    if (original.messageId) {
      headers['In-Reply-To'] = original.messageId;
      headers.References = references || original.messageId;
    }

    const raw = await buildRaw({
      from,
      to: original.fromAddr,
      subject,
      html: bodies.html,
      text: bodies.text,
      headers: Object.keys(headers).length ? headers : undefined,
    });

    let messageId: string | null = null;
    try {
      const info = await transporter.sendMail({
        envelope: { from: fromEmail, to: [original.fromAddr] },
        raw,
      });
      messageId = info.messageId ? String(info.messageId) : null;
    } catch (err) {
      throw new BadGatewayException({
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const appendedToSent = await this.appendToSent(userId, raw);
    return { ok: true, messageId, appendedToSent };
  }

  /** IMAP client authentifié. 409 si boîte absente / inactive. */
  private async getClient(userId: string): Promise<ImapFlow> {
    const row = await this.loadAccount(userId);
    let password: string;
    try {
      password = decrypt(row.password_enc);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`IMAP decrypt failed user=${userId}: ${message}`);
      throw new ConflictException({
        message: 'Boîte mail non connectée',
      });
    }

    const client = new ImapFlow({
      host: String(row.imap_host),
      port: Number(row.imap_port) || 993,
      secure: row.imap_secure !== false,
      auth: { user: String(row.username), pass: password },
      logger: false,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });

    try {
      await client.connect();
      return client;
    } catch (err) {
      await this.closeClient(client);
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException({
        message: `Connexion IMAP impossible : ${message}`,
      });
    }
  }

  private async loadAccount(userId: string): Promise<UserMailAccountRow> {
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
    return row;
  }

  private async withClient<T>(
    userId: string,
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = await this.getClient(userId);
    try {
      return await withTimeout(fn(client), OP_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException({ message });
    } finally {
      await this.closeClient(client);
    }
  }

  private async closeClient(client: ImapFlow): Promise<void> {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        // ignore
      }
    }
  }

  private async appendToSent(userId: string, raw: Buffer): Promise<boolean> {
    try {
      return await this.withClient(userId, async (client) => {
        const sentPath = await this.resolveSentPath(client);
        if (!sentPath) return false;
        const appended = await client.append(sentPath, raw, ['\\Seen']);
        return Boolean(appended);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sent append failed user=${userId}: ${message}`);
      return false;
    }
  }

  private async resolveSentPath(client: ImapFlow): Promise<string | null> {
    const list = await client.list();
    const byUse = list.find((b) => b.specialUse === '\\Sent');
    if (byUse?.path) return byUse.path;
    const byName = list.find((b) => /^(sent|sent items|envoyés|envoyes)$/i.test(b.name));
    return byName?.path ?? null;
  }

  private mapFolder(box: ListResponse): MailFolderItem {
    const item: MailFolderItem = {
      path: box.path,
      name: box.name,
    };
    if (box.specialUse) item.specialUse = box.specialUse;
    return item;
  }

  private async mapListItem(
    uid: number,
    msg: FetchMessageObject,
  ): Promise<MailListItem> {
    const env = msg.envelope;
    let snippet = '';
    if (msg.source && msg.source.length > 0) {
      try {
        const parsed = await simpleParser(msg.source);
        snippet = snippetOf(parsed.text || '', htmlToText(parsed.html));
      } catch {
        snippet = '';
      }
    }
    const flags = msg.flags ?? new Set<string>();
    return {
      uid,
      from: formatAddressList(env?.from),
      to: formatAddressList(env?.to),
      subject: env?.subject?.trim() || '',
      date: toIso(env?.date),
      seen: flags.has('\\Seen'),
      snippet,
      hasAttachments: structureHasAttachment(msg.bodyStructure),
    };
  }

  private mapDetail(uid: number, parsed: ParsedMail): MailMessageDetail {
    const html =
      typeof parsed.html === 'string' && parsed.html.trim()
        ? parsed.html
        : null;
    const text =
      typeof parsed.text === 'string' && parsed.text.trim() ? parsed.text : null;
    return {
      uid,
      from: addressText(parsed.from),
      to: addressText(parsed.to),
      cc: addressText(parsed.cc),
      subject: parsed.subject?.trim() || '',
      date: parsed.date ? parsed.date.toISOString() : null,
      html,
      text,
      attachments: (parsed.attachments ?? []).map((a) => ({
        filename: a.filename || 'piece-jointe',
        contentType: a.contentType || 'application/octet-stream',
        size: typeof a.size === 'number' ? a.size : a.content?.length ?? 0,
      })),
    };
  }

  private assertUid(uid: number): void {
    if (!Number.isInteger(uid) || uid <= 0) {
      throw new BadRequestException({ message: 'uid invalide' });
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BadGatewayException({ message: 'Délai IMAP dépassé.' }));
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function buildRaw(mail: Record<string, unknown>): Promise<Buffer> {
  const composer = new MailComposer(mail);
  const compiled = composer.compile();
  return new Promise((resolve, reject) => {
    compiled.build((err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
}

function splitAddresses(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function resolveBodies(bodyHtml?: string, bodyText?: string): {
  html: string;
  text: string;
} {
  const htmlRaw = (bodyHtml ?? '').trim();
  const textRaw = (bodyText ?? '').trim();
  if (!htmlRaw && !textRaw) {
    throw new BadRequestException({
      message: 'bodyHtml ou bodyText requis.',
    });
  }
  const text = textRaw || htmlToText(htmlRaw);
  const html = htmlRaw || `<p>${escapeHtml(text).replace(/\n/g, '<br/>')}</p>`;
  return { html, text };
}

function formatFrom(fromName: string | null, fromEmail: string): string {
  const name = (fromName ?? '').replace(/["\\]/g, '').trim();
  if (!name) return fromEmail;
  return `"${name}" <${fromEmail}>`;
}

function formatAddressList(list?: MessageAddressObject[]): string {
  if (!list?.length) return '';
  return list
    .map((a) => {
      const addr = a.address?.trim() || '';
      const name = a.name?.trim() || '';
      if (name && addr) return `${name} <${addr}>`;
      return addr || name;
    })
    .filter(Boolean)
    .join(', ');
}

function firstAddress(list?: MessageAddressObject[]): string {
  const addr = list?.find((a) => a.address?.trim())?.address?.trim();
  return addr || '';
}

function addressText(
  value: ParsedMail['from'] | ParsedMail['to'],
): string {
  if (!value) return '';
  if (Array.isArray(value)) {
    return value.map((v) => v.text).filter(Boolean).join(', ');
  }
  return value.text || '';
}

function toIso(value: Date | string | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function snippetOf(text: string, htmlFallback: string): string {
  const raw = (text || htmlFallback).replace(/\s+/g, ' ').trim();
  if (raw.length <= SNIPPET_LEN) return raw;
  return raw.slice(0, SNIPPET_LEN);
}

function htmlToText(html: string | false | undefined): string {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function structureHasAttachment(node?: MessageStructureObject): boolean {
  if (!node) return false;
  const disp = String(node.disposition ?? '').toLowerCase();
  const filename =
    node.dispositionParameters?.filename ||
    node.parameters?.name ||
    '';
  if (disp === 'attachment' || (filename && disp !== 'inline')) return true;
  for (const child of node.childNodes ?? []) {
    if (structureHasAttachment(child)) return true;
  }
  return false;
}

function headerValue(buf: Buffer | undefined, name: string): string {
  if (!buf) return '';
  const text = buf.toString('utf8');
  const re = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\r?\\n\\S|$)`, 'im');
  const match = text.match(re);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}
