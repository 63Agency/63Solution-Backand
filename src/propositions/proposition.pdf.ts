import React from 'react';
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { PropositionPayload } from './types/proposition.types';

export type PropositionPdfInput = PropositionPayload & {
  numero: string;
};

function resolveTemplate(
  text: string,
  etablissement: string,
  objectif: number,
): string {
  return (text ?? '')
    .replace(/\{\{etablissement\}\}/g, etablissement)
    .replace(/\{\{objectif\}\}/g, String(objectif));
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/** Icônes SVG (Helvetica ne affiche pas ☎ / ✉). */
const ICON_PHONE = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1a1a1a" d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.57c-2.83-1.44-5.15-3.75-6.59-6.59l1.57-1.57a.996.996 0 0 0 .24-1.01c-.36-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>',
);
const ICON_EMAIL = svgDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#1a1a1a" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
);

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 52,
    paddingBottom: 52,
    fontSize: 11.5,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
    lineHeight: 1.45,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 60,
  },
  titleLine1: {
    fontSize: 30,
    fontFamily: 'Times-Bold',
    textAlign: 'center',
    color: '#000',
    marginBottom: 14,
  },
  titleLine2: {
    fontSize: 30,
    fontFamily: 'Times-Bold',
    textAlign: 'center',
    color: '#000',
  },
  metaBlock: { marginBottom: 14 },
  metaLine: { marginBottom: 2, fontSize: 11.5, lineHeight: 1.3 },
  metaLabel: { fontFamily: 'Helvetica-Bold' },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#c8c8c8',
    marginVertical: 18,
    width: '100%',
  },
  sectionHeading: {
    fontSize: 13.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 12,
    color: '#000',
    textAlign: 'left',
  },
  strategyDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#c8c8c8',
    marginTop: 14,
    marginBottom: 18,
    width: '100%',
  },
  strategyMainTitle: {
    fontSize: 13.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 14,
    marginTop: 0,
    color: '#000',
    textAlign: 'left',
    lineHeight: 1.35,
  },
  subHeading: {
    fontSize: 12.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 10,
    marginTop: 0,
    color: '#000',
  },
  paragraph: {
    marginBottom: 10,
    lineHeight: 1.5,
    textAlign: 'left',
    fontSize: 11.5,
  },
  boldInline: { fontFamily: 'Helvetica-Bold' },
  bulletList: {
    marginTop: 4,
    marginBottom: 6,
    paddingLeft: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 5,
    paddingLeft: 10,
  },
  bulletDot: { width: 12, fontSize: 11.5, marginRight: 4 },
  bulletText: { flex: 1, fontSize: 11.5, lineHeight: 1.5 },
  tableWrap: { marginTop: 8, marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#e8e8e8',
    borderWidth: 1,
    borderColor: '#bdbdbd',
  },
  tableRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#bdbdbd',
  },
  th: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontFamily: 'Helvetica-Bold',
    fontSize: 10.5,
    borderRightWidth: 1,
    borderRightColor: '#bdbdbd',
  },
  td: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 10.5,
    borderRightWidth: 1,
    borderRightColor: '#bdbdbd',
  },
  colService: { width: '40%' },
  colPrix: { width: '30%' },
  colPrixLast: { width: '30%', borderRightWidth: 0 },
  note: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 9.5,
    color: '#333',
    lineHeight: 1.45,
  },
  contactBlock: {
    marginTop: 28,
    paddingTop: 8,
  },
  contactName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    marginBottom: 2,
    lineHeight: 1.2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  contactIcon: { width: 11, height: 11, marginRight: 7 },
  contactLineText: { fontSize: 11.5, color: '#1a1a1a', lineHeight: 1.2 },
  contactTagline: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 1.2,
  },
});

function divider(key: string, customStyle?: Record<string, unknown>) {
  return React.createElement(View, {
    key,
    style: (customStyle ?? styles.divider) as typeof styles.divider,
  });
}

function contactLineWithIcon(
  iconSrc: string,
  text: string,
  key: string,
): React.ReactElement | null {
  const value = (text ?? '').trim();
  if (!value) return null;
  return React.createElement(
    View,
    { key, style: styles.contactRow },
    React.createElement(Image, { src: iconSrc, style: styles.contactIcon }),
    React.createElement(Text, { style: styles.contactLineText }, value),
  );
}

function metaLine(label: string, value: string) {
  return React.createElement(
    Text,
    { style: styles.metaLine },
    React.createElement(Text, { style: styles.metaLabel }, `${label} `),
    value,
  );
}

