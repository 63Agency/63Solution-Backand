import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { FactureLineComputed } from './types/facture.types';

type FacturePdfInput = {
  numero: string;
  dateEmission: string;
  societeNom: string;
  societeRc: string;
  societeCnie: string;
  societeIce: string;
  societeTp: string;
  societeAdresse: string;
  societeTelephone: string;
  societeEmail: string;
  clientNom: string;
  clientIce: string;
  lignes: FactureLineComputed[];
  mentionTva: string;
  paiementMode: string;
  paiementBanque: string;
  paiementTitulaire: string;
  paiementRib: string;
  tvaTaux: number;
  totalHt: number;
  montantTva: number;
  totalTtc: number;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingHorizontal: 28,
    paddingBottom: 24,
    fontSize: 10,
    fontFamily: 'Helvetica',
    backgroundColor: '#ececec',
  },
  title: { fontSize: 25, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
    minHeight: 130,
  },
  left: { width: '58%' },
  right: {
    width: '38%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  companyName: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 3 },
  oneLineLegal: { fontSize: 9.5, marginBottom: 4 },
  smallLine: { marginBottom: 2, fontSize: 10 },
  blockTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 5, fontSize: 12 },
  rightLine: { marginBottom: 2, fontSize: 10, textAlign: 'right' },
  rightLabel: { fontFamily: 'Helvetica-Bold' },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    color: '#FFFFFF',
  },
  thCell: {
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#ffffff',
    fontFamily: 'Helvetica-Bold',
  },
  thDesignation: { width: '48%' },
  thQty: { width: '11%', textAlign: 'left' },
  thUnit: { width: '20.5%', textAlign: 'left' },
  thTotal: { width: '20.5%', textAlign: 'left', borderRightWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f2f2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff',
  },
  tdCell: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#ffffff',
  },
  tdDesignation: { width: '48%' },
  tdDesignationInner: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    margin: 0,
    padding: 0,
  },
  tdTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    lineHeight: 1.15,
    color: '#000000',
    margin: 0,
    padding: 0,
    marginBottom: 2,
  },
  tdDesc: {
    fontSize: 8.5,
    color: '#000000',
    lineHeight: 1.15,
    margin: 0,
    padding: 0,
  },
  tdQty: { width: '11%', textAlign: 'left', fontSize: 9.5 },
  tdUnit: { width: '20.5%', textAlign: 'left', fontSize: 9.5 },
  tdTotal: { width: '20.5%', textAlign: 'left', fontSize: 9.5, borderRightWidth: 0 },
  mention: {
    marginTop: 6,
    fontFamily: 'Helvetica-Oblique',
    textDecoration: 'underline',
    fontSize: 8,
    color: '#333333',
  },
  paymentFooter: {
    position: 'absolute',
    left: 28,
    width: '52%',
    bottom: 38,
  },
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 24 },
  payment: { width: '52%' },
  paymentTitle: { fontFamily: 'Helvetica-Bold', marginBottom: 4, fontSize: 11 },
  paymentLine: { marginBottom: 2, fontSize: 10 },
  totalsBox: {
    width: '42%',
    borderWidth: 1,
    borderColor: '#ffffff',
    backgroundColor: '#f2f2f2',
  },
  totalRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ffffff',
    minHeight: 22,
  },
  totalRowLabel: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#ffffff',
    justifyContent: 'center',
  },
  totalRowValue: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  totalRowLast: { borderBottomWidth: 0 },
  bold: { fontFamily: 'Helvetica-Bold' },
  cgvPage: {
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 18,
    fontFamily: 'Helvetica',
    backgroundColor: '#ececec',
    flexDirection: 'column',
  },
  cgvTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 10,
    textAlign: 'center',
  },
  cgvCols: {
    flexDirection: 'row',
    gap: 10,
    flexGrow: 1,
    alignItems: 'flex-start',
  },
  cgvCol: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  /** Un bloc de texte par colonne : le PDF gère le retour à la ligne sur toute la hauteur utile */
  cgvText: {
    fontSize: 6.4,
    lineHeight: 1.22,
    textAlign: 'justify',
    hyphens: 'none',
  },
});

function money(v: number): string {
  return `${v.toFixed(2)} MAD`;
}

/** Espacement visuel avant chaque article (sauf le tout premier) */
function cgvFormatColumn(raw: string): string {
  return raw
    .trim()
    .replace(/\n+/g, '\n')
    .replace(/\n(ARTICLE \d+)/g, '\n\n$1');
}

