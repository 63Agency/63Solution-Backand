import {
  BadGatewayException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_META_SCOPES } from './portal-meta.constants';

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: { message?: string; type?: string; code?: number };
};

type GraphErrorBody = {
  error?: { message?: string; type?: string; code?: number };
};

@Injectable()
export class MetaGraphService {
  private readonly logger = new Logger(MetaGraphService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly graphVersion: string;
  private readonly graphBase: string;

  constructor(private readonly config: ConfigService) {
    this.appId = this.config.get<string>('META_APP_ID')?.trim() ?? '';
    this.appSecret =
      this.config.get<string>('META_APP_SECRET')?.trim() ?? '';
    this.redirectUri =
      this.config.get<string>('META_REDIRECT_URI')?.trim() ?? '';
    this.graphVersion =
      this.config.get<string>('META_GRAPH_VERSION')?.trim() || 'v21.0';
    this.graphBase = `https://graph.facebook.com/${this.graphVersion}`;

    if (!this.appId || !this.appSecret || !this.redirectUri) {
      this.logger.warn(
        'META_APP_ID / META_APP_SECRET / META_REDIRECT_URI incomplets — OAuth Meta indisponible.',
      );
    }
  }

  getAppId(): string {
    return this.appId;
  }

  getRedirectUri(): string {
    return this.redirectUri;
  }

  getGraphVersion(): string {
    return this.graphVersion;
  }

  /**
   * Scopes OAuth depuis META_SCOPES (comma-separated).
   * Défaut: public_profile,email — basculer vers pages_* + leads_retrieval une fois approuvés.
   */
  getScopes(): string {
    const raw = this.config.get<string>('META_SCOPES')?.trim();
    if (!raw) return DEFAULT_META_SCOPES;
    const scopes = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return scopes.length > 0 ? scopes.join(',') : DEFAULT_META_SCOPES;
  }

  assertConfigured(): void {
    if (!this.appId || !this.appSecret || !this.redirectUri) {
      throw new BadGatewayException({
        message:
          'Intégration Meta non configurée (META_APP_ID / META_APP_SECRET / META_REDIRECT_URI).',
      });
    }
  }

  buildDialogUrl(state: string, scope: string): string {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      state,
      scope,
      response_type: 'code',
    });
    return `https://www.facebook.com/${this.graphVersion}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForUserToken(code: string): Promise<{
    accessToken: string;
    expiresIn: number | null;
  }> {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.redirectUri,
      code,
    });
    const data = await this.getJson<TokenResponse>(
      `${this.graphBase}/oauth/access_token?${params.toString()}`,
    );
    if (!data.access_token) {
      throw new BadGatewayException({
        message: this.fbMessage(data) || 'Échange code Meta impossible.',
      });
    }
    return {
      accessToken: data.access_token,
      expiresIn:
        typeof data.expires_in === 'number' ? data.expires_in : null,
    };
  }

  async exchangeForLongLivedToken(shortToken: string): Promise<{
    accessToken: string;
    expiresIn: number | null;
  }> {
    this.assertConfigured();
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortToken,
    });
    const data = await this.getJson<TokenResponse>(
      `${this.graphBase}/oauth/access_token?${params.toString()}`,
    );
    if (!data.access_token) {
      throw new BadGatewayException({
        message:
          this.fbMessage(data) || 'Échange token longue durée Meta impossible.',
      });
    }
    return {
      accessToken: data.access_token,
      expiresIn:
        typeof data.expires_in === 'number' ? data.expires_in : null,
    };
  }

  async getMeId(userToken: string): Promise<string> {
    const data = await this.getJson<{ id?: string } & GraphErrorBody>(
      `${this.graphBase}/me?fields=id&access_token=${encodeURIComponent(userToken)}`,
    );
    if (!data.id) {
      throw new BadGatewayException({
        message: this.fbMessage(data) || 'Profil Facebook introuvable.',
      });
    }
    return String(data.id);
  }

  async listPages(userToken: string): Promise<
    Array<{ id: string; name: string; access_token: string }>
  > {
    const data = await this.getJson<{
      data?: Array<{
        id?: string;
        name?: string;
        access_token?: string;
      }>;
    } & GraphErrorBody>(
      `${this.graphBase}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    if (data.error) {
      throw new BadGatewayException({
        message: this.fbMessage(data) || 'Impossible de lister les Pages.',
      });
    }
    return (data.data ?? [])
      .filter((p) => p.id && p.access_token)
      .map((p) => ({
        id: String(p.id),
        name: String(p.name ?? ''),
        access_token: String(p.access_token),
      }));
  }

  async listLeadForms(
    pageId: string,
    pageToken: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await this.getJson<{
      data?: Array<{ id?: string; name?: string }>;
    } & GraphErrorBody>(
      `${this.graphBase}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name&access_token=${encodeURIComponent(pageToken)}`,
    );
    if (data.error) {
      this.logger.warn(
        `leadgen_forms page=${pageId}: ${this.fbMessage(data) ?? 'erreur'}`,
      );
      return [];
    }
    return (data.data ?? [])
      .filter((f) => f.id)
      .map((f) => ({
        id: String(f.id),
        name: String(f.name ?? ''),
      }));
  }

  private fbMessage(body: GraphErrorBody | TokenResponse): string | null {
    const msg = body.error?.message?.trim();
    return msg || null;
  }

  private async getJson<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Meta Graph network: ${m}`);
      throw new BadGatewayException({
        message: 'Impossible de joindre l’API Meta.',
      });
    }

    const raw = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok) {
      this.logger.warn(
        `Meta Graph HTTP ${res.status}: ${this.fbMessage(raw) ?? 'erreur'}`,
      );
      throw new BadGatewayException({
        message:
          this.fbMessage(raw) ||
          `Erreur Meta Graph (${res.status}).`,
      });
    }
    return raw;
  }
}
