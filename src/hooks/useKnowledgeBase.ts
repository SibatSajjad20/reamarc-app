import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeSource } from '../types';
import { knowledgeService } from '../services/knowledgeService';
import { useAsync } from './useAsync';

export function useKnowledgeBase(workspaceId?: string) {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);

  const fetchFn = useCallback(
    () => knowledgeService.getKnowledgeSources(workspaceId),
    [workspaceId]
  );
  const { isLoading, error, execute } = useAsync(fetchFn);

  const fetchSources = useCallback(async () => {
    const data = await execute();
    setSources(data ?? []);
  }, [execute]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const uploadFiles = async (files: File[], wsId: string): Promise<KnowledgeSource[]> => {
    const created = await knowledgeService.uploadFiles(files, wsId);
    setSources((prev) => [...created, ...prev]);
    return created;
  };

  const uploadPdf = async (file: File, wsId: string): Promise<KnowledgeSource> => {
    const created = await uploadFiles([file], wsId);
    return created[0];
  };

  const scrapeUrl = async (url: string, wsId: string): Promise<KnowledgeSource> => {
    const created = await knowledgeService.scrapeUrl(url, wsId);
    setSources((prev) => [created, ...prev]);
    return created;
  };

  const deleteSource = async (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    try {
      await knowledgeService.deleteKnowledgeSource(id);
    } catch (err: any) {
      fetchSources();
      throw err;
    }
  };

  return {
    sources,
    isLoading,
    error: error ? (error.message || 'Failed to fetch knowledge sources.') : null,
    refetch: fetchSources,
    uploadFiles,
    uploadPdf,
    scrapeUrl,
    deleteSource,
    setSources,
  };
}
