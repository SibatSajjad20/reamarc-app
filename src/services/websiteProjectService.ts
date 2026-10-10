/**
 * Service for Website Project Pipeline API communications.
 * Communicates with /api/v1/website-projects endpoints via apiClient.
 */
import { apiClient } from './apiClient';
import { BoundedCache, type CacheEntry } from '../utils/cache';
import { emitInvalidation, registerCacheClearer } from '../utils/cacheBus';

const wpProjectsCache = new BoundedCache<{ items: WebsiteProject[]; total: number }>(10);
const wpMetricsCache = new BoundedCache<WebsiteSummaryMetrics>(2);
const wpTasksCache = new BoundedCache<WebsiteTask[]>(2);
const wpTeamMembersCache = new BoundedCache<Array<{ id: string; name: string; full_name: string; email: string; role: string; department: string }>>(2);
import type {
  WebsiteProject,
  WebsiteTask,
  WebsiteGate,
  WebsiteFile,
  WebsiteActivity,
  WebsiteSummaryMetrics,
  TaskComment,
} from '../types/websiteProject';
import type { DrivePickerConfig } from '../types/contentCalendar';

export interface WebsiteProjectFilter {
  workspace_id?: string;
  stage?: string;
  health?: string;
  website_type?: string;
  manager_id?: string;
  search?: string;
}

