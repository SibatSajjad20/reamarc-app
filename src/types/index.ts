export type ViewType = 'inbox' | 'campaigns' | 'knowledge' | 'settings';

export type PlatformType = 'Instagram' | 'LinkedIn' | 'Facebook' | 'Twitter';

export type ToneType = 'Professional' | 'Punchy' | 'Witty' | 'Empathetic' | 'Bold & Visionary';

export type ThemeMode = 'dark' | 'light';

export interface InboxTask {
  id: number;
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
}

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'pdf' | 'url';
  sizeOrTokens: string;
  workspaceId: string;
  dateAdded: string;
  status: 'indexed' | 'processing';
}

export interface Workspace {
  id: string;
  name: string;
  brandColor: string;
  tagline?: string;
  initials: string;
  industry?: string;
  isDefault?: boolean;
}


export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'info' | 'error' | 'warning';
}
