import type { PortalLeadStage } from './portal-lead.stages';

const STAGE_LABELS: Record<PortalLeadStage, string> = {
  nouveau: 'Nouveau',
  contacte: 'Contacté',
  sans_reponse: 'Sans réponse',
  qualifie: 'Qualifié',
  rdv_fixe: 'RDV fixé',
  proposition_envoyee: 'Proposition envoyée',
  gagne: 'Gagné',
  perdu: 'Perdu',
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage as PortalLeadStage] ?? stage;
}