const CGV_COL_1 = `ARTICLE 1 – OBJET ET CHAMP D’APPLICATION
Les présentes conditions générales s'appliquent à toutes les prestations de génération de prospects et de communication digitale fournies par notre agence.
Elles définissent les droits et obligations des parties dans le cadre de nos services de marketing digital et de lead generation.
Les services retenus et exécutés sont exclusivement ceux mentionnés sur la facture validée par le Client.
ARTICLE 2 – DÉFINITIONS
- Prospect qualifié : Prospect ayant manifesté un intérêt pour les services du Client en remplissant un formulaire avec ses coordonnées complètes (nom, prénom, téléphone, localisation) et étant contactable par l'équipe commerciale du Client.
Remarque : la qualification des prospects n’est pas garantie à 100%. Une partie des leads peut être non qualifiée. L’agence met en œuvre tous les moyens disponibles (« obligation de moyens ») pour atteindre un maximum de prospects qualifiés. Cependant, le processus implique des humains et comporte une part d’incertitude naturelle.
- Meta Ads : campagnes publicitaires diffusées sur les plateformes Facebook et Instagram via l’outil Meta Business Manager.
- Conception design : création graphique adaptée aux supports publicitaires (visuels, affiches digitales).
- Création de vidéo : réalisation de contenu vidéo (tournage, script, montage).
- Montage vidéo : assemblage, découpage et optimisation des rushs fournis pour créer un contenu cohérent et exploitable.
- Intégration CRM : mise en place d’un tableau sur Google Sheets permettant la centralisation et le suivi des prospects.
- Automatisation des prospects : transfert automatique des données recueillies via les formulaires instantanés (« Instant Forms ») vers Google Sheets à travers Make.com (ou équivalent).
- Instant Form : formulaire intégré aux publicités Meta permettant la collecte directe des données prospects.
- Optimisation : ajustements continus sur les campagnes publicitaires pour améliorer les résultats (coût par lead, performance de la publicité dépendant du budget fourni par le Client).
- Suivi : monitoring et reporting réguliers sur la performance des campagnes.
- Tunnel de vente : ensemble des étapes (publicité → formulaire → remplissage du formulaire → automatisation vers le CRM) destinées à transformer un prospect en client. Ce tunnel est dédié à 100% au digital.
En validant ces conditions générales et sans objection écrite dans les 7 jours suivant leur communication, le Client reconnaît avoir pris connaissance et compris l’ensemble des clauses. Ces clauses s’appliquent également aux éléments mentionnés sur la facture.
ARTICLE 3 – OBJECTIF
Toute demande de prestation et tout objectif marketing doivent être discutés, validés et acceptés par notre agence.
Seuls les objectifs mentionnés dans le devis ou la facture transmis et validés par le Client constituent le cadre contractuel des prestations.
Ces objectifs sont fournis dans le cadre d’une obligation de moyens et non d’une obligation de résultat.
`;

const CGV_COL_2 = `ARTICLE 4 – TARIFICATION ET MODALITÉS DE PAIEMENT
- Tarification : Les tarifs sont établis sur devis personnalisé selon la nature et l'étendue des prestations demandées.
- Modalités de paiement :
- Paiement intégral à 100% avant le début de chaque service. Aucune prestation ne sera entamée sans règlement complet préalable.
- Pour les services récurrents (gestion publicitaire mensuelle), un paiement anticipé est requis.
- Règlement par virement bancaire, chèque ou en espèces (uniquement pour les montants inférieurs à 4 000 MAD).
- Modifications après validation : Toute modification demandée après validation des créations (designs, vidéos, campagnes) sera facturée au tarif horaire en vigueur, et fera l’objet d’une discussion ou négociation par devis complémentaire.
- Retard de paiement : Tout retard entraîne la suspension immédiate des prestations en cours et peut donner lieu à des pénalités de retard.
ARTICLE 5 – DURÉE ET RENOUVELLEMENT
Les contrats sont généralement conclus pour une durée minimale de 90 jours, renouvelables tacitement sauf préavis de 30 jours avant l'échéance.
Pour les prestations annuelles, la durée est de 12 mois à compter de la signature.
ARTICLE 6 – OBLIGATIONS DE L’AGENCE
L'agence s'engage à :
- Mettre en œuvre tous les moyens professionnels pour atteindre les objectifs convenus.
- Assurer un suivi quotidien et une optimisation continue des campagnes.
- Fournir des rapports de performance réguliers.
- Respecter les délais convenus pour la livraison des créations.
- Maintenir la confidentialité des informations clients.
`;