/** Paragraphe avec mots en gras (**, ou surlignage établissement / objectif). */
function richParagraph(
  text: string,
  highlights: string[],
  key?: string,
): React.ReactElement {
  const style = styles.paragraph;
  const cleaned = text ?? '';
  if (!cleaned) {
    return React.createElement(Text, { key, style }, '');
  }

  const tokens: Array<{ bold: boolean; text: string }> = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const withMarkers = cleaned;
  while ((m = re.exec(withMarkers)) !== null) {
    if (m.index > last) {
      tokens.push({ bold: false, text: withMarkers.slice(last, m.index) });
    }
    tokens.push({ bold: true, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < withMarkers.length) {
    tokens.push({ bold: false, text: withMarkers.slice(last) });
  }
  if (tokens.length === 0) {
    tokens.push({ bold: false, text: cleaned });
  }

  const flat: Array<{ bold: boolean; text: string }> = [];
  for (const tok of tokens) {
    if (tok.bold) {
      flat.push(tok);
      continue;
    }
    let segment = tok.text;
    const active = highlights.filter((h) => h.length > 0);
    if (active.length === 0) {
      flat.push({ bold: false, text: segment });
      continue;
    }
    const pattern = new RegExp(
      `(${active.map(escapeRegex).join('|')})`,
      'gi',
    );
    const parts = segment.split(pattern);
    for (const part of parts) {
      if (!part) continue;
      const isHi = active.some((h) => part.toLowerCase() === h.toLowerCase());
      flat.push({ bold: isHi, text: part });
    }
  }

  return React.createElement(
    Text,
    { key, style },
    flat.map((p, i) =>
      p.bold
        ? React.createElement(Text, { key: i, style: styles.boldInline }, p.text)
        : p.text,
    ),
  );
}

function bulletItems(items: string[]) {
  const rows = (items ?? [])
    .filter((t) => (t ?? '').trim().length > 0)
    .map((item, i) =>
      React.createElement(
        View,
        { key: `b-${i}`, style: styles.bulletRow },
        React.createElement(Text, { style: styles.bulletDot }, '•'),
        React.createElement(Text, { style: styles.bulletText }, item),
      ),
    );
  if (rows.length === 0) return [];
  return [
    React.createElement(View, { key: 'blist', style: styles.bulletList }, ...rows),
  ];
}

/** Découpe un champ texte en paragraphes (\n\n). */
function splitParagraphs(text: string): string[] {
  const normalized = (text ?? '').trim();
  if (!normalized) return [];
  if (/\n\n/.test(normalized)) {
    return normalized
      .split(/\n\n+/)
      .map((p) => p.replace(/\n/g, ' ').trim())
      .filter(Boolean);
  }
  return [normalized.replace(/\n/g, ' ').trim()];
}

function paragraphBlocks(
  text: string,
  tpl: (t: string) => string,
  highlights: string[],
  keyPrefix: string,
): React.ReactElement[] {
  return splitParagraphs(text).map((p, i) =>
    richParagraph(tpl(p), highlights, `${keyPrefix}-${i}`),
  );
}

function videosIntroLine(videosMin: number, videosMax: number) {
  const rangeBold = `${videosMin} à ${videosMax} vidéos`;
  return React.createElement(
    Text,
    { key: 's1-videos', style: styles.paragraph },
    'Dans le cadre de cette collaboration, ',
    React.createElement(Text, { style: styles.boldInline }, rangeBold),
    ' seront produites, orientées autour de :',
  );
}

function strategyH2() {
  return React.createElement(
    Text,
    { style: styles.strategyMainTitle },
    'Notre stratégie et les étapes vers des résultats concrets',
  );
}

function renderSection1(
  section: PropositionPdfInput['strategie']['section1CreationContenu'],
  tpl: (t: string) => string,
  highlights: string[],
): React.ReactElement[] {
  const descBlocks = paragraphBlocks(section.description, tpl, highlights, 's1-desc');
  return [
    React.createElement(
      Text,
      { key: 's1-h', style: styles.subHeading },
      '1. Création de Contenu',
    ),
    ...(descBlocks.length > 0
      ? descBlocks
      : []),
    videosIntroLine(section.videosMin, section.videosMax),
    ...bulletItems(section.topics ?? []),
  ];
}

/** Bloc stratégie page 1 : trait, H2 centré, section 1 (comme maquette). */
function renderStrategyStart(
  section1: PropositionPdfInput['strategie']['section1CreationContenu'],
  tpl: (t: string) => string,
  highlights: string[],
): React.ReactElement[] {
  return [
    divider('d2', styles.strategyDivider),
    strategyH2(),
    ...renderSection1(section1, tpl, highlights),
  ];
}

function titleHeader(input: PropositionPdfInput) {
  const etab = (input.nomEtablissement ?? '').trim();
  return React.createElement(
    View,
    { style: styles.titleBlock },
    React.createElement(
      Text,
      { style: styles.titleLine1 },
      'Proposition de Génération de ',
    ),
    React.createElement(
      Text,
      { style: styles.titleLine2 },
      etab ? `Leads – ${etab}` : 'Leads',
    ),
  );
}

function page1(
  input: PropositionPdfInput,
  tpl: (t: string) => string,
  highlights: string[],
) {
  const s = input.strategie;
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    titleHeader(input),
    React.createElement(
      View,
      { style: styles.metaBlock },
      metaLine('Préparée pour :', input.preparePour),
      metaLine("Nom de l'établissement :", input.nomEtablissement),
      metaLine('Préparée par :', input.preparePar),
    ),
    divider('d1'),
    React.createElement(Text, { style: styles.sectionHeading }, 'Introduction'),
    richParagraph(tpl(input.introduction.paragraphe1), highlights, 'p1'),
    richParagraph(tpl(input.introduction.paragraphe2), highlights, 'p2'),
    ...renderStrategyStart(s.section1CreationContenu, tpl, highlights),
  );
}

function page2(
  input: PropositionPdfInput,
  tpl: (t: string) => string,
  highlights: string[],
) {
  const s = input.strategie;
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(
      Text,
      { style: styles.subHeading },
      '2. Campagnes Publicitaires – Facebook & Instagram',
    ),
    ...paragraphBlocks(
      s.section2CampagnesPublicitaires.texte,
      tpl,
      highlights,
      's2',
    ),
    divider('d3'),
    React.createElement(Text, { style: styles.subHeading }, '3. Funnel Marketing'),
    ...paragraphBlocks(s.section3FunnelMarketing.intro, tpl, highlights, 's3i'),
    ...bulletItems(s.section3FunnelMarketing.criteres),
    ...paragraphBlocks(
      s.section3FunnelMarketing.conclusion,
      tpl,
      highlights,
      's3c',
    ),
    divider('d4'),
    React.createElement(Text, { style: styles.subHeading }, '4. Automatisation & Suivi'),
    ...bulletItems(s.section4Automatisation.points),
    ...paragraphBlocks(s.section4Automatisation.objectif, tpl, highlights, 's4o'),
  );
}

