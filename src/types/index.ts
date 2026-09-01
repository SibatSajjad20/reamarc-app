export type ViewType = 'dashboard' | 'admin' | 'marketing' | 'daily-log' | 'attendance' | 'profile' | 'exceptions' | 'active-clients';

export * from './attendance';

export type ThemeMode = 'dark' | 'light';

export type MarketingPlatform = 'Meta' | 'Google' | 'TikTok' | 'WhatsApp' | 'Other';
export type MarketingStatus = 'Active' | 'Paused' | 'Error' | 'Stopped';

export interface Workspace {
  id: string;
  name: string;
  brandColor: string;
  initials: string;
  status?: 'active' | 'inactive';
  proposal_url?: string;
  proposal_name?: string;
  proposal_size?: number;
  project_cycle?: 'Retainer' | 'One-Time Project';
  priority?: 'High' | 'Medium' | 'Low';
  contract_start_date?: string;
  contract_end_date?: string;
  services?: string[];
  health?: 'Excellent' | 'Good' | 'Moderate' | 'Emergency';
  poc_name?: string;
  poc_email?: string;
  poc_phone?: string;
  billing_name?: string;
  billing_email?: string;
  billing_phone?: string;
  tagline?: string;
  description?: string;
  industry?: string;
  isDefault?: boolean;
}

import type { AdAccount } from './admin';
export type { AdAccount };

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'info' | 'error' | 'warning';
}

export interface MarketingMatrixRow {
  campaign_id: string;
  workspace_id: string;
  workspace_name: string;
  campaign_name: string;
  platform: MarketingPlatform;
  objective: string;
  industry: string;
  budget_set: number;
  status: MarketingStatus;
  metric_id: string;
  date: string;
  ad_spend: number;
  cpl_cpa: number;
  leads_conversions: number;
  impressions: number;
  clicks: number;
  reach: number;
  avg_frequency: number;
  remarks: string;
}
