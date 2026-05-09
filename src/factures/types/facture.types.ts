export type FactureLineComputed = {
  id: string;
  titre: string;
  description: string;
  quantite: number;
  prixUnitaireHt: number;
  totalLigneHt: number;
};

export type FactureTotals = {
  totalHt: number;
  montantTva: number;
  totalTtc: number;
};
