import React from 'react';
import { join } from 'path';
import { readFileSync } from 'fs';
import {
  Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer,
} from '@react-pdf/renderer';

/** Load local image as Buffer — bare path strings fail via fetch() on Windows. */
function asset(parts: string[]): Buffer {
  return readFileSync(join(process.cwd(), ...parts));
}

/* ---- Fonts (Poppins + Inter + Plus Jakarta Sans from @fontsource) ---- */
let fontsRegistered = false;
/** data: URI — Node fetch() does not support file:// */
function ff(pkg: string, file: string): string {
  const buf = asset(['node_modules', '@fontsource', pkg, 'files', file]);
  return `data:font/woff;base64,${buf.toString('base64')}`;
}
function registerFonts(): void {
  if (fontsRegistered) return;
  Font.register({
    family: 'Poppins',
    fonts: [
      { src: ff('poppins', 'poppins-latin-600-normal.woff'), fontWeight: 600 },
      { src: ff('poppins', 'poppins-latin-700-normal.woff'), fontWeight: 700 },
    ],
  });
  Font.register({
    family: 'Inter',
    fonts: [{ src: ff('inter', 'inter-latin-400-normal.woff'), fontWeight: 400 }],
  });
  Font.register({
    family: 'Plus Jakarta Sans',
    fonts: [
      { src: ff('plus-jakarta-sans', 'plus-jakarta-sans-latin-400-normal.woff'), fontWeight: 400 },
      { src: ff('plus-jakarta-sans', 'plus-jakarta-sans-latin-600-normal.woff'), fontWeight: 600 },
      { src: ff('plus-jakarta-sans', 'plus-jakarta-sans-latin-700-normal.woff'), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsRegistered = true;
}

/* ---- Background pages (design figé, variables laissées vides) ---- */
const BG1 = () => asset(['public', 'images', 'proposal-cover-bg.png']);
const BG2 = () => asset(['public', 'images', 'proposal-mechanism-bg.png']);
const BG3 = () => asset(['public', 'images', 'image.png']);
const PROMISE_BG = () => asset(['public', 'images', 'image12.png']);

export type ProposalPdfLanguage = 'fr' | 'en';

export type ProposalPdfInput = {
  client: string;
  date?: string;
  offerName?: string;
  price?: string;
  currency?: string;
  period?: string;
  adBudget?: string;
  language?: ProposalPdfLanguage;
};

const COPY = {
  en: {
    offerName: '3-Month Partnership',
    period: 'PER QUARTER',
    adBudget:
      'Advertising spend remains the responsibility of the client company, with a minimum starting budget of 3,000 DHS/month.',
    confidentialLabel: 'CONFIDENTIAL PROPOSAL',
    preparedFor: 'PREPARED FOR',
    titleL1Gold: 'Sustainable',
    titleL1Rest: ' B2B client',
    titleL2: 'acquisition system.',
    subtitle:
      'Create a sustainable flow of targeted prospects ready to become your next clients.',
    mechanismEyebrow: 'THE MECHANISM',
    mechanismTitle1: 'Our Acquisition',
    mechanismTitle2: 'Mechanism.',
    step1Label: 'STEP 1 · STRATEGIC — SET ONCE',
    step1Title: 'TARGET',
    step1Body:
      'Everything starts by defining the companies worth acquiring. We identify your ideal clients based on your offer, positioning, margins, buying intent and qualification criteria.',
    step1OutcomeLabel: 'Outcome:',
    step1Outcome: 'a clearly defined target market.',
    step2Label: 'STEP 2 · CONTINUOUS ACQUISITION LOOP',
    genTitle: 'GENERATE',
    genBody: 'Continuously attract companies matching your target profile.',
    qualTitle: 'QUALIFY',
    qualBody: 'Filter every lead to ensure only relevant opportunities move forward.',
    delTitle: 'DELIVER',
    delBody: 'Deliver qualified business opportunities directly to your sales team.',
    feedback: 'FEEDBACK',
    feedbackNote:
      'The feedback from every opportunity strengthens the next acquisition cycle.',
    promiseBadge: 'PROMISE',
    promiseBanner: 'A sustainable flow of targeted prospects.',
    eyebrow: 'INVESTMENT',
    title1: 'One partnership.',
    title2Prefix: 'One ',
    title2Gold: 'outcome.',
    offerLabel: 'SUSTAINABLE B2B CLIENT ACQUISITION SYSTEM',
    offerDesc:
      'Target definition, system build, and continuous operation of the acquisition loop.',
    budgetLabel: 'ADVERTISING BUDGET',
    promiseLabel: 'OUR PROMISE',
    promiseTitle: 'A Sustainable Flow of Targeted Prospects',
    promiseDesc:
      'Through a continuously improving acquisition system designed to generate qualified business opportunities for your sales team.',
    foot: (client, date) =>
      `Confidential proposal \u2014 Prepared for ${client} \u00B7 ${date}`.toUpperCase(),
  },
  fr: {
    offerName: 'Partenariat de 3 mois',
    period: 'PAR TRIMESTRE',
    adBudget:
      'Les dépenses publicitaires restent à la charge de l’entreprise cliente, avec un budget initial minimum de 3 000 DHS/mois.',
    confidentialLabel: 'PROPOSITION CONFIDENTIELLE',
    preparedFor: 'PRÉPARÉ POUR',
    titleL1Gold: 'Système',
    titleL1Rest: ' durable',
    titleL2: 'd’acquisition de clients B2B.',
    subtitle:
      'Créez un flux durable de prospects ciblés prêts à devenir vos prochains clients.',
    mechanismEyebrow: 'LE MÉCANISME',
    mechanismTitle1: 'Notre mécanisme',
    mechanismTitle2: 'd’acquisition.',
    step1Label: 'ÉTAPE 1 · STRATÉGIQUE — DÉFINIE UNE FOIS',
    step1Title: 'CIBLE',
    step1Body:
      'Tout commence par la définition des entreprises à acquérir. Nous identifions vos clients idéaux selon votre offre, votre positionnement, vos marges, l’intention d’achat et vos critères de qualification.',
    step1OutcomeLabel: 'Résultat :',
    step1Outcome: 'un marché cible clairement défini.',
    step2Label: 'ÉTAPE 2 · BOUCLE D’ACQUISITION CONTINUE',
    genTitle: 'GÉNÉRER',
    genBody: 'Attirer en continu les entreprises correspondant à votre cible.',
    qualTitle: 'QUALIFIER',
    qualBody:
      'Filtrer chaque lead pour ne faire avancer que les opportunités pertinentes.',
    delTitle: 'LIVRER',
    delBody:
      'Livrer des opportunités commerciales qualifiées directement à votre équipe commerciale.',
    feedback: 'FEEDBACK',
    feedbackNote:
      'Le feedback de chaque opportunité renforce le cycle d’acquisition suivant.',
    promiseBadge: 'PROMESSE',
    promiseBanner: 'Un flux durable de prospects ciblés.',
    eyebrow: 'INVESTISSEMENT',
    title1: 'Un partenariat.',
    title2Prefix: 'Un ',
    title2Gold: 'résultat.',
    offerLabel: 'SYSTÈME D’ACQUISITION CLIENT B2B DURABLE',
    offerDesc:
      'Définition de la cible, construction du système et exploitation continue de la boucle d’acquisition.',
    budgetLabel: 'BUDGET PUBLICITAIRE',
    promiseLabel: 'NOTRE PROMESSE',
    promiseTitle: 'Un flux durable de prospects ciblés',
    promiseDesc:
      'Grâce à un système d’acquisition en amélioration continue, conçu pour générer des opportunités commerciales qualifiées pour votre équipe commerciale.',
    foot: (client, date) =>
      `Proposition confidentielle \u2014 Préparée pour ${client} \u00B7 ${date}`.toUpperCase(),
  },
} as const;

const MONTHS = {
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
  fr: ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'],
} as const;

function defaultDate(lang: ProposalPdfLanguage): string {
  const now = new Date();
  return `${MONTHS[lang][now.getMonth()]} ${now.getFullYear()}`;
}

function localizeDate(raw: string | undefined, lang: ProposalPdfLanguage): string {
  const v = (raw ?? '').trim();
  if (!v) return defaultDate(lang);
  const parts = v.toUpperCase().split(/\s+/);
  if (parts.length >= 2) {
    const m = parts[0]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const year = parts[1];
    const enIdx = MONTHS.en.findIndex(
      (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === m,
    );
    const frIdx = MONTHS.fr.findIndex(
      (x) =>
        x.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === m ||
        x === parts[0],
    );
    const idx = enIdx >= 0 ? enIdx : frIdx;
    if (idx >= 0 && /^\d{4}$/.test(year)) {
      return `${MONTHS[lang][idx]} ${year}`;
    }
  }
  return v.toUpperCase();
}

/** Prefer COPY[lang] when body sends the other language's default. */
function localizeField(
  lang: ProposalPdfLanguage,
  value: string | undefined,
  key: 'offerName' | 'period' | 'adBudget',
): string {
  const v = (value ?? '').trim();
  const mine = COPY[lang][key];
  if (!v) return mine;
  const other = COPY[lang === 'fr' ? 'en' : 'fr'][key];
  if (v === other) return mine;
  return v;
}

const LOGO = () => asset(['public', 'images', '63AgencyTextwhit.png']);

const PAGE = { width: 1280, height: 720 } as const;
const styles = StyleSheet.create({
  page: { position: 'relative', width: 1280, height: 720 },
  bg: { position: 'absolute', top: 0, left: 0, width: 1280, height: 720 },
  logo: {
    position: 'absolute',
    left: 48,
    top: 28,
    width: 200,
    height: 42,
  },
  client: {
    position: 'absolute',
    left: 85,
    top: 553,
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 34,
    color: '#F3F1EA',
    letterSpacing: -0.2,
    lineHeight: 1.1,
  },
  /** Continuous gold accent line on every page (fixes broken baked-in line). */
  pageLine: {
    position: 'absolute',
    left: 64,
    top: 648,
    width: 1152,
    height: 2.5,
    backgroundColor: '#DEA65C',
  },
  date: {
    position: 'absolute',
    left: 64,
    top: 656,
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#8D897F',
    letterSpacing: 3.3,
    lineHeight: 1,
  },
  /** Page 1 footer: DATE ———— PROPOSITION CONFIDENTIELLE —— */
  p1FootRow: {
    position: 'absolute',
    left: 64,
    top: 652,
    width: 1152,
    height: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  p1FootDate: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#C9C4B8',
    letterSpacing: 3.2,
    lineHeight: 1,
    marginRight: 14,
  },
  p1FootLine: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    height: 1.5,
    backgroundColor: '#DEA65C',
    marginTop: 1,
  },
  p1FootConfidential: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#C9C4B8',
    letterSpacing: 2.8,
    lineHeight: 1,
    marginLeft: 14,
    marginRight: 14,
  },
  p1FootLineEnd: {
    width: 56,
    height: 1.5,
    backgroundColor: '#DEA65C',
    marginTop: 1,
  },

  /* ---- Page 1 cover (localized text) ---- */
  p1EyebrowWrap: {
    position: 'absolute',
    right: 64,
    top: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  p1Eyebrow: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#C9C4B8',
    letterSpacing: 3.2,
  },
  p1EyebrowLine: {
    marginLeft: 14,
    width: 48,
    height: 1.5,
    backgroundColor: '#DEA65C',
  },
  p1TitleWrap: {
    position: 'absolute',
    left: 72,
    top: 210,
    width: 700,
  },
  p1Title: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 44,
    color: '#F7F4EE',
    lineHeight: 1.12,
  },
  p1TitleGold: {
    color: '#DEA65C',
  },
  p1Subtitle: {
    position: 'absolute',
    left: 72,
    top: 340,
    width: 620,
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 15,
    color: '#A8A297',
    lineHeight: 1.45,
  },
  p1PreparedRow: {
    position: 'absolute',
    left: 72,
    top: 520,
    flexDirection: 'row',
    alignItems: 'center',
  },
  p1PreparedLine: {
    width: 2,
    height: 16,
    backgroundColor: '#DEA65C',
    marginRight: 12,
  },
  p1Prepared: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#8D897F',
    letterSpacing: 3.2,
  },

  /* ---- Page 2 mechanism (localized) ---- */
  p2EyebrowWrap: {
    position: 'absolute',
    right: 64,
    top: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  p2Eyebrow: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#E8E4DC',
    letterSpacing: 3.4,
  },
  p2EyebrowLine: {
    marginLeft: 14,
    width: 48,
    height: 1.5,
    backgroundColor: '#DEA65C',
  },
  p2TitleWrap: {
    position: 'absolute',
    left: 72,
    top: 88,
  },
  p2Title: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 36,
    color: '#F7F4EE',
    lineHeight: 1.15,
  },
  p2TitleGold: {
    color: '#DEA65C',
  },
  p2Step1: {
    position: 'absolute',
    left: 72,
    top: 190,
    width: 520,
    height: 320,
    borderWidth: 1,
    borderColor: '#C9A36A',
    borderRadius: 4,
    backgroundColor: 'rgba(22,20,18,0.55)',
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  p2Step2: {
    position: 'absolute',
    left: 620,
    top: 190,
    width: 588,
    height: 320,
    borderWidth: 1,
    borderColor: '#C9A36A',
    borderRadius: 4,
    backgroundColor: 'rgba(22,20,18,0.55)',
    paddingVertical: 22,
    paddingHorizontal: 24,
  },
  p2StepLabel: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 10,
    color: '#9A958A',
    letterSpacing: 2.2,
    marginBottom: 14,
  },
  p2StepTitle: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 28,
    color: '#F7F4EE',
    marginBottom: 12,
  },
  p2StepBody: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 12.5,
    color: '#C9C4B8',
    lineHeight: 1.45,
    marginBottom: 16,
  },
  p2OutcomeBox: {
    marginTop: 'auto',
    borderLeftWidth: 2,
    borderLeftColor: '#DEA65C',
    paddingLeft: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(28,24,20,0.45)',
  },
  p2OutcomeText: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 12,
    color: '#D2CEC4',
    lineHeight: 1.4,
  },
  p2OutcomeGold: {
    color: '#DEA65C',
    fontFamily: 'Poppins',
    fontWeight: 600,
  },
  p2LoopItem: {
    borderWidth: 1,
    borderColor: '#C9A36A',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: 'rgba(28,24,20,0.4)',
  },
  p2LoopTitle: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 12,
    color: '#DEA65C',
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  p2LoopBody: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 11.5,
    color: '#C9C4B8',
    lineHeight: 1.35,
  },
  p2FeedbackNote: {
    marginTop: 6,
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 11,
    color: '#A8A297',
    lineHeight: 1.35,
  },
  p2PromiseBar: {
    position: 'absolute',
    left: 72,
    top: 532,
    width: 1136,
    height: 52,
    borderRadius: 4,
    backgroundColor: '#DEA65C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  p2PromiseBadge: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 11,
    color: '#1A1510',
    letterSpacing: 2.4,
    marginRight: 16,
  },
  p2PromiseSep: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(20,16,10,0.35)',
    marginRight: 16,
  },
  p2PromiseBanner: {
    flex: 1,
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 14,
    color: '#1A1510',
  },

  /* ---- Page 3 (Investment) — drawn like devis/facture ---- */
  p3EyebrowWrap: {
    position: 'absolute',
    right: 64,
    top: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  p3Eyebrow: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#E8E4DC',
    letterSpacing: 3.4,
  },
  p3EyebrowLine: {
    marginLeft: 14,
    width: 48,
    height: 1.5,
    backgroundColor: '#DEA65C',
  },
  p3TitleWrap: {
    position: 'absolute',
    left: 72,
    top: 108,
  },
  p3Title: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 46,
    color: '#F7F4EE',
    lineHeight: 1.12,
  },
  p3TitleGold: {
    color: '#DEA65C',
  },
  p3OfferCard: {
    position: 'absolute',
    left: 72,
    top: 236,
    width: 1136,
    height: 152,
    borderWidth: 1,
    borderColor: '#C9A36A',
    borderRadius: 4,
    backgroundColor: 'rgba(22,20,18,0.5)',
    flexDirection: 'row',
    paddingVertical: 26,
    paddingHorizontal: 34,
  },
  p3OfferLeft: {
    flex: 1,
    paddingRight: 28,
    justifyContent: 'center',
  },
  p3OfferLabel: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 10,
    color: '#9A958A',
    letterSpacing: 2.6,
    marginBottom: 12,
  },
  p3OfferName: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 30,
    color: '#F7F4EE',
    marginBottom: 10,
  },
  p3OfferDesc: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 13.5,
    color: '#C9C4B8',
    lineHeight: 1.4,
  },
  p3OfferDivider: {
    width: 1,
    backgroundColor: '#C9A36A',
    marginRight: 30,
    opacity: 0.85,
  },
  p3OfferRight: {
    width: 300,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  p3PriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  p3Price: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 44,
    color: '#DEA65C',
    letterSpacing: 0.3,
  },
  p3Currency: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 17,
    color: '#DEA65C',
    marginLeft: 8,
    marginTop: 10,
  },
  p3Period: {
    marginTop: 10,
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#A8A297',
    letterSpacing: 2.6,
  },
  p3BudgetBar: {
    position: 'absolute',
    left: 72,
    top: 406,
    width: 1136,
    height: 54,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#C9A36A',
    backgroundColor: 'rgba(22,20,18,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  p3BudgetLabel: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#F3F1EA',
    letterSpacing: 2.4,
  },
  p3BudgetSep: {
    marginHorizontal: 20,
    width: 1,
    height: 18,
    backgroundColor: '#6B6670',
  },
  p3BudgetText: {
    flex: 1,
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 12.5,
    color: '#D2CEC4',
  },
  p3PromiseCard: {
    position: 'absolute',
    left: 72,
    top: 480,
    width: 1136,
    height: 138,
    borderWidth: 1,
    borderColor: '#C9A36A',
    borderRadius: 4,
    overflow: 'hidden',
    paddingVertical: 26,
    paddingHorizontal: 34,
    justifyContent: 'center',
  },
  p3PromiseBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1136,
    height: 138,
    objectFit: 'cover',
  },
  p3PromiseScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1136,
    height: 138,
    backgroundColor: 'rgba(10,8,6,0.18)',
  },
  p3PromiseLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  p3PromiseLine: {
    width: 24,
    height: 1.5,
    backgroundColor: '#DEA65C',
    marginRight: 12,
  },
  p3PromiseLabel: {
    fontFamily: 'Poppins',
    fontWeight: 600,
    fontSize: 11,
    color: '#C9C4B8',
    letterSpacing: 2.6,
  },
  p3PromiseTitle: {
    fontFamily: 'Poppins',
    fontWeight: 700,
    fontSize: 26,
    color: '#F7F4EE',
    marginBottom: 10,
  },
  p3PromiseDesc: {
    fontFamily: 'Inter',
    fontWeight: 400,
    fontSize: 13.5,
    color: '#C9C4B8',
    lineHeight: 1.4,
    maxWidth: 760,
  },
  p3FootRow: {
    position: 'absolute',
    left: 72,
    top: 662,
    flexDirection: 'row',
    alignItems: 'center',
  },
  p3FootLine: {
    width: 26,
    height: 1.5,
    backgroundColor: '#DEA65C',
    marginRight: 12,
  },
  p3Foot: {
    fontFamily: 'Plus Jakarta Sans',
    fontWeight: 600,
    fontSize: 11,
    color: '#7A756C',
    letterSpacing: 2.1,
  },
});

