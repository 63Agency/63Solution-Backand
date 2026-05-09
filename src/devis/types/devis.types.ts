export type DevisLineComputed = {
  id: string;
  titre: string;
  description: string;
  quantite: number;
  prixUnitaireHt: number;
  totalLigneHt: number;
};

export type DevisTotals = {
  totalHt: number;
  montantTva: number;
  totalTtc: number;
};