const CGV_COL_3 = `ARTICLE 7 – OBLIGATIONS DU CLIENT
Le Client s'engage à :
- Fournir toutes les informations nécessaires à la réalisation des prestations.
- Respecter les échéances de paiement.
- Valider les créations dans les délais impartis (48h, sinon le produit est considéré comme accepté par défaut).
- Informer l'agence de tout changement pouvant impacter les campagnes.
- Assumer les coûts supplémentaires liés aux modifications demandées après validation.
ARTICLE 8 – GARANTIE DE SATISFACTION
L’agence s’engage uniquement à mettre en œuvre tous les moyens professionnels (« obligation de moyens » ) afin d’atteindre les objectifs convenus.
Aucune garantie absolue de résultat n’est fournie.
ARTICLE 9 – PROPRIÉTÉ INTELLECTUELLE
Les créations réalisées (vidéos, visuels, contenus) deviennent propriété du Client après règlement intégral des factures correspondantes.
Les méthodes, processus et savoir-faire de l'agence restent sa propriété exclusive.
ARTICLE 10 – CONFIDENTIALITÉ
L'agence s'engage à respecter la confidentialité de toutes les informations communiquées par le Client.
Toutefois, l’agence se réserve le droit de mentionner les noms des clients avec lesquels elle a collaboré (exemple : “nous avons travaillé avec tel client, tel client…”) dans un cadre strictement professionnel et commercial, sans divulguer d’informations stratégiques sur leur business.
Cette obligation de confidentialité perdure au-delà de la fin du contrat.
ARTICLE 11 – RESPONSABILITÉ
La responsabilité de l'agence est limitée au montant des sommes versées par le Client pour la prestation concernée.
L'agence ne saurait être tenue responsable des dommages indirects ou du manque à gagner.
ARTICLE 12 – FORCE MAJEURE
L'agence ne saurait être tenue pour responsable de la non-exécution de ses obligations en cas de dysfonctionnement des plateformes publicitaires (Facebook, Instagram, etc.).
ARTICLE 13 – RÉSILIATION
Le contrat peut être résilié par l'une ou l'autre des parties avec un préavis de 30 jours, sous réserve du règlement des prestations déjà réalisées.
En cas de manquement grave aux obligations contractuelles, la résiliation peut être immédiate.
Si le Client est relancé à trois reprises sans réponse pendant 15 jours, et qu’aucune réponse n’est apportée, le contrat est considéré comme résilié automatiquement.
ARTICLE 14 – MODIFICATION
Toute modification des présentes conditions générales doit faire l'objet d'un avenant, envoyé exclusivement par email à l’adresse suivante : contact@63agency.ma
ARTICLE 15 – RÈGLEMENT DES LITIGES
En cas de désaccord, les parties s'engagent à rechercher une solution amiable.
À défaut, tout litige relèvera de la compétence exclusive du tribunal de commerce de Casablanca.
ARTICLE 16 – DROIT APPLICABLE
Les présentes conditions générales sont soumises au droit marocain.
ARTICLE 17 – COMMUNICATION
Le seul moyen officiel de communication entre l’agence et le Client est l’email.
Adresse officielle : contact@63agency.ma
`;

