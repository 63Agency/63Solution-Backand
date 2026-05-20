import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SendDocumentEmailDto } from '../common/dto/send-document-email.dto';
import { MailerService } from '../common/mailer/mailer.service';
import { SupabaseService } from '../supabase/supabase.service';
import type { AppUser } from '../auth/types/app-user';
import { isAdminRole } from '../common/utils/roles';
import { UpsertDevisDto } from './dto/upsert-devis.dto';
import type { DevisLineComputed, DevisTotals } from './types/devis.types';
import { renderDevisPdf } from './devis.pdf';

type DevisRow = {
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
  lignes: DevisLineComputed[];
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function normalizeDevisNumero(numero: string): string {
  if (numero.startsWith('DEV-')) return `DV-${numero.slice(4)}`;
  return numero;
}

@Injectable()
export class DevisService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly mailer: MailerService,
  ) {}

  async list(user: AppUser) {
    const sb = this.supabase.getClient();
    let query = sb
      .from('devis')
      .select(
        'id, numero, status, client_nom, client_ice, client_email, client_telephone, date_emission, total_ttc, created_by',
      )
      .order('created_at', { ascending: false });

    if (!isAdminRole(user.role)) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;
    if (error) {
      throw new ConflictException({ message: error.message });
    }

    const items = (data ?? []).map((r) => ({
      id: String(r.id),
      numero: normalizeDevisNumero(String(r.numero)),
      status: String(r.status),
      clientNom: String(r.client_nom ?? ''),
      clientIce: String(r.client_ice ?? ''),
      clientEmail: String(r.client_email ?? ''),
      clientTelephone: String(r.client_telephone ?? ''),
      dateEmission: String(r.date_emission ?? ''),
      totals: {
        totalTtc: Number(r.total_ttc ?? 0),
      },
    }));

    return { items };
  }

  private compute(dto: UpsertDevisDto): {
    lignes: DevisLineComputed[];
    totals: DevisTotals;
  } {
    const lignes = dto.lignes.map((l) => {
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
    const totalHt = round2(lignes.reduce((s, l) => s + l.totalLigneHt, 0));
    const montantTva = round2(totalHt * (Number(dto.tvaTaux) / 100));
    const totalTtc = round2(totalHt + montantTva);
    return { lignes, totals: { totalHt, montantTva, totalTtc } };
  }

  private async nextNumero(year: number): Promise<string> {
    const sb = this.supabase.getClient();
    const newPrefix = `DV-${year}-`;
    const oldPrefix = `DEV-${year}-`;
    const { data, error } = await sb
      .from('devis')
      .select('numero')
      .or(`numero.like.${newPrefix}%,numero.like.${oldPrefix}%`)
      .order('numero', { ascending: false })
      .limit(200);
    if (error) {
      throw new ConflictException({ message: error.message });
    }
    const maxN = (data ?? []).reduce((max, row) => {
      const parsed = Number(String(row.numero ?? '').slice(-4));
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
    }, 0);
    return `${newPrefix}${String(maxN + 1).padStart(4, '0')}`;
  }

  private ensureOwnership(row: DevisRow, user: AppUser): void {
    if (isAdminRole(user.role)) return;
    if (row.created_by !== user.id) {
      throw new ForbiddenException({ message: 'Interdit' });
    }
  }

  private async byIdOr404(id: string): Promise<DevisRow> {
    const sb = this.supabase.getClient();
    const { data, error } = await sb
      .from('devis')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      throw new NotFoundException({ message: 'devis introuvable' });
    }
    return data as DevisRow;
  }

  async create(dto: UpsertDevisDto, user: AppUser) {
    const sb = this.supabase.getClient();
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
      const { data, error } = await sb
        .from('devis')
        .insert(payload)
        .select(
          'id, numero, status, client_nom, client_ice, client_email, client_telephone, total_ht, montant_tva, total_ttc',
        )
        .single();
      if (!error && data) {
        return {
          id: data.id,
          numero: normalizeDevisNumero(String(data.numero)),
          status: data.status,
          clientNom: data.client_nom,
          clientIce: data.client_ice ?? '',
          clientEmail: data.client_email ?? '',
          clientTelephone: data.client_telephone ?? '',
          totals: {
            totalHt: Number(data.total_ht),
            montantTva: Number(data.montant_tva),
            totalTtc: Number(data.total_ttc),
          },
        };
      }
      lastError = error?.message ?? 'Erreur création devis';
      if (!lastError.toLowerCase().includes('duplicate')) break;
    }
    throw new ConflictException({ message: lastError ?? 'conflit numéro' });
  }

  async getById(id: string, user: AppUser) {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    return {
      id: row.id,
      numero: normalizeDevisNumero(row.numero),
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

  async patch(id: string, dto: UpsertDevisDto, user: AppUser) {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    const { lignes, totals } = this.compute(dto);
    const { data, error } = await this.supabase
      .getClient()
      .from('devis')
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
        'id, numero, status, client_nom, client_ice, client_email, client_telephone, total_ht, montant_tva, total_ttc',
      )
      .single();
    if (error || !data) {
      throw new ConflictException({ message: error?.message ?? 'update refusé' });
    }
    return {
      id: data.id,
      numero: normalizeDevisNumero(String(data.numero)),
      status: data.status,
      clientNom: data.client_nom,
      clientIce: data.client_ice ?? '',
      clientEmail: data.client_email ?? '',
      clientTelephone: data.client_telephone ?? '',
      totals: {
        totalHt: Number(data.total_ht),
        montantTva: Number(data.montant_tva),
        totalTtc: Number(data.total_ttc),
      },
    };
  }

  async remove(id: string, user: AppUser) {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);

    const { error } = await this.supabase
      .getClient()
      .from('devis')
      .delete()
      .eq('id', id);

    if (error) {
      const msg = error.message ?? 'Suppression impossible';
      if (
        msg.toLowerCase().includes('foreign key') ||
        msg.toLowerCase().includes('constraint')
      ) {
        throw new ConflictException({
          message:
            'Suppression impossible: ce devis est déjà lié à une autre ressource.',
        });
      }
      throw new ConflictException({ message: msg });
    }

    return { message: 'Devis supprimé.' };
  }

  async buildPdf(id: string, user: AppUser): Promise<Buffer> {
    const row = await this.byIdOr404(id);
    this.ensureOwnership(row, user);
    return renderDevisPdf({
      numero: normalizeDevisNumero(row.numero),
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
    const filename = `devis-${entity.numero}.pdf`;

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
