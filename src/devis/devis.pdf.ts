import React from 'react';
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { DevisLineComputed } from './types/devis.types';

type DevisPdfInput = {
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
  lignes: DevisLineComputed[];
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
});

function money(v: number): string {
  return `${v.toFixed(2)} MAD`;
}

export async function renderDevisPdf(input: DevisPdfInput): Promise<Buffer> {
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
      React.createElement(Text, { style: styles.title }, 'DEVIS'),
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
          React.createElement(Text, { style: styles.blockTitle }, 'Devis pour'),
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
            React.createElement(Text, { style: styles.rightLabel }, 'Devis n° : '),
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
  );

  return renderToBuffer(doc);
}