export const websiteProjectService = {
  async getProjects(filter?: WebsiteProjectFilter): Promise<{ items: WebsiteProject[]; total: number }> {
    const params = new URLSearchParams();
    if (filter?.workspace_id && filter.workspace_id !== 'all') params.set('workspace_id', filter.workspace_id);
    if (filter?.stage && filter.stage !== 'all') params.set('stage', filter.stage);
    if (filter?.health && filter.health !== 'all') params.set('health', filter.health);
    if (filter?.website_type && filter.website_type !== 'all') params.set('website_type', filter.website_type);
    if (filter?.manager_id && filter.manager_id !== 'all') params.set('manager_id', filter.manager_id);
    if (filter?.search?.trim()) params.set('search', filter.search.trim());
    params.set('limit', '500');

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    const cached = wpProjectsCache.get(queryStr);
    if (cached && Date.now() - cached.fetchedAt < 60_000) {
      return cached.data;
    }

    const res = await apiClient.get<{ items: WebsiteProject[]; total: number }>(`/website-projects${queryStr}`);
    wpProjectsCache.set(queryStr, res);
    return res;
  },

  async getSummaryMetrics(): Promise<WebsiteSummaryMetrics> {
    return apiClient.get<WebsiteSummaryMetrics>('/website-projects/metrics/summary');
  },

  async getTeamMembers(): Promise<Array<{ id: string; name: string; full_name: string; email: string; role: string; department: string }>> {
    return apiClient.get('/website-projects/team-members');
  },

  async getProject(id: string): Promise<WebsiteProject> {
    return apiClient.get<WebsiteProject>(`/website-projects/${id}`);
  },

  async createProject(payload: {
    name: string;
    workspace_id: string;
    client_name?: string;
    manager_id: string;
    manager_name?: string;
    start_date?: string;
    target_launch_date?: string;
    website_type?: string;
    staging_url?: string;
    live_url?: string;
    description?: string;
  }): Promise<WebsiteProject> {
    const res = await apiClient.post<WebsiteProject>('/website-projects', payload);
    wpProjectsCache.clear();
    wpMetricsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async updateProject(
    id: string,
    payload: Partial<Omit<WebsiteProject, 'stage' | 'health' | 'gates' | 'progress'>>,
  ): Promise<WebsiteProject> {
    const res = await apiClient.patch<WebsiteProject>(`/website-projects/${id}`, payload);
    wpProjectsCache.clear();
    wpMetricsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async transitionStage(id: string, targetStage: string, note?: string): Promise<WebsiteProject> {
    const res = await apiClient.post<WebsiteProject>(`/website-projects/${id}/transition`, {
      target_stage: targetStage,
      note,
    });
    wpProjectsCache.clear();
    wpMetricsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async forceTransitionStage(id: string, targetStage: string, reason: string): Promise<WebsiteProject> {
    const res = await apiClient.post<WebsiteProject>(`/website-projects/${id}/force-transition`, {
      target_stage: targetStage,
      reason,
    });
    wpProjectsCache.clear();
    wpMetricsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  // Task operations
  async getAllTasks(filter?: {
    project_id?: string;
    stage?: string;
    status?: string;
    assignee_id?: string;
    search?: string;
  }): Promise<WebsiteTask[]> {
    const params = new URLSearchParams();
    if (filter?.project_id && filter.project_id !== 'all') params.set('project_id', filter.project_id);
    if (filter?.stage && filter.stage !== 'all') params.set('stage', filter.stage);
    if (filter?.status && filter.status !== 'all') params.set('status', filter.status);
    if (filter?.assignee_id && filter.assignee_id !== 'all') params.set('assignee_id', filter.assignee_id);
    if (filter?.search?.trim()) params.set('search', filter.search.trim());
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<WebsiteTask[]>(`/website-projects/tasks${queryStr}`);
  },

  async getTasks(projectId: string, stage?: string, assigneeId?: string): Promise<WebsiteTask[]> {
    const params = new URLSearchParams();
    if (stage) params.set('stage', stage);
    if (assigneeId) params.set('assignee_id', assigneeId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<WebsiteTask[]>(`/website-projects/${projectId}/tasks${queryStr}`);
  },

  async createTask(projectId: string, payload: Partial<WebsiteTask>): Promise<WebsiteTask> {
    const res = await apiClient.post<WebsiteTask>(`/website-projects/${projectId}/tasks`, payload);
    wpTasksCache.clear();
    wpProjectsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async updateTask(projectId: string, taskId: string, payload: Partial<WebsiteTask>): Promise<WebsiteTask> {
    const res = await apiClient.patch<WebsiteTask>(`/website-projects/${projectId}/tasks/${taskId}`, payload);
    wpTasksCache.clear();
    wpProjectsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    await apiClient.delete<void>(`/website-projects/${projectId}/tasks/${taskId}`);
    wpTasksCache.clear();
    wpProjectsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
  },

  async addTaskComment(projectId: string, taskId: string, text: string): Promise<TaskComment[]> {
    return apiClient.post<TaskComment[]>(`/website-projects/${projectId}/tasks/${taskId}/comments`, { text });
  },

  // Gate operations
  async getGates(projectId: string): Promise<WebsiteGate[]> {
    return apiClient.get<WebsiteGate[]>(`/website-projects/${projectId}/gates`);
  },

  async submitGate(
    projectId: string,
    gateKey: string,
    payload: { notes?: string; file_ids?: string[] },
  ): Promise<WebsiteGate> {
    const res = await apiClient.post<WebsiteGate>(`/website-projects/${projectId}/gates/${gateKey}/submit`, payload);
    wpProjectsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async recordGateDecision(
    projectId: string,
    gateKey: string,
    payload: { decision: 'approved' | 'changes_requested'; comment?: string; file_ids?: string[] },
  ): Promise<WebsiteGate> {
    const res = await apiClient.post<WebsiteGate>(`/website-projects/${projectId}/gates/${gateKey}/decision`, payload);
    wpProjectsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async createRevisionTask(
    projectId: string,
    gateKey: string,
    payload: {
      name?: string;
      assignee_id?: string;
      assignee_name?: string;
      department?: string;
      due_date?: string;
      priority?: string;
    },
  ): Promise<WebsiteTask> {
    const res = await apiClient.post<WebsiteTask>(`/website-projects/${projectId}/gates/${gateKey}/revision-task`, payload);
    wpTasksCache.clear();
    wpProjectsCache.clear();
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  // File operations
  async getFiles(projectId: string, folder?: string): Promise<WebsiteFile[]> {
    const params = new URLSearchParams();
    if (folder) params.set('folder', folder);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<WebsiteFile[]>(`/website-projects/${projectId}/files${queryStr}`);
  },

  async createFile(projectId: string, payload: Partial<WebsiteFile>): Promise<WebsiteFile> {
    const res = await apiClient.post<WebsiteFile>(`/website-projects/${projectId}/files`, payload);
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  async deleteFile(projectId: string, fileId: string): Promise<void> {
    await apiClient.delete<void>(`/website-projects/${projectId}/files/${fileId}`);
    emitInvalidation(['website-pipeline', 'dashboard']);
  },

  async getDrivePickerConfig(projectId: string, taskId?: string): Promise<DrivePickerConfig> {
    const params = new URLSearchParams();
    if (taskId) params.set('task_id', taskId);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<DrivePickerConfig>(`/website-projects/${projectId}/picker-config${queryStr}`);
  },

  async attachDriveFiles(
    projectId: string,
    payload: {
      task_id?: string;
      gate_id?: string;
      folder?: string;
      files: Array<{
        id: string;
        name: string;
        mime_type?: string;
        url: string;
        size_bytes?: number;
      }>;
    }
  ): Promise<WebsiteFile[]> {
    const res = await apiClient.post<WebsiteFile[]>(`/website-projects/${projectId}/files/from-drive`, payload);
    emitInvalidation(['website-pipeline', 'dashboard']);
    return res;
  },

  // Activities
  async getActivities(projectId: string, limit: number = 50): Promise<WebsiteActivity[]> {
    return apiClient.get<WebsiteActivity[]>(`/website-projects/${projectId}/activities?limit=${limit}`);
  },

  getCachedProjects(filterKey: string = '?limit=500'): CacheEntry<{ items: WebsiteProject[]; total: number }> | undefined {
    return wpProjectsCache.get(filterKey);
  },
  setCachedProjects(filterKey: string = '?limit=500', data?: { items: WebsiteProject[]; total: number }): void {
    if (data) wpProjectsCache.set(filterKey, data);
  },
  getCachedMetrics(): CacheEntry<WebsiteSummaryMetrics> | undefined {
    return wpMetricsCache.get('metrics');
  },
  setCachedMetrics(data: WebsiteSummaryMetrics): void {
    wpMetricsCache.set('metrics', data);
  },
  getCachedTasks(): CacheEntry<WebsiteTask[]> | undefined {
    return wpTasksCache.get('tasks');
  },
  setCachedTasks(data: WebsiteTask[]): void {
    wpTasksCache.set('tasks', data);
  },
  getCachedTeamMembers(): CacheEntry<Array<{ id: string; name: string; full_name: string; email: string; role: string; department: string }>> | undefined {
    return wpTeamMembersCache.get('team_members');
  },
  setCachedTeamMembers(data: Array<{ id: string; name: string; full_name: string; email: string; role: string; department: string }>): void {
    wpTeamMembersCache.set('team_members', data);
  },
  hasInitialCache(): boolean {
    return wpProjectsCache.size() > 0;
  },
  clearAllCaches(): void {
    wpProjectsCache.clear();
    wpMetricsCache.clear();
    wpTasksCache.clear();
    wpTeamMembersCache.clear();
  },
};

// Register for app-wide cache sweep on logout and user switch
registerCacheClearer(() => websiteProjectService.clearAllCaches());
