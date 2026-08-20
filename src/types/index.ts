export type ViewType = 'dashboard' | 'inbox' | 'campaigns' | 'matrix' | 'knowledge' | 'settings' | 'admin' | 'marketing' | 'daily-log' | 'attendance' | 'profile';

export * from './attendance';

export type PlatformType = 'Instagram' | 'LinkedIn' | 'Facebook' | 'Twitter';

export type ToneType = 'Professional' | 'Punchy' | 'Witty' | 'Empathetic' | 'Bold & Visionary';

export type ThemeMode = 'dark' | 'light';

export type MarketingPlatform = 'Meta' | 'Google' | 'TikTok' | 'WhatsApp' | 'Other';
export type MarketingStatus = 'Active' | 'Paused' | 'Error' | 'Stopped';

export interface InboxTask {
  id: string;
  campaign: string;
  platform: PlatformType;
  date: string;
  copy: string;
  workspaceId: string;
  dayNumber?: number;
  status: 'pending' | 'approved' | 'draft';
  targetAudience?: string;
  hashtags?: string[];
  lastModified?: string;
  versions?: string[];
}

export interface DayPlan {
  day: number;
  topic: string;
  platform: PlatformType;
  preview: string;
}

export interface Campaign {
  id: string;
  title: string;
  status: 'Active' | 'Pending Plan Approval' | 'Completed';
  currentDay: number;
  totalDays: number;
  workspaceId: string;
  platforms: PlatformType[];
  targetAudience: string;
  tone: ToneType;
  createdAt: string;
  plan?: DayPlan[];
  matrixRows?: any[];
}

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'pdf' | 'docx' | 'txt' | 'md' | 'url';
  sizeOrTokens: string;
  workspaceId: string;
  dateAdded: string;
  status: 'indexed' | 'processing';
}

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
