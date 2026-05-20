import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AppUser } from '../auth/types/app-user';
import { SendDocumentEmailDto } from '../common/dto/send-document-email.dto';
import { MailerService } from '../common/mailer/mailer.service';
import { isAdminRole } from '../common/utils/roles';
import { SupabaseService } from '../supabase/supabase.service';
import type { FromDevisTransferDto } from './dto/from-devis-transfer.dto';
import type { FactureLineDto } from './dto/facture-line.dto';
import { UpsertFactureDto } from './dto/upsert-facture.dto';
import { renderFacturePdf } from './facture.pdf';
import type { FactureLineComputed, FactureTotals } from './types/facture.types';

type FactureRow = {
  id: string;
  numero: string;
  status: string;
  societe_nom: string;
  societe_rc: string;
  societe_cnie: string;
  societe_ice: string;
  societe_tp: string;
  societe_adresse: string;
  societe_telephone: string;
  societe_email: string;
  client_nom: string;
  client_ice: string | null;
  client_email: string | null;
  client_telephone: string | null;
  date_emission: string;
  lignes: FactureLineComputed[];
  tva_taux: number;
  mention_tva: string;
  paiement_mode: string;
  paiement_banque: string;
  paiement_titulaire: string;
  paiement_rib: string;
  total_ht: number;
  montant_tva: number;
  total_ttc: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type DevisSourceRow = {
  id: string;
  societe_nom: string;
  societe_rc: string;
  societe_cnie: string;
  societe_ice: string;
  societe_tp: string;
  societe_adresse: string;
  societe_telephone: string;
  societe_email: string;
  client_nom: string;
  client_ice: string | null;
  client_email: string | null;
  client_telephone: string | null;
  date_emission: string;
  lignes: FactureLineComputed[];
  tva_taux: number;
  mention_tva: string;
  paiement_mode: string;
  paiement_banque: string;
  paiement_titulaire: string;
  paiement_rib: string;
  total_ht: number;
  montant_tva: number;
  total_ttc: number;
  created_by: string;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const TOTALS_EPS = 0.02;

function totalsNear(
  a: { totalHt: number; montantTva: number; totalTtc: number },
  b: { totalHt: number; montantTva: number; totalTtc: number },
  eps = TOTALS_EPS,
): boolean {
  return (
    Math.abs(a.totalHt - b.totalHt) <= eps &&
    Math.abs(a.montantTva - b.montantTva) <= eps &&
    Math.abs(a.totalTtc - b.totalTtc) <= eps
  );
}

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function normalizeFactureNumero(numero: string): string {
  if (numero.startsWith('FAC-')) return `FC-${numero.slice(4)}`;
  return numero;
}

@Injectable()
export class FacturesService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly mailer: MailerService,
  ) {}

  private hasNumero(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  async list(user: AppUser) {
    const sb = this.supabase.getClient();
    let query = sb
      .from('factures')
      .select(
        'id, numero, status, client_nom, client_ice, client_email, client_telephone, date_emission, total_ht, montant_tva, total_ttc, created_by',
      )
      .order('created_at', { ascending: false });

    if (!isAdminRole(user.role)) query = query.eq('created_by', user.id);

    const { data, error } = await query;
    if (error) throw new ConflictException({ message: error.message });

    return {
      items: (data ?? []).map((r) => ({
        id: String(r.id),
        numero: normalizeFactureNumero(String(r.numero)),
        status: String(r.status),
        clientNom: String(r.client_nom ?? ''),
        clientIce: String(r.client_ice ?? ''),
        clientEmail: String(r.client_email ?? ''),
        clientTelephone: String(r.client_telephone ?? ''),
        dateEmission: String(r.date_emission ?? ''),
        totals: {
          totalHt: Number(r.total_ht ?? 0),
          montantTva: Number(r.montant_tva ?? 0),
          totalTtc: Number(r.total_ttc ?? 0),
        },
      })),
    };
  }

  private buildLinesFromDtos(
    lines: Array<Pick<FactureLineDto, 'id' | 'titre' | 'description' | 'quantite' | 'prixUnitaireHt'>>,
  ): FactureLineComputed[] {
    return lines.map((l) => {
      const q = Number(l.quantite);
      const p = Number(l.prixUnitaireHt);
      const lineId = clean(l.id);
      return {
        id: lineId || randomUUID(),
        titre: clean(l.titre),
        description: clean(l.description),
        quantite: round2(q),
        prixUnitaireHt: round2(p),
        totalLigneHt: round2(q * p),
      };
    });
  }

  private totalsFromLinesAndTaux(
    lignes: FactureLineComputed[],
    tvaTaux: number,
  ): FactureTotals {
    const totalHt = round2(lignes.reduce((s, l) => s + l.totalLigneHt, 0));
    const montantTva = round2(totalHt * (tvaTaux / 100));
    const totalTtc = round2(totalHt + montantTva);
    return { totalHt, montantTva, totalTtc };
  }

  private compute(dto: UpsertFactureDto): {
    lignes: FactureLineComputed[];
    totals: FactureTotals;
  } {
    const lignes = this.buildLinesFromDtos(dto.lignes);
    const totals = this.totalsFromLinesAndTaux(lignes, round2(Number(dto.tvaTaux)));
    return { lignes, totals };
  }

  private async nextNumero(year: number): Promise<string> {
    const newPrefix = `FC-${year}-`;
    const oldPrefix = `FAC-${year}-`;
    const { data, error } = await this.supabase
      .getClient()
      .from('factures')
      .select('numero')
      .or(`numero.like.${newPrefix}%,numero.like.${oldPrefix}%`)
      .order('numero', { ascending: false })
      .limit(200);
    if (error) throw new ConflictException({ message: error.message });
    const maxN = (data ?? []).reduce((max, row) => {
      const parsed = Number(String(row.numero ?? '').slice(-4));
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    return `${newPrefix}${String(maxN + 1).padStart(4, '0')}`;
  }

  private ensureOwnership(row: FactureRow, user: AppUser): void {
    if (isAdminRole(user.role)) return;
    if (row.created_by !== user.id) throw new ForbiddenException({ message: 'Interdit' });
  }

  private ensureDevisOwnership(row: DevisSourceRow, user: AppUser): void {
    if (isAdminRole(user.role)) return;
    if (row.created_by !== user.id) throw new ForbiddenException({ message: 'Interdit' });
  }

  private async byIdOr404(id: string): Promise<FactureRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from('factures')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) throw new NotFoundException({ message: 'facture introuvable' });
    return data as FactureRow;
  }

  private async devisByIdOr404(id: string): Promise<DevisSourceRow> {
    const { data, error } = await this.supabase
      .getClient()
      .from('devis')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) throw new NotFoundException({ message: 'devis introuvable' });
    return data as DevisSourceRow;
  }

  private async ensureNumero(row: FactureRow): Promise<FactureRow> {
    if (this.hasNumero(row.numero)) return row;

    const year = new Date(row.date_emission || new Date().toISOString()).getUTCFullYear();
    const numero = await this.nextNumero(year);
    const { data, error } = await this.supabase
      .getClient()
      .from('factures')
      .update({ numero, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('*')
      .single();

    if (error || !data || !this.hasNumero((data as FactureRow).numero)) {
      throw new ConflictException({
        message: 'Impossible de générer un numéro de facture valide.',
      });
    }
    return data as FactureRow;
  }

  async create(dto: UpsertFactureDto, user: AppUser) {
    const { lignes, totals } = this.compute(dto);
    const year = new Date(dto.dateEmission).getUTCFullYear();
    let lastError: string | null = null;

    for (let i = 0; i < 3; i++) {
      const numero = await this.nextNumero(year);
      const payload = {
        numero,
        status: 'draft',
        societe_nom: clean(dto.societeNom),
        societe_rc: clean(dto.societeRc),
        societe_cnie: clean(dto.societeCnie),
        societe_ice: clean(dto.societeIce),
        societe_tp: clean(dto.societeTp),
        societe_adresse: clean(dto.societeAdresse),
        societe_telephone: clean(dto.societeTelephone),
        societe_email: clean(dto.societeEmail),
        client_nom: clean(dto.clientNom),
        client_ice: clean(dto.clientIce) || null,
        client_email: clean(dto.clientEmail) || null,
        client_telephone: clean(dto.clientTelephone) || null,
        date_emission: dto.dateEmission,
        lignes,
        tva_taux: round2(Number(dto.tvaTaux)),
        mention_tva: clean(dto.mentionTva),
        paiement_mode: clean(dto.paiementMode),
        paiement_banque: clean(dto.paiementBanque),
        paiement_titulaire: clean(dto.paiementTitulaire),
        paiement_rib: clean(dto.paiementRib),
        total_ht: totals.totalHt,
        montant_tva: totals.montantTva,
        total_ttc: totals.totalTtc,
        created_by: user.id,
      };
      const { data, error } = await this.supabase
        .getClient()
        .from('factures')
        .insert(payload)
        .select(
          'id, numero, status, client_nom, client_ice, client_email, client_telephone, date_emission, total_ht, montant_tva, total_ttc',
        )
        .single();
      if (!error && data) {
        const row = await this.ensureNumero({
          ...(data as unknown as FactureRow),
          date_emission: data.date_emission as string,
        });
        return {
          id: row.id,
          numero: normalizeFactureNumero(row.numero),
          status: row.status,
          clientNom: row.client_nom,
          clientIce: row.client_ice ?? '',
          clientEmail: row.client_email ?? '',
          clientTelephone: row.client_telephone ?? '',
          dateEmission: row.date_emission,
          totals: {
            totalHt: Number(row.total_ht),
            montantTva: Number(row.montant_tva),
            totalTtc: Number(row.total_ttc),
          },
        };
      }
      lastError = error?.message ?? 'Erreur création facture';
      if (!lastError.toLowerCase().includes('duplicate')) break;
    }
    throw new ConflictException({ message: lastError ?? 'conflit numéro' });
  }

  async fromDevis(devisId: string, user: AppUser, transfer?: FromDevisTransferDto) {
    const devis = await this.devisByIdOr404(devisId);
    this.ensureDevisOwnership(devis, user);

    const year = new Date(devis.date_emission || new Date().toISOString()).getUTCFullYear();
    let lastError: string | null = null;

    const transferLines = transfer?.lignes;
    const hasExplicitLines =
      Array.isArray(transferLines) && transferLines.length > 0;
    const hasEmptyExplicitLines = Array.isArray(transferLines) && transferLines.length === 0;

    let payloadLignes: FactureLineComputed[] = devis.lignes;
    let tvaTauxFacture = round2(Number(devis.tva_taux));

    let totalHt = round2(Number(devis.total_ht));
    let montantTva = round2(Number(devis.montant_tva));
    let totalTtc = round2(Number(devis.total_ttc));

    if (hasExplicitLines) {
      payloadLignes = this.buildLinesFromDtos(transferLines!);
      tvaTauxFacture =
        transfer!.tvaTaux !== undefined && transfer!.tvaTaux !== null
          ? round2(Number(transfer!.tvaTaux))
          : round2(Number(devis.tva_taux));
      const computed = this.totalsFromLinesAndTaux(payloadLignes, tvaTauxFacture);
      if (transfer?.totals) {
        if (!totalsNear(computed, transfer.totals)) {
          throw new BadRequestException({
            message:
              'Les totaux ne correspondent pas au recalcul à partir des lignes et du taux de TVA.',
          });
        }
      }
      totalHt = computed.totalHt;
      montantTva = computed.montantTva;
      totalTtc = computed.totalTtc;
    } else if (hasEmptyExplicitLines) {
      payloadLignes = [];
      tvaTauxFacture =
        transfer?.tvaTaux !== undefined && transfer?.tvaTaux !== null
          ? round2(Number(transfer.tvaTaux))
          : round2(Number(devis.tva_taux));
      if (!transfer?.totals) {
        throw new BadRequestException({
          message: 'totals est requis lorsque lignes est un tableau vide.',
        });
      }
      totalHt = round2(Number(transfer.totals.totalHt));
      montantTva = round2(Number(transfer.totals.montantTva));
      totalTtc = round2(Number(transfer.totals.totalTtc));
    } else if (transfer?.totals) {
      totalHt = round2(Number(transfer.totals.totalHt));
      montantTva = round2(Number(transfer.totals.montantTva));
      totalTtc = round2(Number(transfer.totals.totalTtc));
    }

    for (let i = 0; i < 3; i++) {
      const numero = await this.nextNumero(year);
      const payload = {
        numero,
        status: 'draft',
        societe_nom: clean(devis.societe_nom),
        societe_rc: clean(devis.societe_rc),
        societe_cnie: clean(devis.societe_cnie),
        societe_ice: clean(devis.societe_ice),
        societe_tp: clean(devis.societe_tp),
        societe_adresse: clean(devis.societe_adresse),
        societe_telephone: clean(devis.societe_telephone),
        societe_email: clean(devis.societe_email),
        client_nom: clean(devis.client_nom),
        client_ice: clean(devis.client_ice) || null,
        client_email: clean(devis.client_email) || null,
        client_telephone: clean(devis.client_telephone) || null,
        date_emission: devis.date_emission,
        lignes: payloadLignes,
        tva_taux: tvaTauxFacture,
        mention_tva: clean(devis.mention_tva),
        paiement_mode: clean(devis.paiement_mode),
        paiement_banque: clean(devis.paiement_banque),
        paiement_titulaire: clean(devis.paiement_titulaire),
        paiement_rib: clean(devis.paiement_rib),
        total_ht: totalHt,
        montant_tva: montantTva,
        total_ttc: totalTtc,
        created_by: devis.created_by,
      };

      const { data, error } = await this.supabase
        .getClient()
        .from('factures')
        .insert(payload)
        .select(
          'id, numero, status, client_nom, client_ice, client_email, client_telephone, date_emission, total_ht, montant_tva, total_ttc',
        )
        .single();

      if (!error && data) {
        return {
          id: data.id,
          numero: normalizeFactureNumero(String(data.numero)),
          status: data.status,
          clientNom: data.client_nom,
          clientIce: data.client_ice ?? '',
          clientEmail: data.client_email ?? '',
          clientTelephone: data.client_telephone ?? '',
          dateEmission: data.date_emission,
          lignes: payloadLignes,
          tvaTaux: tvaTauxFacture,
          totals: {
            totalHt: Number(data.total_ht),
            montantTva: Number(data.montant_tva),
            totalTtc: Number(data.total_ttc),
          },
        };
      }

      lastError = error?.message ?? 'Erreur conversion devis vers facture';
      if (!lastError.toLowerCase().includes('duplicate')) break;
    }

    throw new ConflictException({ message: lastError ?? 'conversion refusée' });
  }

  async getById(id: string, user: AppUser) {
    let row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    row = await this.ensureNumero(row);
    return {
      id: row.id,
      numero: normalizeFactureNumero(row.numero),
      status: row.status,
      societeNom: row.societe_nom,
      societeRc: row.societe_rc,
      societeCnie: row.societe_cnie,
      societeIce: row.societe_ice,
      societeTp: row.societe_tp,
      societeAdresse: row.societe_adresse,
      societeTelephone: row.societe_telephone,
      societeEmail: row.societe_email,
      clientNom: row.client_nom,
      clientIce: row.client_ice ?? '',
      clientEmail: row.client_email ?? '',
      clientTelephone: row.client_telephone ?? '',
      dateEmission: row.date_emission,
      lignes: row.lignes,
      tvaTaux: Number(row.tva_taux),
      mentionTva: row.mention_tva,
      paiementMode: row.paiement_mode,
      paiementBanque: row.paiement_banque,
      paiementTitulaire: row.paiement_titulaire,
      paiementRib: row.paiement_rib,
      totals: {
        totalHt: Number(row.total_ht),
        montantTva: Number(row.montant_tva),
        totalTtc: Number(row.total_ttc),
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async patch(id: string, dto: UpsertFactureDto, user: AppUser) {
    const existingRow = await this.byIdOr404(id);
    this.ensureOwnership(existingRow, user);
    const { lignes, totals } = this.compute(dto);
    const { data, error } = await this.supabase
      .getClient()
      .from('factures')
      .update({
        societe_nom: clean(dto.societeNom),
        societe_rc: clean(dto.societeRc),
        societe_cnie: clean(dto.societeCnie),
        societe_ice: clean(dto.societeIce),
        societe_tp: clean(dto.societeTp),
        societe_adresse: clean(dto.societeAdresse),
        societe_telephone: clean(dto.societeTelephone),
        societe_email: clean(dto.societeEmail),
        client_nom: clean(dto.clientNom),
        client_ice: clean(dto.clientIce) || null,
        client_email: clean(dto.clientEmail) || null,
        client_telephone: clean(dto.clientTelephone) || null,
        date_emission: dto.dateEmission,
        lignes,
        tva_taux: round2(Number(dto.tvaTaux)),
        mention_tva: clean(dto.mentionTva),
        paiement_mode: clean(dto.paiementMode),
        paiement_banque: clean(dto.paiementBanque),
        paiement_titulaire: clean(dto.paiementTitulaire),
        paiement_rib: clean(dto.paiementRib),
        total_ht: totals.totalHt,
        montant_tva: totals.montantTva,
        total_ttc: totals.totalTtc,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        'id, numero, status, client_nom, client_ice, client_email, client_telephone, date_emission, total_ht, montant_tva, total_ttc',
      )
      .single();
    if (error || !data)
      throw new ConflictException({ message: error?.message ?? 'update refusé' });
    const row = await this.ensureNumero({
      ...(data as unknown as FactureRow),
      date_emission: data.date_emission as string,
    });
    return {
      id: row.id,
      numero: normalizeFactureNumero(row.numero),
      status: row.status,
      clientNom: row.client_nom,
      clientIce: row.client_ice ?? '',
      clientEmail: row.client_email ?? '',
      clientTelephone: row.client_telephone ?? '',
      dateEmission: row.date_emission,
      totals: {
        totalHt: Number(row.total_ht),
        montantTva: Number(row.montant_tva),
        totalTtc: Number(row.total_ttc),
      },
    };
  }

  async remove(id: string, user: AppUser) {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    const { error } = await this.supabase.getClient().from('factures').delete().eq('id', id);
    if (error) {
      const msg = error.message ?? 'Suppression impossible';
      if (msg.toLowerCase().includes('foreign key') || msg.toLowerCase().includes('constraint')) {
        throw new ConflictException({
          message: 'Suppression impossible: cette facture est déjà liée à une autre ressource.',
        });
      }
      throw new ConflictException({ message: msg });
    }
    return { message: 'Facture supprimée.' };
  }

  async buildPdf(id: string, user: AppUser): Promise<Buffer> {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    return renderFacturePdf({
      numero: normalizeFactureNumero(row.numero),
      dateEmission: row.date_emission,
      societeNom: row.societe_nom,
      societeRc: row.societe_rc,
      societeCnie: row.societe_cnie,
      societeIce: row.societe_ice,
      societeTp: row.societe_tp,
      societeAdresse: row.societe_adresse,
      societeTelephone: row.societe_telephone,
      societeEmail: row.societe_email,
      clientNom: row.client_nom,
      clientIce: row.client_ice ?? '',
      lignes: row.lignes,
      mentionTva: row.mention_tva,
      paiementMode: row.paiement_mode,
      paiementBanque: row.paiement_banque,
      paiementTitulaire: row.paiement_titulaire,
      paiementRib: row.paiement_rib,
      tvaTaux: Number(row.tva_taux),
      totalHt: Number(row.total_ht),
      montantTva: Number(row.montant_tva),
      totalTtc: Number(row.total_ttc),
    });
  }

  async sendEmail(id: string, dto: SendDocumentEmailDto, user: AppUser) {
    const entity = await this.getById(id, user);
    const pdf = await this.buildPdf(id, user);
    const filename = `facture-${entity.numero}.pdf`;

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
