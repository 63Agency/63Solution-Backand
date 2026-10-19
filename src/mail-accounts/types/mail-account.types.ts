export type UserMailAccountRow = {
  id: string;
  user_id: string;
  email: string;
  from_name: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  username: string;
  password_enc: string;
  active: boolean;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Public API shape — never includes password / password_enc. */
export type UserMailAccountPublic = {
  id: string;
  email: string;
  fromName: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  active: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MailAccountGetResponse =
  | { configured: true; account: UserMailAccountPublic }
  | { configured: false };

export type MailProbeResult = {
  ok: boolean;
  error?: string;
};

export type MailAccountTestResponse = {
  smtp: MailProbeResult;
  imap: MailProbeResult;
};

export const MAIL_ACCOUNT_SELECT =
  'id, user_id, email, from_name, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, password_enc, active, last_sync_at, created_at, updated_at';

export const MAIL_ACCOUNT_PUBLIC_SELECT =
  'id, user_id, email, from_name, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, imap_secure, username, active, last_sync_at, created_at, updated_at';