export async function renderFacturePdf(
  input: FacturePdfInput,
): Promise<Buffer> {
  const rows = input.lignes.map((l, i) =>
    React.createElement(
      View,
      { key: `${l.id}-${i}`, style: styles.row },
      React.createElement(
        View,
        { style: [styles.tdCell, styles.tdDesignation] },
        React.createElement(
          View,
          { style: styles.tdDesignationInner },
          React.createElement(Text, { style: styles.tdTitle }, l.titre),
          React.createElement(Text, { style: styles.tdDesc }, l.description),
        ),
      ),
      React.createElement(
        View,
        { style: [styles.tdCell, styles.tdQty] },
        React.createElement(Text, { style: styles.tdQty }, String(l.quantite)),
      ),
      React.createElement(
        View,
        { style: [styles.tdCell, styles.tdUnit] },
        React.createElement(Text, { style: styles.tdUnit }, money(l.prixUnitaireHt)),
      ),
      React.createElement(
        View,
        { style: [styles.tdCell, styles.tdTotal] },
        React.createElement(Text, { style: styles.tdTotal }, money(l.totalLigneHt)),
      ),
    ),
  );

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.title }, 'FACTURE'),
      React.createElement(
        View,
        { style: styles.top },
        React.createElement(
          View,
          { style: styles.left },
          React.createElement(Text, { style: styles.companyName }, input.societeNom),
          React.createElement(
            Text,
            { style: styles.oneLineLegal, wrap: false },
            `RC : ${input.societeRc} - CNIE : ${input.societeCnie} - ICE : ${input.societeIce} - TP : ${input.societeTp}`,
          ),
          React.createElement(Text, { style: styles.smallLine }, input.societeAdresse),
          React.createElement(
            Text,
            { style: styles.smallLine },
            `Tél: ${input.societeTelephone}`,
          ),
          React.createElement(
            Text,
            { style: styles.smallLine },
            `Email: ${input.societeEmail}`,
          ),
        ),
        React.createElement(
          View,
          { style: styles.right },
          React.createElement(Text, { style: styles.blockTitle }, 'Facture pour'),
          React.createElement(
            Text,
            { style: styles.rightLine },
            React.createElement(Text, { style: styles.rightLabel }, 'Nom : '),
            input.clientNom,
          ),
          React.createElement(
            Text,
            { style: styles.rightLine },
            React.createElement(Text, { style: styles.rightLabel }, 'ICE : '),
            input.clientIce.trim() ? input.clientIce : '********',
          ),
          React.createElement(
            Text,
            { style: styles.rightLine },
            React.createElement(Text, { style: styles.rightLabel }, 'Facture n° : '),
            input.numero,
          ),
          React.createElement(
            Text,
            { style: styles.rightLine },
            React.createElement(Text, { style: styles.rightLabel }, 'Date d’émission : '),
            input.dateEmission,
          ),
        ),
      ),
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(
          Text,
          { style: [styles.thCell, styles.thDesignation] },
          'Désignation',
        ),
        React.createElement(Text, { style: [styles.thCell, styles.thQty] }, 'Quantité'),
        React.createElement(Text, { style: [styles.thCell, styles.thUnit] }, 'Prix Unitaire HT'),
        React.createElement(Text, { style: [styles.thCell, styles.thTotal] }, 'Total HT'),
      ),
      ...rows,
      React.createElement(Text, { style: styles.mention }, input.mentionTva),
      React.createElement(
        View,
        { style: styles.totalsWrap },
        React.createElement(
          View,
          { style: styles.totalsBox },
          React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(
              View,
              { style: styles.totalRowLabel },
              React.createElement(Text, null, 'Total HT'),
            ),
            React.createElement(
              View,
              { style: styles.totalRowValue },
              React.createElement(Text, null, money(input.totalHt)),
            ),
          ),
          React.createElement(
            View,
            { style: styles.totalRow },
            React.createElement(
              View,
              { style: styles.totalRowLabel },
              React.createElement(Text, null, `TVA ${input.tvaTaux}%`),
            ),
            React.createElement(
              View,
              { style: styles.totalRowValue },
              React.createElement(Text, null, money(input.montantTva)),
            ),
          ),
          React.createElement(
            View,
            { style: [styles.totalRow, styles.totalRowLast] },
            React.createElement(
              View,
              { style: styles.totalRowLabel },
              React.createElement(Text, { style: styles.bold }, 'Total TTC'),
            ),
            React.createElement(
              View,
              { style: styles.totalRowValue },
              React.createElement(Text, { style: styles.bold }, money(input.totalTtc)),
            ),
          ),
        ),
      ),
      React.createElement(
        View,
        { style: styles.paymentFooter },
        React.createElement(Text, { style: styles.paymentTitle }, 'Modalités de paiement :'),
        React.createElement(
          Text,
          { style: styles.paymentLine },
          React.createElement(Text, { style: styles.bold }, 'Mode de paiement : '),
          input.paiementMode,
        ),
        React.createElement(
          Text,
          { style: styles.paymentLine },
          React.createElement(Text, { style: styles.bold }, 'Banque : '),
          input.paiementBanque,
        ),
        React.createElement(
          Text,
          { style: styles.paymentLine },
          React.createElement(Text, { style: styles.bold }, 'Titulaire : '),
          input.paiementTitulaire,
        ),
        React.createElement(
          Text,
          { style: styles.paymentLine },
          React.createElement(Text, { style: styles.bold }, 'RIB : '),
          input.paiementRib,
        ),
      ),
    ),
    React.createElement(
      Page,
      { size: 'A4', style: styles.cgvPage },
      React.createElement(
        Text,
        { style: styles.cgvTitle },
        'CONDITIONS GÉNÉRALES DE VENTE (CGV)',
      ),
      React.createElement(
        View,
        { style: styles.cgvCols },
        React.createElement(
          View,
          { style: styles.cgvCol },
          React.createElement(Text, { style: styles.cgvText }, cgvFormatColumn(CGV_COL_1)),
        ),
        React.createElement(
          View,
          { style: styles.cgvCol },
          React.createElement(Text, { style: styles.cgvText }, cgvFormatColumn(CGV_COL_2)),
        ),
        React.createElement(
          View,
          { style: styles.cgvCol },
          React.createElement(Text, { style: styles.cgvText }, cgvFormatColumn(CGV_COL_3)),
        ),
      ),
    ),
  );

  return renderToBuffer(doc);
}
