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

export type MetaPageRef = {
  id: string;
  name: string;
  access_token: string;
};

type GraphPageNode = {
  id?: string;
  name?: string;
  access_token?: string;
};

type GraphListResponse<T> = {
  data?: T[];
  paging?: { next?: string };
} & GraphErrorBody;

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
   * Doit inclure pages_manage_ads + business_management pour Pages BM + Lead Ads.
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

  /**
   * Découvre les Pages via Business Manager (owned_pages + client_pages),
   * avec fallback /me/accounts. Retourne uniquement les pages avec PAGE token.
   * Soft-fail par appel Graph (log + continue).
   */
  async discoverPages(userToken: string): Promise<MetaPageRef[]> {
    const byId = new Map<
      string,
      { id: string; name: string; access_token?: string }
    >();

    const merge = (nodes: GraphPageNode[], source: string) => {
      for (const p of nodes) {
        const id = p.id ? String(p.id) : '';
        if (!id) continue;
        const prev = byId.get(id);
        const name = String(p.name ?? prev?.name ?? '');
        const access_token =
          (p.access_token ? String(p.access_token) : undefined) ||
          prev?.access_token;
        byId.set(id, { id, name, access_token });
      }
      this.logger.log(
        `Meta discover ${source}: ${nodes.length} page(s) (map=${byId.size})`,
      );
    };

    const businesses = await this.listBusinesses(userToken);
    for (const biz of businesses) {
      try {
        const owned = await this.listBusinessPages(
          biz.id,
          'owned_pages',
          userToken,
        );
        merge(owned, `business=${biz.id}/owned_pages`);
      } catch (err) {
        this.logger.warn(
          `Meta discover owned_pages business=${biz.id}: ${this.errMsg(err)}`,
        );
      }
      try {
        const clientPages = await this.listBusinessPages(
          biz.id,
          'client_pages',
          userToken,
        );
        merge(clientPages, `business=${biz.id}/client_pages`);
      } catch (err) {
        this.logger.warn(
          `Meta discover client_pages business=${biz.id}: ${this.errMsg(err)}`,
        );
      }
    }

    try {
      const accounts = await this.listMeAccounts(userToken);
      merge(accounts, '/me/accounts');
    } catch (err) {
      this.logger.warn(`Meta discover /me/accounts: ${this.errMsg(err)}`);
    }

    const pages: MetaPageRef[] = [];
    for (const page of byId.values()) {
      let token = page.access_token?.trim() || '';
      if (!token) {
        token = (await this.fetchPageAccessToken(page.id, userToken)) ?? '';
      }
      if (!token) {
        this.logger.warn(
          `Meta discover page=${page.id}: pas de page access_token — skip.`,
        );
        continue;
      }
      pages.push({
        id: page.id,
        name: page.name || page.id,
        access_token: token,
      });
    }

    return pages;
  }

  /** @deprecated Prefer discoverPages — kept for callers that only need /me/accounts. */
  async listPages(userToken: string): Promise<MetaPageRef[]> {
    return this.discoverPages(userToken);
  }

  async listLeadForms(
    pageId: string,
    pageToken: string,
  ): Promise<Array<{ id: string; name: string; status: string | null }>> {
    const path = `${this.graphBase}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status`;
    const rows = await this.collectPaged<GraphPageNode & { status?: string }>(
      path,
      pageToken,
      `leadgen_forms page=${pageId}`,
    );
    return rows
      .filter((f) => f.id)
      .map((f) => ({
        id: String(f.id),
        name: String(f.name ?? ''),
        status: f.status != null ? String(f.status) : null,
      }));
  }

  private async listBusinesses(
    userToken: string,
  ): Promise<Array<{ id: string; name: string }>> {
    const path = `${this.graphBase}/me/businesses?fields=id,name`;
    const rows = await this.collectPaged<{ id?: string; name?: string }>(
      path,
      userToken,
      '/me/businesses',
    );
    return rows
      .filter((b) => b.id)
      .map((b) => ({ id: String(b.id), name: String(b.name ?? '') }));
  }

  private async listBusinessPages(
    businessId: string,
    edge: 'owned_pages' | 'client_pages',
    userToken: string,
  ): Promise<GraphPageNode[]> {
    const path = `${this.graphBase}/${encodeURIComponent(businessId)}/${edge}?fields=id,name,access_token`;
    return this.collectPaged<GraphPageNode>(
      path,
      userToken,
      `business=${businessId}/${edge}`,
    );
  }

  private async listMeAccounts(userToken: string): Promise<GraphPageNode[]> {
    const path = `${this.graphBase}/me/accounts?fields=id,name,access_token`;
    return this.collectPaged<GraphPageNode>(path, userToken, '/me/accounts');
  }

  private async fetchPageAccessToken(
    pageId: string,
    userToken: string,
  ): Promise<string | null> {
    const data = await this.getJsonSoft<{ access_token?: string } & GraphErrorBody>(
      `${this.graphBase}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
    );
    if (data.error || !data.access_token) {
      this.logger.warn(
        `Meta page token page=${pageId}: ${this.fbMessage(data) ?? 'absent'}`,
      );
      return null;
    }
    return String(data.access_token);
  }

  /**
   * Suit paging.next (URL absolue Facebook) jusqu’à épuisement.
   * Soft: en cas d’erreur Graph, log + retourne ce qui a déjà été collecté.
   */
  private async collectPaged<T>(
    firstUrlWithoutToken: string,
    accessToken: string,
    label: string,
  ): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = this.withAccessToken(
      firstUrlWithoutToken,
      accessToken,
    );
    let guard = 0;

    while (url && guard < 50) {
      guard += 1;
      const body = await this.getJsonSoft<GraphListResponse<T>>(url);
      if (body.error) {
        this.logger.warn(
          `Meta ${label}: ${this.fbMessage(body) ?? 'erreur Graph'}`,
        );
        break;
      }
      if (Array.isArray(body.data)) {
        items.push(...body.data);
      }
      const next = body.paging?.next?.trim();
      url = next || null;
    }

    return items;
  }

  private withAccessToken(url: string, accessToken: string): string {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}access_token=${encodeURIComponent(accessToken)}`;
  }

  private fbMessage(body: GraphErrorBody | TokenResponse): string | null {
    const msg = body.error?.message?.trim();
    return msg || null;
  }

  private errMsg(err: unknown): string {
    if (err instanceof BadGatewayException) {
      const res = err.getResponse();
      if (typeof res === 'object' && res && 'message' in res) {
        return String((res as { message?: unknown }).message ?? err.message);
      }
      return err.message;
    }
    return err instanceof Error ? err.message : String(err);
  }

  /** Strict: HTTP non-OK → BadGateway (OAuth / me). Ne log jamais le token. */
  private async getJson<T>(url: string): Promise<T> {
    const raw = await this.fetchJson<T & GraphErrorBody>(url);
    if (!raw.ok) {
      this.logger.warn(
        `Meta Graph HTTP ${raw.status}: ${this.fbMessage(raw.body) ?? 'erreur'}`,
      );
      throw new BadGatewayException({
        message:
          this.fbMessage(raw.body) ||
          `Erreur Meta Graph (${raw.status}).`,
      });
    }
    return raw.body;
  }

  /** Soft: retourne le body même si HTTP non-OK (discovery pages / forms). */
  private async getJsonSoft<T extends GraphErrorBody>(url: string): Promise<T> {
    const raw = await this.fetchJson<T>(url);
    if (!raw.ok && !raw.body.error) {
      (raw.body as GraphErrorBody).error = {
        message: `HTTP ${raw.status}`,
      };
    }
    return raw.body;
  }

  private async fetchJson<T>(
    url: string,
  ): Promise<{ ok: boolean; status: number; body: T }> {
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

    const body = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, body };
  }
}
