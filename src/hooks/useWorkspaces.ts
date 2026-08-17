import { useState, useEffect, useCallback } from 'react';
import type { Workspace } from '../types';
import { workspaceService, type WorkspaceCreatePayload, type WorkspaceUpdatePayload } from '../services/workspaceService';
import { useAsync } from './useAsync';
import { apiClient } from '../services/apiClient';

export function useWorkspaces(enabled: boolean = true) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspaceState] = useState<Workspace | null>(null);

  const fetchFn = useCallback(() => (enabled ? workspaceService.getWorkspaces() : Promise.resolve([])), [enabled]);
  const { isLoading, error, execute } = useAsync(fetchFn);

  const setSelectedWorkspace = useCallback((ws: Workspace | null) => {
    setSelectedWorkspaceState(ws);
    apiClient.setWorkspaceId(ws?.id || null);
    if (ws) {
      localStorage.setItem('reamarc_selected_workspace_id', ws.id);
      localStorage.setItem('reamarc_active_workspace_id', ws.id);
    } else {
      localStorage.setItem('reamarc_selected_workspace_id', 'ALL');
      localStorage.removeItem('reamarc_active_workspace_id');
    }
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    if (!enabled) return;
    const data = await execute();
    if (data) {
      const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      setWorkspaces(sorted);
      const savedWsId = localStorage.getItem('reamarc_selected_workspace_id') || localStorage.getItem('reamarc_active_workspace_id');
      if (savedWsId && savedWsId !== 'ALL') {
        const found = sorted.find((w) => w.id === savedWsId);
        if (found) {
          setSelectedWorkspaceState(found);
          apiClient.setWorkspaceId(found.id);
        }
      }
    } else {
      setWorkspaces([]);
    }
  }, [enabled, execute]);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const saveWorkspace = async (
    workspaceToEdit: Workspace | null,
    data: WorkspaceCreatePayload | WorkspaceUpdatePayload
  ) => {
    if (workspaceToEdit) {
      const updated = await workspaceService.updateWorkspace(workspaceToEdit.id, data as WorkspaceUpdatePayload);
      setWorkspaces((prev) =>
        prev
          .map((w) => (w.id === updated.id ? updated : w))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      );
      if (selectedWorkspace?.id === updated.id) {
        setSelectedWorkspace(updated);
      }
      return { workspace: updated, isNew: false };
    } else {
      const created = await workspaceService.createWorkspace(data as WorkspaceCreatePayload);
      setWorkspaces((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      );
      setSelectedWorkspace(created);
      return { workspace: created, isNew: true };
    }
  };

  const deleteWorkspace = async (workspaceId: string) => {
    // Optimistic state update
    const previousWorkspaces = [...workspaces];
    setWorkspaces((prev) => prev.filter((w) => w.id !== workspaceId));
    if (selectedWorkspace?.id === workspaceId) {
      setSelectedWorkspace(null);
    }

    try {
      await workspaceService.deleteWorkspace(workspaceId);
    } catch (err) {
      // Rollback on failure
      setWorkspaces(previousWorkspaces);
      throw err;
    }
  };

  return {
    workspaces,
    selectedWorkspace,
    setSelectedWorkspace,
    isLoading,
    error: error ? (error.message || 'Failed to fetch workspaces.') : null,
    refetch: fetchWorkspaces,
    saveWorkspace,
    deleteWorkspace,
  };
}
