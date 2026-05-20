export type PropositionStatus = 'draft' | 'sent' | 'accepted' | 'rejected';

export type PropositionEmetteur = {
  societeNom: string;
  societeRc: string;
  societeCnie: string;
  societeIce: string;
  societeTp: string;
  societeAdresse: string;
  societeTelephone: string;
  societeEmail: string;
};

export type PropositionIntroduction = {
  paragraphe1: string;
  paragraphe2: string;
  objectifProspects: number;
};

export type PropositionStrategie = {
  section1CreationContenu: {
    description: string;
    videosMin: number;
    videosMax: number;
    topics: string[];
  };
  section2CampagnesPublicitaires: { texte: string };
  section3FunnelMarketing: {
    intro: string;
    criteres: string[];
    conclusion: string;
  };
  section4Automatisation: {
    points: string[];
    objectif: string;
  };
};

export type PropositionTarifLigne = {
  service: string;
  prixInitial: string;
  prixOffert: string;
};

export type PropositionTarifs = {
  lignes: PropositionTarifLigne[];
  noteMetaAds: string;
};

export type PropositionContact = {
  nom: string;
  telephone: string;
  email: string;
  tagline: string;
};

export type PropositionPayload = {
  titreProposition: string;
  preparePour: string;
  clientNom: string;
  nomEtablissement: string;
  preparePar: string;
  dateEmission: string;
  propositionNumero?: string;
  clientIce?: string;
  clientEmail?: string;
  clientTelephone?: string;
  emetteur: PropositionEmetteur;
  introduction: PropositionIntroduction;
  strategie: PropositionStrategie;
  tarifs: PropositionTarifs;
  pourquoiChoisir: string[];
  prochainesEtapes: string;
  contact: PropositionContact;
};
