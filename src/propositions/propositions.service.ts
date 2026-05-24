import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AppUser } from '../auth/types/app-user';
import { isAdminRole } from '../common/utils/roles';
import { SupabaseService } from '../supabase/supabase.service';
import { SendDocumentEmailDto } from '../common/dto/send-document-email.dto';
import { MailerService } from '../common/mailer/mailer.service';
import { UpsertPropositionDto } from './dto/upsert-proposition.dto';
import { renderPropositionPdf } from './proposition.pdf';
import { normalizeSection2Campagnes } from './normalize-section2';
import type {
  PropositionContact,
  PropositionEmetteur,
  PropositionIntroduction,
  PropositionPayload,
  PropositionStatus,
  PropositionStrategie,
  PropositionTarifs,
} from './types/proposition.types';

type PropositionRow = {
  id: string;
  numero: string;
  status: string;
  titre_proposition: string;
  prepare_pour: string;
  nom_etablissement: string;
  prepare_par: string;
  date_emission: string;
  client_nom: string | null;
  client_ice: string | null;
  client_email: string | null;
  client_telephone: string | null;
  emetteur: PropositionEmetteur;
  introduction: PropositionIntroduction;
  strategie: PropositionStrategie;
  tarifs: PropositionTarifs;
  pourquoi_choisir: string[];
  prochaines_etapes: string;
  contact: PropositionContact;
  created_by: string;
  created_at: string;
  updated_at: string;
};

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function normalizeNumero(numero: string): string {
  return clean(numero);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

@Injectable()
export class PropositionsService {
  private readonly logger = new Logger(PropositionsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly mailer: MailerService,
  ) {}

  private toSummary(row: {
    id: string;
    numero: string;
    status: string;
    titre_proposition: string;
    nom_etablissement: string;
    prepare_pour: string;
    date_emission: string;
    created_at: string;
  }) {
    return {
      id: row.id,
      numero: normalizeNumero(String(row.numero)),
      titreProposition: String(row.titre_proposition ?? ''),
      nomEtablissement: String(row.nom_etablissement ?? ''),
      preparePour: String(row.prepare_pour ?? ''),
      status: String(row.status ?? 'draft'),
      dateEmission: String(row.date_emission ?? ''),
      createdAt: String(row.created_at ?? ''),
    };
  }

  private resolveClientNames(dto: UpsertPropositionDto): {
    clientNom: string;
    nomEtablissement: string;
  } {
    const clientNom = clean(dto.clientNom) || clean(dto.nomEtablissement);
    if (!clientNom) {
      throw new BadRequestException({
        message: 'clientNom ou nomEtablissement requis',
      });
    }
    const nomEtablissement = clean(dto.nomEtablissement) || clientNom;
    return { clientNom, nomEtablissement };
  }

  private ensureOwnership(row: PropositionRow, user: AppUser): void {
    if (isAdminRole(user.role)) return;
    if (row.created_by !== user.id) {
      throw new ForbiddenException({ message: 'Interdit' });
    }
  }

  private async byIdOr404(id: string): Promise<PropositionRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from('propositions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      throw new NotFoundException({ message: 'proposition introuvable' });
    }
    return data as PropositionRow;
  }

  /** Accepte un uuid ou un numéro officiel (ex. PROP-2026-011). */
  private async resolveRefToId(ref: string, user: AppUser): Promise<string> {
    const raw = clean(ref);
    if (!raw) {
      throw new BadRequestException({ message: 'id ou numero requis' });
    }
    if (isUuid(raw)) return raw;

    const numero = normalizeNumero(raw);
    let query = this.supabase
      .getClient()
      .from('propositions')
      .select('id, created_by')
      .eq('numero', numero);
    if (!isAdminRole(user.role)) {
      query = query.eq('created_by', user.id);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new ConflictException({ message: error.message });
    }
    if (!data?.id) {
      throw new NotFoundException({
        message: `proposition introuvable (${numero})`,
      });
    }
    return String(data.id);
  }

  private normalizeStrategie(strategie: PropositionStrategie): PropositionStrategie {
    return {
      ...strategie,
      section2CampagnesPublicitaires: normalizeSection2Campagnes(
        strategie.section2CampagnesPublicitaires,
      ),
    };
  }

  private rowToPayload(row: PropositionRow): PropositionPayload & {
    id: string;
    numero: string;
    status: PropositionStatus;
    createdAt: string;
    updatedAt: string;
  } {
    const clientNom =
      clean(row.client_nom) || clean(row.nom_etablissement);
    return {
      id: row.id,
      numero: normalizeNumero(row.numero),
      status: row.status as PropositionStatus,
      titreProposition: row.titre_proposition,
      preparePour: row.prepare_pour,
      clientNom,
      nomEtablissement: row.nom_etablissement,
      preparePar: row.prepare_par,
      dateEmission: row.date_emission,
      propositionNumero: normalizeNumero(row.numero),
      clientIce: row.client_ice ?? undefined,
      clientEmail: row.client_email ?? undefined,
      clientTelephone: row.client_telephone ?? undefined,
      emetteur: row.emetteur,
      introduction: row.introduction,
      strategie: this.normalizeStrategie(row.strategie),
      tarifs: row.tarifs,
      pourquoiChoisir: row.pourquoi_choisir ?? [],
      prochainesEtapes: row.prochaines_etapes,
      contact: row.contact,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private dtoToDb(
    dto: UpsertPropositionDto,
    names: { clientNom: string; nomEtablissement: string },
  ) {
    return {
      titre_proposition: clean(dto.titreProposition),
      prepare_pour: clean(dto.preparePour),
      nom_etablissement: names.nomEtablissement,
      client_nom: names.clientNom,
      client_ice: clean(dto.clientIce) || null,
      prepare_par: clean(dto.preparePar),
      date_emission: dto.dateEmission,
      client_email: clean(dto.clientEmail) || null,
      client_telephone: clean(dto.clientTelephone) || null,
      emetteur: dto.emetteur,
      introduction: dto.introduction,
      strategie: this.normalizeStrategie(dto.strategie as PropositionStrategie),
      tarifs: dto.tarifs,
      pourquoi_choisir: dto.pourquoiChoisir ?? [],
      prochaines_etapes: clean(dto.prochainesEtapes),
      contact: dto.contact,
    };
  }

  private async nextNumero(year: number): Promise<string> {
    const prefix = `PROP-${year}-`;
    const { data, error } = await this.supabase
      .getClient()
      .from('propositions')
      .select('numero')
      .like('numero', `${prefix}%`)
      .order('numero', { ascending: false })
      .limit(200);
    if (error) {
      throw new ConflictException({ message: error.message });
    }
    const maxN = (data ?? []).reduce((max, row) => {
      const parsed = Number(String(row.numero ?? '').slice(-3));
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    return `${prefix}${String(maxN + 1).padStart(3, '0')}`;
  }

  private async pickNumero(
    dto: UpsertPropositionDto,
    year: number,
  ): Promise<string> {
    const proposed = clean(dto.propositionNumero);
    if (proposed.length > 0) return proposed;
    return this.nextNumero(year);
  }

  async list(user: AppUser) {
    let query = this.supabase
      .getClient()
      .from('propositions')
      .select(
        'id, numero, status, titre_proposition, nom_etablissement, client_nom, prepare_pour, date_emission, created_at',
      )
      .order('created_at', { ascending: false });

    if (!isAdminRole(user.role)) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    return (data ?? []).map((r) => {
      const clientNom =
        clean(String(r.client_nom ?? '')) ||
        String(r.nom_etablissement ?? '');
      return {
      id: String(r.id),
      numero: normalizeNumero(String(r.numero)),
      titreProposition: String(r.titre_proposition ?? ''),
      nomEtablissement: String(r.nom_etablissement ?? ''),
      clientNom,
      preparePour: String(r.prepare_pour ?? ''),
      status: String(r.status ?? 'draft'),
      dateEmission: String(r.date_emission ?? ''),
      createdAt: String(r.created_at ?? ''),
    };
    });
  }

  async create(dto: UpsertPropositionDto, user: AppUser) {
    const names = this.resolveClientNames(dto);
    const year = new Date(dto.dateEmission).getUTCFullYear();
    const fields = this.dtoToDb(dto, names);
    let lastError: string | null = null;

    for (let i = 0; i < 3; i++) {
      const numero = await this.pickNumero(dto, year);
      const payload = {
        numero,
        status: 'draft',
        ...fields,
        created_by: user.id,
      };
      const { data, error } = await this.supabase
        .getClient()
        .from('propositions')
        .insert(payload)
        .select(
          'id, numero, status, titre_proposition, nom_etablissement, prepare_pour, date_emission, created_at',
        )
        .single();

      if (!error && data) {
        return this.toSummary(data);
      }
      lastError = error?.message ?? 'Erreur création proposition';
      if (!lastError.toLowerCase().includes('duplicate')) break;
    }
    throw new ConflictException({ message: lastError ?? 'conflit numéro' });
  }

  async getById(id: string, user: AppUser) {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    return this.rowToPayload(row);
  }

  async patch(id: string, dto: UpsertPropositionDto, user: AppUser) {
    const existing = await this.byIdOr404(id);
    this.ensureOwnership(existing, user);
    const names = this.resolveClientNames(dto);
    const fields = this.dtoToDb(dto, names);

    const { data, error } = await this.supabase
      .getClient()
      .from('propositions')
      .update({
        ...fields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, numero, status, titre_proposition, nom_etablissement, prepare_pour, date_emission, created_at',
      )
      .single();

    if (error || !data) {
      throw new ConflictException({
        message: error?.message ?? 'update refusé',
      });
    }

    return this.toSummary(data);
  }

  async remove(ref: string, user: AppUser) {
    const raw = clean(ref);
    this.logger.log(`remove proposition ref=${raw} user=${user.id}`);

    let id: string;
    try {
      id = await this.resolveRefToId(ref, user);
    } catch (e) {
      if (e instanceof NotFoundException) {
        this.logger.warn(
          `remove ${raw}: introuvable en base (id localStorage obsolète ou déjà supprimée)`,
        );
        return {
          message: 'Proposition introuvable (déjà supprimée ou jamais enregistrée).',
          id: isUuid(raw) ? raw : '',
          numero: isUuid(raw) ? '' : normalizeNumero(raw),
        };
      }
      throw e;
    }

    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);

    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('propositions')
      .delete()
      .eq('id', id)
      .select('id, numero');

    if (error) {
      const msg = error.message ?? 'Suppression impossible';
      this.logger.warn(`delete proposition ${id}: ${msg}`);
      if (
        msg.toLowerCase().includes('foreign key') ||
        msg.toLowerCase().includes('constraint')
      ) {
        throw new ConflictException({
          message:
            'Suppression impossible: cette proposition est liée à une autre ressource.',
        });
      }
      throw new ConflictException({ message: msg });
    }

    const deleted = data?.[0];
    if (!deleted?.id) {
      this.logger.warn(
        `delete proposition ${id}: 0 ligne supprimée (RLS ou clé Supabase ?)`,
      );
      throw new ConflictException({
        message:
          'Suppression impossible: aucune ligne supprimée en base. Exécutez sql/013-propositions-rls-service.sql et vérifiez SUPABASE_SERVICE_ROLE_KEY.',
      });
    }

    const { data: stillThere } = await sb
      .from('propositions')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (stillThere?.id) {
      this.logger.error(
        `delete proposition ${id}: la ligne existe encore après DELETE`,
      );
      throw new ConflictException({
        message:
          'Suppression refusée par Supabase (RLS). Exécutez sql/013-propositions-rls-service.sql dans le SQL Editor.',
      });
    }

    this.logger.log(
      `proposition supprimée id=${deleted.id} numero=${deleted.numero}`,
    );
    return {
      message: 'Proposition supprimée.',
      id: String(deleted.id),
      numero: String(deleted.numero ?? ''),
    };
  }

  async buildPdf(id: string, user: AppUser): Promise<Buffer> {
    const entity = await this.getById(id, user);
    const { id: _id, status: _s, createdAt: _c, updatedAt: _u, ...payload } =
      entity;
    return renderPropositionPdf({
      ...payload,
      numero: entity.numero,
    });
  }

  async sendEmail(id: string, dto: SendDocumentEmailDto, user: AppUser) {
    const entity = await this.getById(id, user);
    const pdf = await this.buildPdf(id, user);
    const filename = `proposition-${entity.numero}.pdf`;

    const sent = await this.mailer.sendMail({
      to: dto.to,
      subject: dto.subject,
      text: dto.message,
      attachments: [
        {
          filename,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });

    return {
      success: true,
      messageId: sent.messageId,
      sentAt: sent.sentAt,
    };
  }
}
