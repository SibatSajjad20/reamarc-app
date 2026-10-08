export type WebsiteStage =
  | 'strategy'
  | 'content'
  | 'design'
  | 'assets'
  | 'development'
  | 'qa'
  | 'client_review'
  | 'production'
  | 'completed';

export type WebsiteHealth =
  | 'on_track'
  | 'waiting_on_client'
  | 'on_hold'
  | 'at_risk'
  | 'completed';

export type WebsiteType =
  | 'brochure'
  | 'ecommerce'
  | 'web_app'
  | 'landing_page'
  | 'redesign'
  | 'other';

export type TaskKind = 'task' | 'revision' | 'bug';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type GateKey = 'sitemap' | 'content' | 'design' | 'staging' | 'final';
export type GateStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved';

export type FileFolder =
  | 'strategy'
  | 'content'
  | 'design'
  | 'assets'
  | 'development'
  | 'qa'
  | 'final';

export interface TaskComment {
  id: string;
  user_id: string;
  user_name: string;
  text: string;
  created_at: string;
}

export interface WebsiteTask {
  id: string;
  project_id: string;
  project_name?: string | null;
  stage: WebsiteStage;
  name: string;
  assignee_id?: string | null;
  assignee_name?: string | null;
  department?: string | null;
  due_date?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  description?: string | null;
  required: boolean;
  comments?: TaskComment[];
  created_at: string;
  updated_at: string;
}

export interface GateDecisionHistoryItem {
  decision: 'approved' | 'changes_requested';
  actor_id: string;
  actor_name: string;
  round: number;
  comment?: string | null;
  timestamp: string;
}

export interface WebsiteGate {
  id: string;
  project_id: string;
  gate_key: GateKey;
  name: string;
  stage: WebsiteStage;
  status: GateStatus;
  round: number;
  history: GateDecisionHistoryItem[];
  comment_thread: TaskComment[];
  linked_files: string[];
  updated_at: string;
}

export interface WebsiteFile {
  id: string;
  project_id: string;
  folder: FileFolder;
  name: string;
  storage_key?: string | null;
  external_url?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  task_id?: string | null;
  gate_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface WebsiteActivity {
  id: string;
  project_id: string;
  type: string;
  body: string;
  actor_id?: string | null;
  actor_name?: string | null;
  created_at: string;
  meta?: Record<string, any>;
}

export interface WebsiteProject {
  id: string;
  name: string;
  workspace_id: string;
  client_name: string;
  manager_id: string;
  manager_name?: string | null;
  start_date?: string | null;
  target_launch_date?: string | null;
  website_type: WebsiteType;
  stage: WebsiteStage;
  health: WebsiteHealth;
  on_hold: boolean;
  at_risk_override?: boolean | null;
  staging_url?: string | null;
  live_url?: string | null;
  progress: number;
  frozen_progress?: number | null;
  active_gate_key?: GateKey | null;
  overdue_tasks_count: number;
  required_tasks_open: number;
  total_tasks_count: number;
  completed_tasks_count: number;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebsiteSummaryMetrics {
  active_projects: number;
  waiting_on_client: number;
  at_risk: number;
  overdue_tasks: number;
  launches_next_30_days: number;
  pending_approvals: number;
  on_hold: number;
}

export const WEBSITE_STAGES_CONFIG: {
  id: WebsiteStage;
  name: string;
  shortLabel: string;
  description: string;
  gateKey?: GateKey;
  color: string;
}[] = [
  {
    id: 'strategy',
    name: '1. Strategy',
    shortLabel: 'Strategy',
    description: 'Information architecture, wireframes, and sitemap definition.',
    gateKey: 'sitemap',
    color: 'emerald',
  },
  {
    id: 'content',
    name: '2. Content',
    shortLabel: 'Content',
    description: 'Copywriting, messaging, tone of voice, and page text review.',
    gateKey: 'content',
    color: 'blue',
  },
  {
    id: 'design',
    name: '3. Design',
    shortLabel: 'Design',
    description: 'UI/UX mockups, Figma layouts, components, and design system.',
    gateKey: 'design',
    color: 'purple',
  },
  {
    id: 'assets',
    name: '4. Creative Assets',
    shortLabel: 'Assets',
    description: 'Illustrations, 3D renders, video b-roll, animations, photography.',
    color: 'pink',
  },
  {
    id: 'development',
    name: '5. Development',
    shortLabel: 'Development',
    description: 'Frontend and backend engineering, CMS integration, responsive build.',
    color: 'cyan',
  },
  {
    id: 'qa',
    name: '6. Internal QA',
    shortLabel: 'QA',
    description: 'Cross-browser, cross-device testing, performance audits, bug resolution.',
    color: 'amber',
  },
  {
    id: 'client_review',
    name: '7. Client Review',
    shortLabel: 'Client Review',
    description: 'Staging website walkthrough and client sign-off review.',
    gateKey: 'staging',
    color: 'indigo',
  },
  {
    id: 'production',
    name: '8. Production',
    shortLabel: 'Production',
    description: 'Domain connection, DNS, SSL, live deployment, and handover.',
    gateKey: 'final',
    color: 'rose',
  },
  {
    id: 'completed',
    name: 'Completed',
    shortLabel: 'Completed',
    description: 'Final website handed over and project successfully archived.',
    color: 'zinc',
  },
];

export const WEBSITE_FOLDERS: { id: FileFolder; label: string }[] = [
  { id: 'strategy', label: 'Strategy & Sitemap' },
  { id: 'content', label: 'Content & Copy' },
  { id: 'design', label: 'Design & Mockups' },
  { id: 'assets', label: 'Creative Assets' },
  { id: 'development', label: 'Development & Code' },
  { id: 'qa', label: 'QA & Audits' },
  { id: 'final', label: 'Final & Handover' },
];

export const WEBSITE_TYPES_LIST: { id: WebsiteType; label: string }[] = [
  { id: 'brochure', label: 'Brochure' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'web_app', label: 'Web Application' },
  { id: 'landing_page', label: 'Landing Page' },
  { id: 'redesign', label: 'Redesign' },
  { id: 'other', label: 'Other' },
];

export const TASK_STATUS_COLUMNS: {
  id: TaskStatus;
  title: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
}[] = [
  {
    id: 'todo',
    title: 'To Do',
    dotColor: 'bg-zinc-400',
    badgeBg: 'bg-zinc-100 dark:bg-zinc-800',
    badgeText: 'text-zinc-600 dark:text-zinc-300',
    borderColor: 'border-zinc-200 dark:border-zinc-800',
  },
  {
    id: 'in_progress',
    title: 'In Progress',
    dotColor: 'bg-blue-500',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/40',
    badgeText: 'text-blue-700 dark:text-blue-300',
    borderColor: 'border-blue-200 dark:border-blue-800/60',
  },
  {
    id: 'review',
    title: 'In Review',
    dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    borderColor: 'border-amber-200 dark:border-amber-800/60',
  },
  {
    id: 'completed',
    title: 'Completed',
    dotColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    borderColor: 'border-emerald-200 dark:border-emerald-800/60',
  },
];

