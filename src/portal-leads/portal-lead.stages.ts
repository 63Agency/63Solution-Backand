export const PORTAL_LEAD_STAGES = [
  'nouveau',
  'contacte',
  'sans_reponse',
  'qualifie',
  'rdv_fixe',
  'proposition_envoyee',
  'gagne',
  'perdu',
] as const;

export type PortalLeadStage = (typeof PORTAL_LEAD_STAGES)[number];
