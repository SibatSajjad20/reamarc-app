import { useState, useEffect, useCallback } from 'react';
import type { InboxTask } from '../types';
import { postService } from '../services/postService';
import { useAsync } from './useAsync';

export function useInboxTasks(workspaceId?: string) {
  const [tasks, setTasks] = useState<InboxTask[]>([]);

  const fetchFn = useCallback(() => postService.getInboxTasks(workspaceId), [workspaceId]);
  const { isLoading, error, execute } = useAsync(fetchFn);

  const fetchTasks = useCallback(async () => {
    const data = await execute();
    if (data) {
      setTasks(data);
    } else {
      setTasks([]);
    }
  }, [execute]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const approveTask = async (taskId: number | string) => {
    setTasks((prev) => prev.filter((t) => String(t.id) !== String(taskId)));
    try {
      await postService.approvePost(taskId);
    } catch (err: any) {
      fetchTasks();
      throw err;
    }
  };

  const rejectTask = async (taskId: number | string) => {
    setTasks((prev) => prev.filter((t) => String(t.id) !== String(taskId)));
    try {
      await postService.rejectPost(taskId);
    } catch (err: any) {
      fetchTasks();
      throw err;
    }
  };

  const saveDraft = async (taskId: number | string, copy: string) => {
    setTasks((prev) =>
      prev.map((t) => (String(t.id) === String(taskId) ? { ...t, copy, lastModified: 'Just now' } : t))
    );
    try {
      await postService.saveDraft(taskId, copy);
    } catch (err: any) {
      fetchTasks();
      throw err;
    }
  };

  const regenerateFullPost = async (taskId: number | string): Promise<InboxTask | null> => {
    const res = await postService.regenerateFullPost(taskId);
    if (res?.post) {
      setTasks((prev) => prev.map((t) => (String(t.id) === String(taskId) ? res.post : t)));
      return res.post;
    }
    return null;
  };

  const refinePostWithFeedback = async (
    taskId: number | string,
    feedback: string,
    presetTags: string[] = []
  ): Promise<InboxTask | null> => {
    const res = await postService.feedbackRewritePost(taskId, feedback, presetTags);
    if (res?.post) {
      setTasks((prev) => prev.map((t) => (String(t.id) === String(taskId) ? res.post : t)));
      return res.post;
    }
    return null;
  };

  const revertPostVersion = async (taskId: number | string): Promise<InboxTask | null> => {
    const res = await postService.revertPostVersion(taskId);
    if (res?.post) {
      setTasks((prev) => prev.map((t) => (String(t.id) === String(taskId) ? res.post : t)));
      return res.post;
    }
    return null;
  };

  const bulkApprove = async (taskIds: (number | string)[]) => {
    const strIds = new Set(taskIds.map((id) => String(id)));
    setTasks((prev) => prev.filter((t) => !strIds.has(String(t.id))));
    try {
      await postService.bulkApprove(taskIds);
    } catch (err: any) {
      fetchTasks();
      throw err;
    }
  };

  const bulkReject = async (taskIds: (number | string)[]) => {
    const strIds = new Set(taskIds.map((id) => String(id)));
    setTasks((prev) => prev.filter((t) => !strIds.has(String(t.id))));
    try {
      await postService.bulkReject(taskIds);
    } catch (err: any) {
      fetchTasks();
      throw err;
    }
  };

  return {
    tasks,
    isLoading,
    error: error ? (error.message || 'Failed to fetch inbox tasks.') : null,
    refetch: fetchTasks,
    approveTask,
    rejectTask,
    saveDraft,
    regenerateFullPost,
    refinePostWithFeedback,
    revertPostVersion,
    bulkApprove,
    bulkReject,
    setTasks,
  };
}
