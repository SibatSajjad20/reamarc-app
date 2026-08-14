export type TaskTypeOption = 'Scheduled Task' | 'Runtime Task';
export type TaskStatusOption = 'Completed' | 'Incomplete' | 'Blocker';

export interface DailyLogColumn {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date' | 'number';
  options?: string[];
  editable?: boolean;
  width?: string;
}

export interface DailyLogEntry {
  id: string;
  workspace_id: string;
  version: number;
  date: string;
  resource_name: string;
  role: string;
  client_project: string;
  task_description: string;
  task_type: TaskTypeOption | string;
  task_status: TaskStatusOption | string;
  revisions_done: string;
  deliverables: string;
  hours_utilized: number | string;
  remarks?: string;
  month_sheet: string;
  custom_fields?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface CreateDailyLogEntryPayload {
  date: string;
  resource_name?: string;
  role?: string;
  client_project?: string;
  task_description?: string;
  task_type?: string;
  task_status?: string;
  revisions_done?: string;
  deliverables?: string;
  hours_utilized?: number | string;
  remarks?: string;
  month_sheet?: string;
  custom_fields?: Record<string, any>;
}

export interface UpdateDailyLogEntryPayload {
  version?: number;
  date?: string;
  resource_name?: string;
  role?: string;
  client_project?: string;
  task_description?: string;
  task_type?: string;
  task_status?: string;
  revisions_done?: string;
  deliverables?: string;
  hours_utilized?: number | string;
  remarks?: string;
  month_sheet?: string;
  custom_fields?: Record<string, any>;
}

export interface GetDailyLogEntriesParams {
  month_sheet?: string;
  start_date?: string;
  end_date?: string;
  resource_name?: string;
  task_status?: string;
  task_type?: string;
  limit?: number;
  skip?: number;
}
