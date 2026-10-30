import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { encryptMetaToken } from '../common/crypto/meta-token-crypto';
import type { PortalClientUser } from '../client-auth/types/portal-client-user';
import { SupabaseService } from '../supabase/supabase.service';
import type { MetaCallbackDto } from './dto/meta-callback.dto';
import type { UpdateMetaFormDto } from './dto/update-meta-form.dto';
import { MetaGraphService } from './meta-graph.service';
import { MetaOauthStateStore } from './meta-oauth-state.store';
import { META_OAUTH_SCOPES } from './portal-meta.constants';

const CONNECTIONS = 'portal.meta_connections';
const PAGES = 'portal.meta_pages';
const FORMS = 'portal.meta_forms';

@Injectable()
export class PortalMetaService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly graph: MetaGraphService,
    private readonly oauthState: MetaOauthStateStore,
  ) {}

  private clientId(user: PortalClientUser): string {
    return user.clientId;
  }

  getConnectUrl(user: PortalClientUser) {
    this.graph.assertConfigured();
    const clientId = this.clientId(user);
    const state = this.oauthState.create(clientId);
    const scope = META_OAUTH_SCOPES.join(',');
    return { url: this.graph.buildDialogUrl(state, scope) };
  }

  async handleCallback(dto: MetaCallbackDto, user: PortalClientUser) {
    const clientId = this.clientId(user);
    if (!this.oauthState.consume(dto.state, clientId)) {
      throw new ForbiddenException({
        message: 'State OAuth invalide ou expiré. Relancez la connexion Meta.',
      });
    }

    const short = await this.graph.exchangeCodeForUserToken(dto.code.trim());
    const longLived = await this.graph.exchangeForLongLivedToken(
      short.accessToken,
    );
    const fbUserId = await this.graph.getMeId(longLived.accessToken);

    const expiresIn = longLived.expiresIn ?? short.expiresIn;
    const tokenExpiresAt =
      expiresIn != null
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    const encUserToken = encryptMetaToken(longLived.accessToken);
    const connectionId = await this.upsertConnection({
      clientId,
      fbUserId,
      encUserToken,
      tokenExpiresAt,
    });

    const pages = await this.graph.listPages(longLived.accessToken);
    const pageSummaries: Array<{ page_id: string; page_name: string }> = [];
    const formSummaries: Array<{
      form_id: string;
      form_name: string;
      page_id: string;
      is_linked: boolean;
    }> = [];

    for (const page of pages) {
      await this.upsertPage({
        clientId,
        connectionId,
        pageId: page.id,
        pageName: page.name,
        encPageToken: encryptMetaToken(page.access_token),
      });
      pageSummaries.push({ page_id: page.id, page_name: page.name });

      const forms = await this.graph.listLeadForms(page.id, page.access_token);
      for (const form of forms) {
        const linked = await this.upsertForm({
          clientId,
          pageId: page.id,
          formId: form.id,
          formName: form.name,
        });
        formSummaries.push({
          form_id: form.id,
          form_name: form.name,
          page_id: page.id,
          is_linked: linked,
        });
      }
    }

    return {
      connected: true,
      pages: pageSummaries,
      forms: formSummaries,
    };
  }

  async status(user: PortalClientUser) {
    const clientId = this.clientId(user);

    const { data: conn, error: connErr } = await this.supabase
      .getClient()
      .from(CONNECTIONS)
      .select('id, fb_user_id, status')
      .eq('client_id', clientId)
      .maybeSingle();

    if (connErr) {
      throw new ConflictException({ message: connErr.message });
    }

    if (!conn) {
      return {
        connected: false,
        pages: [] as Array<{ page_id: string; page_name: string | null }>,
        forms: [] as Array<{
          form_id: string;
          form_name: string | null;
          page_id: string;
          is_linked: boolean;
        }>,
      };
    }

    const { data: pages, error: pagesErr } = await this.supabase
      .getClient()
      .from(PAGES)
      .select('page_id, page_name')
      .eq('client_id', clientId)
      .order('page_name', { ascending: true });

    if (pagesErr) {
      throw new ConflictException({ message: pagesErr.message });
    }

    const { data: forms, error: formsErr } = await this.supabase
      .getClient()
      .from(FORMS)
      .select('form_id, form_name, page_id, is_linked')
      .eq('client_id', clientId)
      .order('form_name', { ascending: true });

    if (formsErr) {
      throw new ConflictException({ message: formsErr.message });
    }

    return {
      connected: String(conn.status ?? '') === 'connected',
      fb_user_id: conn.fb_user_id != null ? String(conn.fb_user_id) : null,
      pages: ((pages ?? []) as Array<{ page_id: string; page_name: string | null }>).map(
        (p) => ({
          page_id: String(p.page_id),
          page_name: p.page_name != null ? String(p.page_name) : null,
        }),
      ),
      forms: ((forms ?? []) as Array<{
        form_id: string;
        form_name: string | null;
        page_id: string;
        is_linked: boolean;
      }>).map((f) => ({
        form_id: String(f.form_id),
        form_name: f.form_name != null ? String(f.form_name) : null,
        page_id: String(f.page_id),
        is_linked: Boolean(f.is_linked),
      })),
    };
  }

  async setFormLinked(
    formId: string,
    dto: UpdateMetaFormDto,
    user: PortalClientUser,
  ) {
    const clientId = this.clientId(user);

    const { data, error } = await this.supabase
      .getClient()
      .from(FORMS)
      .update({ is_linked: dto.is_linked })
      .eq('client_id', clientId)
      .eq('form_id', formId)
      .select('form_id, form_name, page_id, is_linked')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({ message: 'Formulaire Meta introuvable.' });
    }

    return {
      form_id: String(data.form_id),
      form_name: data.form_name != null ? String(data.form_name) : null,
      page_id: String(data.page_id),
      is_linked: Boolean(data.is_linked),
    };
  }

  async disconnect(user: PortalClientUser): Promise<void> {
    const clientId = this.clientId(user);

    const { error: formsErr } = await this.supabase
      .getClient()
      .from(FORMS)
      .delete()
      .eq('client_id', clientId);

    if (formsErr) {
      throw new ConflictException({ message: formsErr.message });
    }

    // pages cascade via connection; delete connection (pages follow).
    const { data, error } = await this.supabase
      .getClient()
      .from(CONNECTIONS)
      .delete()
      .eq('client_id', clientId)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data) {
      throw new NotFoundException({
        message: 'Aucune connexion Meta à supprimer.',
      });
    }
  }

  private async upsertConnection(input: {
    clientId: string;
    fbUserId: string;
    encUserToken: string;
    tokenExpiresAt: string | null;
  }): Promise<string> {
    const { data: existing } = await this.supabase
      .getClient()
      .from(CONNECTIONS)
      .select('id')
      .eq('client_id', input.clientId)
      .maybeSingle();

    const now = new Date().toISOString();

    if (existing?.id) {
      const { data, error } = await this.supabase
        .getClient()
        .from(CONNECTIONS)
        .update({
          fb_user_id: input.fbUserId,
          user_access_token: input.encUserToken,
          token_expires_at: input.tokenExpiresAt,
          status: 'connected',
          updated_at: now,
        })
        .eq('id', existing.id)
        .eq('client_id', input.clientId)
        .select('id')
        .single();
      if (error || !data) {
        throw new ConflictException({
          message: error?.message ?? 'Mise à jour connexion Meta impossible.',
        });
      }
      return String(data.id);
    }

    const { data, error } = await this.supabase
      .getClient()
      .from(CONNECTIONS)
      .insert({
        client_id: input.clientId,
        fb_user_id: input.fbUserId,
        user_access_token: input.encUserToken,
        token_expires_at: input.tokenExpiresAt,
        status: 'connected',
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'Création connexion Meta impossible.',
      });
    }
    return String(data.id);
  }

  private async upsertPage(input: {
    clientId: string;
    connectionId: string;
    pageId: string;
    pageName: string;
    encPageToken: string;
  }): Promise<void> {
    const { data: existing } = await this.supabase
      .getClient()
      .from(PAGES)
      .select('id')
      .eq('client_id', input.clientId)
      .eq('page_id', input.pageId)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await this.supabase
        .getClient()
        .from(PAGES)
        .update({
          connection_id: input.connectionId,
          page_name: input.pageName,
          page_access_token: input.encPageToken,
        })
        .eq('id', existing.id)
        .eq('client_id', input.clientId);
      if (error) {
        throw new ConflictException({ message: error.message });
      }
      return;
    }

    const { error } = await this.supabase
      .getClient()
      .from(PAGES)
      .insert({
        client_id: input.clientId,
        connection_id: input.connectionId,
        page_id: input.pageId,
        page_name: input.pageName,
        page_access_token: input.encPageToken,
      });
    if (error) {
      throw new ConflictException({ message: error.message });
    }
  }

  /** Returns current is_linked after upsert (preserves existing). */
  private async upsertForm(input: {
    clientId: string;
    pageId: string;
    formId: string;
    formName: string;
  }): Promise<boolean> {
    const { data: existing } = await this.supabase
      .getClient()
      .from(FORMS)
      .select('id, is_linked')
      .eq('client_id', input.clientId)
      .eq('form_id', input.formId)
      .maybeSingle();

    if (existing?.id) {
      const { data, error } = await this.supabase
        .getClient()
        .from(FORMS)
        .update({
          page_id: input.pageId,
          form_name: input.formName,
        })
        .eq('id', existing.id)
        .eq('client_id', input.clientId)
        .select('is_linked')
        .single();
      if (error) {
        throw new ConflictException({ message: error.message });
      }
      return Boolean(data?.is_linked ?? existing.is_linked);
    }

    const { data, error } = await this.supabase
      .getClient()
      .from(FORMS)
      .insert({
        client_id: input.clientId,
        page_id: input.pageId,
        form_id: input.formId,
        form_name: input.formName,
        is_linked: false,
      })
      .select('is_linked')
      .single();

    if (error) {
      throw new ConflictException({ message: error.message });
    }
    return Boolean(data?.is_linked);
  }
}
