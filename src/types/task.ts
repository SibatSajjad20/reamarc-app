export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskViewMode = 'list' | 'kanban' | 'calendar' | 'follow-up' | 'overview' | 'activity';
export type TaskScope = 'mine' | 'assigned_by_me' | 'created_by_me' | 'watching' | 'all';
export type TaskFollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'no_due';

export const TASK_STAGES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'completed', label: 'Completed' },
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export interface TaskAssignmentHop {
  from_id?: string | null;
  from_name?: string | null;
  to_id: string;
  to_name?: string;
  department?: string;
  at?: string;
  note?: string | null;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
  done_by?: string | null;
  done_at?: string | null;
}

export interface TaskRelated {
  workspace_id?: string | null;
  client_name?: string | null;
  website_project_id?: string | null;
  content_item_id?: string | null;
}

export interface TaskRecurrence {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
  by_weekday?: number[];
  until?: string | null;
}

export interface Task {
  id: string;
  serial: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  blocked?: boolean;
  blocked_reason?: string | null;
  creator_id?: string | null;
  creator_name?: string;
  assignee_id?: string | null;
  assignee_name?: string;
  assigner_id?: string | null;
  assigner_name?: string;
  department?: string;
  assignment_chain?: TaskAssignmentHop[];
  involved_ids?: string[];
  watcher_ids?: string[];
  start_date?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  reminder_offsets?: number[];
  estimate_hours?: number | null;
  progress?: number;
  checklist?: TaskChecklistItem[];
  parent_id?: string | null;
  related?: TaskRelated | null;
  recurrence?: TaskRecurrence | null;
  recurrence_source_id?: string | null;
  attachments_count?: number;
  comments_count?: number;
  subtasks_count?: number;
  subtasks_done?: number;
  subtasks?: Task[];
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;
  review_requested_at?: string | null;
  created_at?: string;
  updated_at?: string;
  view_only?: boolean;
}

export interface TaskListResponse {
  items: Task[];
  total: number;
  page: number;
  limit: number;
  stage_counts?: Partial<Record<TaskStatus, number>>;
  truncated?: boolean;
}

export interface TaskCounts {
  todo: number;
  in_progress: number;
  in_review: number;
  completed: number;
  cancelled: number;
  overdue: number;
  today: number;
  upcoming: number;
  no_due: number;
  blocked: number;
  open: number;
}

export interface TaskAssignableUser {
  id: string;
  name: string;
  role?: string;
  department?: string;
  departments?: string[];
  avatar?: string | null;
  will_add_watcher?: boolean;
}

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  text: string;
  mentions?: string[];
  question?: boolean;
  edited_at?: string | null;
  deleted?: boolean;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  kind: 'upload' | 'drive' | 'link';
  name: string;
  mime_type?: string | null;
  size_bytes?: number;
  storage_key?: string | null;
  drive_file_id?: string | null;
  url?: string | null;
  thumb?: string | null;
  has_thumb?: boolean;
  uploaded_by?: string;
  created_at: string;
}

export interface TaskConversation {
  task_id: string;
  serial: string;
  title: string;
  status: TaskStatus;
  last_comment?: {
    user_name: string;
    text_preview: string;
    created_at?: string | null;
  } | null;
  unread_count: number;
}

export interface TaskChatUnread {
  total: number;
  by_task: Record<string, number>;
}

export interface TaskActivity {
  id: string;
  task_id?: string;
  serial?: string;
  type: string;
  actor_id?: string | null;
  actor_name?: string;
  body?: string;
  meta?: Record<string, unknown>;
  created_at: string;
}

export interface TaskFilters {
  scope?: TaskScope;
  stage?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  assignee_id?: string;
  assigner_id?: string;
  department?: string;
  due_from?: string;
  due_to?: string;
  blocked?: boolean;
  q?: string;
  include_cancelled?: boolean;
  has_attachments?: boolean;
  related_client?: string;
}

export interface TaskSavedView {
  id: string;
  name: string;
  view: string;
  filters: TaskFilters;
}

export interface TaskSettings {
  excluded_roles: string[];
  excluded_departments: string[];
  wip_limit?: number | null;
  sla?: { urgent_hours?: number };
}

export interface TaskOverviewPerson {
  id: string;
  name: string;
  department: string;
  open: number;
  overdue: number;
  in_review: number;
  blocked: number;
}

export interface TaskOverview {
  people: TaskOverviewPerson[];
  departments: { department: string; open: number; overdue: number; blocked: number }[];
  counts: TaskCounts;
}

export type TaskActor = {
  id?: string;
  role?: string;
  full_name?: string;
  name?: string;
  departments?: string[];
  primary_department?: string;
  department?: string;
  is_active?: boolean;
};
