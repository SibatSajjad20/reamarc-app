import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'cagent_designations_list';
const DEFAULT_DESIGNATIONS = ['Web Development', 'Team Lead'];

// Event dispatcher for cross-component reactive sync
const EVENT_NAME = 'cagent:designations_updated';

export const useDesignations = () => {
  const [designations, setDesignations] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
    return DEFAULT_DESIGNATIONS;
  });

  const syncState = useCallback((newList: string[]) => {
    setDesignations(newList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newList));
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: newList }));
    } catch (e) {
      console.error('Failed to persist designations:', e);
    }
  }, []);

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<string[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setDesignations(customEvent.detail);
      }
    };
    window.addEventListener(EVENT_NAME, handleSync);
    return () => window.removeEventListener(EVENT_NAME, handleSync);
  }, []);

  const addDesignation = useCallback((title: string): boolean => {
    const trimmed = title.trim();
    if (!trimmed) return false;
    
    // Check if already exists (case-insensitive)
    const exists = designations.some((d) => d.toLowerCase() === trimmed.toLowerCase());
    if (exists) return false;

    const updated = [...designations, trimmed];
    syncState(updated);
    return true;
  }, [designations, syncState]);

  const updateDesignation = useCallback((oldTitle: string, newTitle: string): boolean => {
    const trimmed = newTitle.trim();
    if (!trimmed) return false;

    const exists = designations.some((d) => d.toLowerCase() === trimmed.toLowerCase() && d.toLowerCase() !== oldTitle.toLowerCase());
    if (exists) return false;

    const updated = designations.map((d) => (d.toLowerCase() === oldTitle.toLowerCase() ? trimmed : d));
    syncState(updated);
    return true;
  }, [designations, syncState]);

  const removeDesignation = useCallback((title: string): boolean => {
    if (designations.length <= 1) return false; // keep at least one
    const updated = designations.filter((d) => d.toLowerCase() !== title.toLowerCase());
    syncState(updated);
    return true;
  }, [designations, syncState]);

  return {
    designations,
    addDesignation,
    updateDesignation,
    removeDesignation,
  };
};
