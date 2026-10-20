import { createContext, useContext, useMemo } from 'react';
import type { Workspace } from '../types';
import type { ContentCalendarItem } from '../types/contentCalendar';
import { useWorkspaces } from './useWorkspaces';

export type ResolveClient = (item: {
  workspace_id?: string | null;
  client_name?: string | null;
}) => Workspace | null;

export function buildClientLookup(workspaces: Workspace[]): ResolveClient {
  const byId = new Map<string, Workspace>();
  const byName = new Map<string, Workspace>();
  for (const ws of workspaces) {
    byId.set(ws.id, ws);
    const key = (ws.name || '').trim().toLowerCase();
    if (key) byName.set(key, ws);
  }
  return (item) => {
    if (item.workspace_id && byId.has(item.workspace_id)) {
      return byId.get(item.workspace_id) || null;
    }
    const name = (item.client_name || '').trim().toLowerCase();
    if (name && byName.has(name)) return byName.get(name) || null;
    return null;
  };
}

export function useClientLookup(): ResolveClient {
  const { workspaces } = useWorkspaces();
  return useMemo(() => buildClientLookup(workspaces), [workspaces]);
}

export const ClientLookupContext = createContext<ResolveClient>(() => null);

export function useResolvedClient(): ResolveClient {
  return useContext(ClientLookupContext);
}

export function clientFromItem(resolve: ResolveClient, item: ContentCalendarItem): Workspace | null {
  return resolve(item);
}
