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

export type CrmDealType = 'new_business' | 'upsell' | 'renewal';
export type CrmDealPaymentStatus = 'pending' | 'partial' | 'cleared';
export type CrmLostReason =
  | 'budget'
  | 'timing'
  | 'competitor'
  | 'no_response'
  | 'not_a_fit'
  | 'scope_mismatch'
  | 'unqualified'
  | 'other';

export type CrmOutcome = 'won' | 'lost' | 'disqualified';

export type CrmDisqualifyReason = 'spam' | 'test' | 'competitor' | 'duplicate' | 'unqualified';

export interface CrmPipelineStage {
  id: CrmStageId | CrmDealStageId | string;
  name: string;
  order: number;
}

export interface CrmAttribution {
  platform?: string | null;
  campaign?: string | null;
  campaign_name?: string | null;
  campaign_id?: string | null;
  adset?: string | null;
  adset_name?: string | null;
  adset_id?: string | null;
  ad?: string | null;
  ad_name?: string | null;
  ad_id?: string | null;
  form_id?: string | null;
  form_name?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  click_id?: string | null;
  referrer?: string | null;
}

export interface CrmMeetingDetails {
  event_id?: string | null;
  invitee_id?: string | null;
  event_name?: string | null;
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
  proposal_config?: Record<string, any> | null;
  deals?: CrmDeal[];
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
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  attribution?: CrmAttribution | null;
  meeting?: CrmMeetingDetails | null;
  custom_fields?: Record<string, any>;
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

export interface CrmLeadList {
  items: CrmLead[];
  total: number;
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
  campaign?: string;
  note?: string;
  assigned_to?: string;
}

export type CrmRuleMethod = 'round_robin' | 'claim' | 'manual';

export interface CrmRuleCondition {
  field: string;
  op: string;
  value: string;
}

export interface CrmAssignmentRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  method: CrmRuleMethod | string;
  pool: string[];
  fallback_user_id?: string | null;
  after_hours: string;
  conditions: CrmRuleCondition[];
  cursor: number;
  updated_at?: string | null;
}

export interface CrmRulePayload {
  name: string;
  enabled?: boolean;
  priority?: number;
  method: string;
  pool: string[];
  fallback_user_id?: string | null;
  after_hours?: string;
  conditions?: CrmRuleCondition[];
}

export interface CrmTemplate {
  id: string;
  name: string;
  body: string;
  is_default: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface CrmTemplatePayload {
  name: string;
  body: string;
  is_default?: boolean;
}

export interface CrmWhatsAppOpenResult extends CrmLead {
  wa_url?: string | null;
  rendered_text?: string | null;
  template_id?: string | null;
  template_name?: string | null;
}

export interface CrmIngestSource {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  default_source: string;
  default_campaign?: string | null;
  token_prefix: string;
  ingest_path?: string | null;
  token?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  last_used_at?: string | null;
  hit_count: number;
}

export interface CrmIngestSourcePayload {
  name: string;
  default_source?: string;
  default_campaign?: string | null;
  kind?: string;
}

export interface CrmLeadUpdatePayload extends Partial<CrmLeadCreatePayload> {
  stage?: string;
  next_follow_up_at?: string | null;
  proposal_config?: Record<string, any>;
}

export interface CrmApproveWonPayload {
  payment_cleared?: boolean;
  workspace_name?: string;
  brand_color?: string;
  services?: string[];
  project_cycle?: string;
  note?: string;
}

export interface CrmReopenPayload {
  stage?: string;
  target_stage?: string;
  note?: string;
}

export interface CrmDeal {
  id: string;
  lead_id: string;
  title: string;
  service: string;
  additional_services?: string[];
  value: number;
  currency: string;
  billing_type: 'one_time' | 'retainer' | string;
  stage: CrmDealStageId | string;
  status: 'open' | 'won' | 'lost' | string;
  deal_type?: CrmDealType | string;
  probability?: number;
  expected_revenue?: number;
  expected_close_date?: string | null;
  payment_status?: CrmDealPaymentStatus | string;
  lost_reason?: string | null;
  approval_status?: 'pending_operations' | 'approved' | 'rejected' | null;
  payment_cleared?: boolean;
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  notes?: string | null;
  workspace_name?: string | null;
  brand_color?: string | null;
  priority?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  next_follow_up_at?: string | null;
  budget_display?: string | null;
  converted_workspace_id?: string | null;
  created_at: string;
  updated_at: string;
  lead?: CrmDealLeadSnapshot | null;
}

export interface CrmDealLeadSnapshot {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone_e164?: string | null;
  phone_raw?: string | null;
  assigned_to?: string | null;
  assigned_to_name?: string | null;
  stage?: string | null;
}

export interface CrmDealCreatePayload {
  title: string;
  service: string;
  additional_services?: string[];
  value: number;
  currency?: string;
  billing_type?: 'one_time' | 'retainer';
  stage?: CrmDealStageId | string;
  status?: 'open' | 'won' | 'lost';
  deal_type?: CrmDealType | string;
  probability?: number;
  expected_revenue?: number;
  expected_close_date?: string | null;
  payment_status?: CrmDealPaymentStatus | string;
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  notes?: string | null;
  workspace_name?: string | null;
  brand_color?: string | null;
  priority?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  next_follow_up_at?: string | null;
  budget_display?: string | null;
}

export interface CrmDealUpdatePayload {
  title?: string;
  service?: string;
  additional_services?: string[];
  value?: number;
  currency?: string;
  billing_type?: string;
  stage?: CrmDealStageId | string;
  status?: string;
  deal_type?: CrmDealType | string;
  probability?: number;
  expected_revenue?: number;
  expected_close_date?: string | null;
  payment_status?: CrmDealPaymentStatus | string;
  lost_reason?: string | null;
  proposal_url?: string | null;
  proposal_name?: string | null;
  proposal_size?: number | null;
  notes?: string | null;
  workspace_name?: string | null;
  brand_color?: string | null;
  priority?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  poc_name?: string | null;
  poc_email?: string | null;
  poc_phone?: string | null;
  billing_name?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  next_follow_up_at?: string | null;
  budget_display?: string | null;
}

export interface CrmDealList {
  deals: CrmDeal[];
  total_count: number;
  total_value: number;
}

export type CrmSubSection = 'board' | 'deals' | 'list' | 'followup' | 'settings' | 'templates' | 'ingest' | 'rules';

export interface CrmMetaPage {
  id: string;
  page_id: string;
  page_name: string;
  workspace_id?: string | null;
  default_campaign?: string | null;
  is_active: boolean;
  token_preview: string;
  created_at?: string;
  updated_at?: string;
  is_env?: boolean;
}

export interface CrmQueueStats {
  pending: number;
  processing: number;
  completed: number;
  retry: number;
  failed: number;
}

