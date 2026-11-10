import { Injectable, Logger } from '@nestjs/common';
import { decryptMetaToken } from '../common/crypto/meta-token-crypto';
import { PortalLeadsService } from '../portal-leads/portal-leads.service';
import { SupabaseService } from '../supabase/supabase.service';
import { MetaGraphService } from './meta-graph.service';

const META_FORMS_TABLE = 'portal.meta_forms';
const META_PAGES_TABLE = 'portal.meta_pages';

type LeadgenValue = {
  leadgen_id?: string;
  form_id?: string;
  page_id?: string;
  created_time?: number | string;
  ad_id?: string;
  adgroup_id?: string;
};

type WebhookChange = {
  field?: string;
  value?: LeadgenValue;
};

type WebhookEntry = {
  id?: string;
  time?: number;
  changes?: WebhookChange[];
};

export type MetaLeadgenWebhookBody = {
  object?: string;
  entry?: WebhookEntry[];
};

@Injectable()
export class MetaWebhookService {
  private readonly logger = new Logger(MetaWebhookService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly graph: MetaGraphService,
    private readonly portalLeads: PortalLeadsService,
  ) {}

  async processWebhook(body: MetaLeadgenWebhookBody): Promise<void> {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== 'leadgen') continue;
        const value = change.value ?? {};
        try {
          await this.processLeadgen(value);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Meta leadgen skip leadgen_id=${value.leadgen_id ?? '?'} form_id=${value.form_id ?? '?'}: ${msg}`,
          );
        }
      }
    }
  }

  private async processLeadgen(value: LeadgenValue): Promise<void> {
    const leadgenId = String(value.leadgen_id ?? '').trim();
    const formId = String(value.form_id ?? '').trim();
    const pageIdFromEvent = String(value.page_id ?? '').trim();

    if (!leadgenId || !formId) {
      this.logger.warn('Meta leadgen event missing leadgen_id or form_id');
      return;
    }

    const form = await this.findLinkedForm(formId);
    if (!form) {
      // Not linked / unknown — ignore (not an error).
      this.logger.debug(
        `Meta leadgen ignored (form not linked) form_id=${formId}`,
      );
      return;
    }

    const pageId = pageIdFromEvent || form.page_id;
    const pageTokenEnc = await this.findPageToken(form.client_id, pageId);
    if (!pageTokenEnc) {
      this.logger.warn(
        `Meta leadgen: no page token client=${form.client_id} page=${pageId}`,
      );
      return;
    }

    let pageToken: string;
    try {
      pageToken = decryptMetaToken(pageTokenEnc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Meta leadgen: decrypt page token failed client=${form.client_id} page=${pageId}: ${msg}`,
      );
      return;
    }

    const details = await this.graph.getLeadgen(leadgenId, pageToken);
    const mapped = mapLeadFields(details.field_data ?? []);
    const campaign =
      (details.ad_name?.trim() || form.form_name?.trim() || null) ?? null;
    const createdAt = normalizeCreatedAt(
      details.created_time ?? value.created_time,
    );

    const result = await this.portalLeads.createFromMetaLead({
      clientId: form.client_id,
      metaLeadId: leadgenId,
      metaFormId: formId,
      name: mapped.name,
      phone: mapped.phone,
      email: mapped.email,
      campaign,
      createdAt,
    });

    this.logger.log(
      `Meta leadgen ${result} leadgen_id=${leadgenId} client=${form.client_id} form=${formId}`,
    );
  }

  private async findLinkedForm(formId: string): Promise<{
    client_id: string;
    page_id: string;
    form_name: string | null;
  } | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from(META_FORMS_TABLE)
      .select('client_id, page_id, form_name, is_linked')
      .eq('form_id', formId)
      .eq('is_linked', true)
      .maybeSingle();

    if (error) {
      throw new Error(`meta_forms lookup: ${error.message}`);
    }
    if (!data?.client_id) return null;

    return {
      client_id: String(data.client_id),
      page_id: String(data.page_id ?? ''),
      form_name: data.form_name != null ? String(data.form_name) : null,
    };
  }

  private async findPageToken(
    clientId: string,
    pageId: string,
  ): Promise<string | null> {
    if (!pageId) return null;
    const { data, error } = await this.supabase
      .getClient()
      .from(META_PAGES_TABLE)
      .select('page_access_token')
      .eq('client_id', clientId)
      .eq('page_id', pageId)
      .maybeSingle();

    if (error) {
      throw new Error(`meta_pages lookup: ${error.message}`);
    }
    const token = data?.page_access_token;
    return token != null ? String(token) : null;
  }
}

function mapLeadFields(
  fieldData: Array<{ name?: string; values?: string[] }>,
): { name: string; email: string | null; phone: string | null } {
  const map = new Map<string, string>();
  for (const f of fieldData) {
    const key = String(f.name ?? '')
      .trim()
      .toLowerCase();
    const value = (f.values ?? [])
      .map((v) => String(v ?? '').trim())
      .find((v) => v.length > 0);
    if (key && value) map.set(key, value);
  }

  const first = map.get('first_name') ?? '';
  const last = map.get('last_name') ?? '';
  const composed = [first, last].filter(Boolean).join(' ').trim();
  const name =
    map.get('full_name') ||
    map.get('fullname') ||
    composed ||
    'Lead Meta';

  const email = map.get('email') || null;
  const phone =
    map.get('phone_number') ||
    map.get('phone') ||
    map.get('mobile_phone') ||
    map.get('mobile') ||
    null;

  return { name, email, phone };
}

function normalizeCreatedAt(
  raw: string | number | undefined | null,
): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Meta webhook created_time is often unix seconds.
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return new Date(ms).toISOString();
  }
  const s = String(raw).trim();
  if (!s) return null;
  // Graph often returns "YYYY-MM-DDTHH:mm:ss+0000" — Date.parse handles most.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}
