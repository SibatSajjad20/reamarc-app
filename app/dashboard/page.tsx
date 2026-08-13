/**
 * Next.js Page Route for Executive Command Center Dashboard.
 * Located at app/dashboard/page.tsx
 */

'use client';

import React, { useState } from 'react';
import { DashboardView } from '../../src/components/views/DashboardView';
import type { Workspace, ViewType } from '../../src/types';

export default function DashboardPage() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [workspaces] = useState<Workspace[]>([]);

  const handleSelectWorkspace = (ws: Workspace | null) => {
    setSelectedWorkspace(ws);
  };

  const handleNavigateView = (view: ViewType) => {
    if (typeof window !== 'undefined') {
      window.location.href = `/${view}`;
    }
  };

  return (
    <div className="w-full h-screen bg-slate-50 dark:bg-[#0f1117] flex flex-col">
      <DashboardView
        selectedWorkspace={selectedWorkspace}
        workspaces={workspaces}
        onSelectWorkspace={handleSelectWorkspace}
        onNavigateView={handleNavigateView}
      />
    </div>
  );
}
