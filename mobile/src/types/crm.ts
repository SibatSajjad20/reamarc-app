export type CrmStageId =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'session_booked'
  | 'session_done';

export type CrmDealStageId =
  | 'opportunity_created'
  | 'requirement_confirmed'
  | 'proposal_sent'
  | 'negotiation'
  | 'verbal_approval'
  | 'contract_sent'
  | 'contract_signed'
  | 'payment_pending'
  | 'payment_done';

export type CrmOutcome = 'won' | 'lost' | 'disqualified';

export interface CrmPipelineStage {
  id: string;
  name: string;
  order: number;
}

export interface CrmMeetingDetails {
  event_id?: string | null;
  invitee_id?: string | null;
  event_name?: string | null;
  date?: string | null;
  slot_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  timezone?: string | null;
  join_url?: string | null;
  status?: 'scheduled' | 'rescheduled' | 'canceled' | string;
  host_name?: string | null;
  host_email?: string | null;
  questions_and_answers?: Array<{ question: string; answer: string }>;
  rescheduled?: boolean;
  canceled_at?: string | null;
  cancellation_reason?: string | null;
}

export interface CrmLead {
  id: string;
  name: string;
  company?: string | null;
  website?: string | null;
  email?: string | null;
  phone_raw?: string | null;
  phone_e164?: string | null;
  phone_valid: boolean;
  wa_url?: string | null;
  city?: string | null;
  service?: string | null;
  budget?: string | null;
  source: string;
  campaign?: string | null;
  stage: string;
  outcome?: CrmOutcome | null;
  disqualify_reason?: string | null;
  lost_reason?: string | null;
  approval_status?: 'pending_operations' | 'approved' | 'rejected' | null;
  payment_cleared?: boolean;
  deals_count?: number;
  total_deal_value?: number;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  assigned_at?: string | null;
  contacted: boolean;
  contacted_at?: string | null;
  whatsapp_opened_at?: string | null;
  last_activity_at?: string | null;
  next_follow_up_at?: string | null;
  tags: string[];
  converted_workspace_id?: string | null;
  meeting?: CrmMeetingDetails | null;
  created_at: string;
  updated_at: string;
}

export interface CrmActivity {
  id: string;
  lead_id: string;
  type: string;
  body: string;
  actor_id?: string | null;
  actor_name?: string | null;
  created_at: string;
  meta: Record<string, unknown>;
}

export interface CrmLeadDetail extends CrmLead {
  activities: CrmActivity[];
}

export interface CrmCounts {
  incoming: number;
  assigned: number;
  uncontacted: number;
  opened_not_confirmed: number;
  contacted_under_15m: number;
  won: number;
  lost?: number;
  win_rate?: number | null;
}

export interface CrmAssignee {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department?: string | null;
}

export interface CrmLeadCreatePayload {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  website?: string;
  city?: string;
  service?: string;
  budget?: string;
  source?: string;
  note?: string;
  assigned_to?: string;
}

export interface CrmDeal {
  id: string;
  lead_id: string;
  title: string;
  service: string;
  value: number;
  currency: string;
  billing_type: 'one_time' | 'retainer';
  stage: string;
  status: 'open' | 'won' | 'lost';
  lost_reason?: string | null;
  approval_status?: 'pending_operations' | 'approved' | 'rejected' | null;
  payment_cleared?: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  lead?: {
    id: string;
    name: string;
    company?: string | null;
    phone_e164?: string | null;
    assigned_to_name?: string | null;
  } | null;
}

export interface CrmDealCreatePayload {
  title: string;
  service: string;
  value: number;
  currency?: string;
  billing_type?: 'one_time' | 'retainer';
  stage?: string;
  notes?: string;
}

export interface CrmTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}
