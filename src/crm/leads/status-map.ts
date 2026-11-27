/**
 * CRM LeadStatus (11) + mapping ClickUp → seed initial de crm_lead_meta.status.
 * Après seed, le statut CRM est la source de vérité (pas de writeback ClickUp).
 */

export const LEAD_STATUSES = [
  'new',
  'no_answer',
  'contacted',
  'call_back',
  'meeting_scheduled',
  'no_show',
  'proposal_sent',
  'follow_up',
  'won',
  'lost',
  'archived',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

/**
 * Table configurable : clés = statut ClickUp normalisé (trim + lower).
 * Statut inconnu → 'new'.
 */
export const CLICKUP_STATUS_TO_CRM: Record<string, LeadStatus> = {
  // English
  new: 'new',
  open: 'new',
  'to do': 'new',
  todo: 'new',
  'no answer': 'no_answer',
  no_answer: 'no_answer',
  contacted: 'contacted',
  contact: 'contacted',
  'call back': 'call_back',
  callback: 'call_back',
  'call_back': 'call_back',
  'meeting scheduled': 'meeting_scheduled',
  meeting: 'meeting_scheduled',
  scheduled: 'meeting_scheduled',
  'no show': 'no_show',
  no_show: 'no_show',
  'proposal sent': 'proposal_sent',
  proposal: 'proposal_sent',
  'follow up': 'follow_up',
  follow_up: 'follow_up',
  followup: 'follow_up',
  won: 'won',
  closed: 'won',
  'closed won': 'won',
  lost: 'lost',
  'closed lost': 'lost',
  archived: 'archived',
  complete: 'archived',
  done: 'archived',

  // Français (listes 63Agency / ClickUp)
  nouveau: 'new',
  'nouveau lead': 'new',
  'à faire': 'new',
  'a faire': 'new',
  'sans réponse': 'no_answer',
  'sans reponse': 'no_answer',
  'pas de réponse': 'no_answer',
  'pas de reponse': 'no_answer',
  contacté: 'contacted',
  contacte: 'contacted',
  'à rappeler': 'call_back',
  'a rappeler': 'call_back',
  rappel: 'call_back',
  'rdv fixé': 'meeting_scheduled',
  'rdv fixe': 'meeting_scheduled',
  'rendez-vous': 'meeting_scheduled',
  'meeting programmé': 'meeting_scheduled',
  'no-show': 'no_show',
  'proposition envoyée': 'proposal_sent',
  'proposition envoyee': 'proposal_sent',
  'suivi': 'follow_up',
  'à relancer': 'follow_up',
  'a relancer': 'follow_up',
  gagné: 'won',
  gagne: 'won',
  'clos – gagné': 'won',
  'clos - gagné': 'won',
  perdu: 'lost',
  'clos – perdu': 'lost',
  'clos - perdu': 'lost',
  archivé: 'archived',
  archive: 'archived',
  'hors cible': 'archived',
};

export function mapClickupStatus(
  clickupStatus: string | null | undefined,
): LeadStatus {
  const key = (clickupStatus ?? '').trim().toLowerCase();
  if (!key) return 'new';
  return CLICKUP_STATUS_TO_CRM[key] ?? 'new';
}
