import type { LeadFormAnswer } from './form-answers';
import type { LeadStatus } from './status-map';

/** Stages Kanban front (deal stub jusqu’à table deals). */
export type DealStage =
  | 'booked'
  | 'need_proposal'
  | 'proposal_sent'
  | 'waiting_payment'
  | 'paid'
  | 'lost';

/** Contrat front Lead (base). */
export type CrmLeadBase = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  funnel?: string | null;
  form_name?: string | null;
  campaign?: string | null;
  campaign_id?: string | null;
  adset?: string | null;
  adset_id?: string | null;
  ad?: string | null;
  ad_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  fbclid?: string | null;
  form_answers?: LeadFormAnswer[];
  niche_id?: string | null;
  owner_id?: string | null;
};

/** GET /crm/leads — LeadRow */
export type LeadRow = CrmLeadBase & {
  status: LeadStatus;
  meetings: number;
  done: number;
  noShow: number;
  nextMeeting: string | null;
  dealId: string | null;
  dealStage: DealStage | null;
  ownerId: string | null;
  noteCount: number;
  lastNote: string | null;
  nextReminder: string | null;
};

/** GET /crm/leads/:id — FullLead */
export type FullLead = CrmLeadBase & {
  status: LeadStatus;
  dealId: string | null;
  ownerId: string | null;
};

export type CrmMeeting = {
  id: string;
  title: string;
  start_at: string;
  status: string;
  meeting_link: string | null;
};

export type CrmDealStub = {
  id: string;
  owner_id: string | null;
} | null;

export type LeadDetailResponse = {
  lead: FullLead;
  deal: CrmDealStub;
  meetings: CrmMeeting[];
};