function page3(
  input: PropositionPdfInput,
  tpl: (t: string) => string,
  highlights: string[],
) {
  return React.createElement(
    Page,
    { size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.sectionHeading }, 'Tarifs Proposés'),
    React.createElement(
      View,
      { style: styles.tableWrap },
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(
          Text,
          { style: [styles.th, styles.colService] },
          'Service',
        ),
        React.createElement(
          Text,
          { style: [styles.th, styles.colPrix] },
          'Prix Initial (MAD)',
        ),
        React.createElement(
          Text,
          { style: [styles.th, styles.colPrixLast] },
          'Prix Offert (MAD)',
        ),
      ),
      ...input.tarifs.lignes.map((l, i) =>
        React.createElement(
          View,
          { key: `t-${i}`, style: styles.tableRow },
          React.createElement(
            Text,
            { style: [styles.td, styles.colService] },
            l.service,
          ),
          React.createElement(
            Text,
            { style: [styles.td, styles.colPrix] },
            l.prixInitial,
          ),
          React.createElement(
            Text,
            { style: [styles.td, styles.colPrixLast] },
            l.prixOffert,
          ),
        ),
      ),
    ),
    input.tarifs.noteMetaAds
      ? React.createElement(Text, { style: styles.note }, input.tarifs.noteMetaAds)
      : null,
    divider('d5'),
    React.createElement(
      Text,
      { style: styles.sectionHeading },
      'Pourquoi Choisir 63 AGENCY',
    ),
    ...bulletItems(input.pourquoiChoisir),
    divider('d6'),
    React.createElement(Text, { style: styles.sectionHeading }, 'Prochaines Étapes'),
    richParagraph(tpl(input.prochainesEtapes), highlights, 'pe'),
    React.createElement(
      View,
      { style: styles.contactBlock },
      React.createElement(Text, { style: styles.contactName }, input.contact.nom),
      contactLineWithIcon(ICON_PHONE, input.contact.telephone, 'ctel'),
      contactLineWithIcon(ICON_EMAIL, input.contact.email, 'cemail'),
      React.createElement(Text, { style: styles.contactTagline }, input.contact.tagline),
    ),
  );
}

export async function renderPropositionPdf(
  input: PropositionPdfInput,
): Promise<Buffer> {
  const etab = input.nomEtablissement;
  const objectif = input.introduction.objectifProspects;
  const tpl = (t: string) => resolveTemplate(t, etab, objectif);
  const highlights = [
    etab,
    String(objectif),
    `${objectif} prospects`,
    `plus de ${objectif}`,
    `plus de ${objectif} prospects`,
  ];

  const doc = React.createElement(
    Document,
    null,
    page1(input, tpl, highlights),
    page2(input, tpl, highlights),
    page3(input, tpl, highlights),
  );

  return renderToBuffer(doc);
}