export async function renderProposalPdf(input: ProposalPdfInput): Promise<Buffer> {
  registerFonts();
  const lang: ProposalPdfLanguage = input.language === 'fr' ? 'fr' : 'en';
  const copy = COPY[lang];
  const d = {
    client: input.client || '',
    date: localizeDate(input.date, lang),
    offerName: localizeField(lang, input.offerName, 'offerName'),
    price: input.price || '13 500,00',
    currency: input.currency || 'DHS',
    period: localizeField(lang, input.period, 'period'),
    adBudget: localizeField(lang, input.adBudget, 'adBudget'),
  };
  const foot = copy.foot(d.client, d.date);

  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: PAGE, style: styles.page },
      React.createElement(Image, { src: BG1(), style: styles.bg }),
      React.createElement(Image, { src: LOGO(), style: styles.logo }),
      React.createElement(
        View,
        { style: styles.p1EyebrowWrap },
        React.createElement(Text, { style: styles.p1Eyebrow }, copy.confidentialLabel),
        React.createElement(View, { style: styles.p1EyebrowLine }),
      ),
      React.createElement(
        View,
        { style: styles.p1TitleWrap },
        React.createElement(
          Text,
          { style: styles.p1Title },
          React.createElement(Text, { style: styles.p1TitleGold }, copy.titleL1Gold),
          copy.titleL1Rest,
        ),
        React.createElement(Text, { style: styles.p1Title }, copy.titleL2),
      ),
      React.createElement(Text, { style: styles.p1Subtitle }, copy.subtitle),
      React.createElement(
        View,
        { style: styles.p1PreparedRow },
        React.createElement(View, { style: styles.p1PreparedLine }),
        React.createElement(Text, { style: styles.p1Prepared }, copy.preparedFor),
      ),
      React.createElement(Text, { style: styles.client }, (d.client || '').toUpperCase()),
      React.createElement(
        View,
        { style: styles.p1FootRow },
        React.createElement(
          Text,
          { style: styles.p1FootDate },
          (d.date || '').toUpperCase(),
        ),
        React.createElement(View, { style: styles.p1FootLine }),
        React.createElement(
          Text,
          { style: styles.p1FootConfidential },
          copy.confidentialLabel,
        ),
        React.createElement(View, { style: styles.p1FootLineEnd }),
      ),
    ),
    React.createElement(
      Page,
      { size: PAGE, style: styles.page },
      React.createElement(Image, { src: BG2(), style: styles.bg }),
      React.createElement(Image, { src: LOGO(), style: styles.logo }),
      React.createElement(
        View,
        { style: styles.p2EyebrowWrap },
        React.createElement(Text, { style: styles.p2Eyebrow }, copy.mechanismEyebrow),
        React.createElement(View, { style: styles.p2EyebrowLine }),
      ),
      React.createElement(
        View,
        { style: styles.p2TitleWrap },
        React.createElement(
          Text,
          { style: styles.p2Title },
          copy.mechanismTitle1 + ' ',
          React.createElement(Text, { style: styles.p2TitleGold }, copy.mechanismTitle2),
        ),
      ),
      React.createElement(
        View,
        { style: styles.p2Step1 },
        React.createElement(Text, { style: styles.p2StepLabel }, copy.step1Label),
        React.createElement(Text, { style: styles.p2StepTitle }, copy.step1Title),
        React.createElement(Text, { style: styles.p2StepBody }, copy.step1Body),
        React.createElement(
          View,
          { style: styles.p2OutcomeBox },
          React.createElement(
            Text,
            { style: styles.p2OutcomeText },
            React.createElement(Text, { style: styles.p2OutcomeGold }, copy.step1OutcomeLabel + ' '),
            copy.step1Outcome,
          ),
        ),
      ),
      React.createElement(
        View,
        { style: styles.p2Step2 },
        React.createElement(Text, { style: styles.p2StepLabel }, copy.step2Label),
        React.createElement(
          View,
          { style: styles.p2LoopItem },
          React.createElement(Text, { style: styles.p2LoopTitle }, copy.genTitle),
          React.createElement(Text, { style: styles.p2LoopBody }, copy.genBody),
        ),
        React.createElement(
          View,
          { style: styles.p2LoopItem },
          React.createElement(Text, { style: styles.p2LoopTitle }, copy.qualTitle),
          React.createElement(Text, { style: styles.p2LoopBody }, copy.qualBody),
        ),
        React.createElement(
          View,
          { style: styles.p2LoopItem },
          React.createElement(Text, { style: styles.p2LoopTitle }, copy.delTitle),
          React.createElement(Text, { style: styles.p2LoopBody }, copy.delBody),
        ),
        React.createElement(Text, { style: styles.p2FeedbackNote }, copy.feedbackNote),
      ),
      React.createElement(
        View,
        { style: styles.p2PromiseBar },
        React.createElement(Text, { style: styles.p2PromiseBadge }, copy.promiseBadge),
        React.createElement(View, { style: styles.p2PromiseSep }),
        React.createElement(Text, { style: styles.p2PromiseBanner }, copy.promiseBanner),
      ),
      React.createElement(View, { style: [styles.pageLine, { top: 618 }] }),
    ),
    React.createElement(
      Page,
      { size: PAGE, style: styles.page },
      React.createElement(Image, { src: BG3(), style: styles.bg }),
      React.createElement(Image, { src: LOGO(), style: styles.logo }),

      React.createElement(
        View,
        { style: styles.p3EyebrowWrap },
        React.createElement(Text, { style: styles.p3Eyebrow }, copy.eyebrow),
        React.createElement(View, { style: styles.p3EyebrowLine }),
      ),
      React.createElement(
        View,
        { style: styles.p3TitleWrap },
        React.createElement(Text, { style: styles.p3Title }, copy.title1),
        React.createElement(
          Text,
          { style: styles.p3Title },
          copy.title2Prefix,
          React.createElement(Text, { style: styles.p3TitleGold }, copy.title2Gold),
        ),
      ),

      React.createElement(
        View,
        { style: styles.p3OfferCard },
        React.createElement(
          View,
          { style: styles.p3OfferLeft },
          React.createElement(Text, { style: styles.p3OfferLabel }, copy.offerLabel),
          React.createElement(Text, { style: styles.p3OfferName }, d.offerName),
          React.createElement(Text, { style: styles.p3OfferDesc }, copy.offerDesc),
        ),
        React.createElement(View, { style: styles.p3OfferDivider }),
        React.createElement(
          View,
          { style: styles.p3OfferRight },
          React.createElement(
            View,
            { style: styles.p3PriceRow },
            React.createElement(Text, { style: styles.p3Price }, d.price),
            React.createElement(Text, { style: styles.p3Currency }, ' ' + d.currency),
          ),
          React.createElement(
            Text,
            { style: styles.p3Period },
            (d.period || '').toUpperCase(),
          ),
        ),
      ),

      React.createElement(
        View,
        { style: styles.p3BudgetBar },
        React.createElement(Text, { style: styles.p3BudgetLabel }, copy.budgetLabel),
        React.createElement(View, { style: styles.p3BudgetSep }),
        React.createElement(Text, { style: styles.p3BudgetText }, d.adBudget),
      ),

      React.createElement(
        View,
        { style: styles.p3PromiseCard },
        React.createElement(Image, { src: PROMISE_BG(), style: styles.p3PromiseBg }),
        React.createElement(View, { style: styles.p3PromiseScrim }),
        React.createElement(
          View,
          { style: styles.p3PromiseLabelRow },
          React.createElement(View, { style: styles.p3PromiseLine }),
          React.createElement(Text, { style: styles.p3PromiseLabel }, copy.promiseLabel),
        ),
        React.createElement(Text, { style: styles.p3PromiseTitle }, copy.promiseTitle),
        React.createElement(Text, { style: styles.p3PromiseDesc }, copy.promiseDesc),
      ),

      React.createElement(View, { style: styles.pageLine }),
      React.createElement(
        View,
        { style: styles.p3FootRow },
        React.createElement(Text, { style: styles.p3Foot }, foot),
      ),
    ),
  );

  return renderToBuffer(doc);
}
