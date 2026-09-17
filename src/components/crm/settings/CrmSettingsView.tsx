import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquareText, Webhook, SlidersHorizontal } from 'lucide-react';
import { CrmSettingsTemplates } from './CrmSettingsTemplates';
import { CrmSettingsIngest } from './CrmSettingsIngest';
import { CrmSettingsRules } from './CrmSettingsRules';
import type { CrmAssignee } from '../../../types/crm';

export type CrmSettingsTab = 'templates' | 'ingest' | 'rules';

interface CrmSettingsViewProps {
  initialTab?: CrmSettingsTab;
  onBackToPipeline: () => void;
  assignees?: CrmAssignee[];
}

export const CrmSettingsView: React.FC<CrmSettingsViewProps> = ({
  initialTab = 'templates',
  onBackToPipeline,
  assignees = [],
}) => {
  const [activeTab, setActiveTab] = useState<CrmSettingsTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Top Header Bar */}
      <header className="px-6 py-4 border-b border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBackToPipeline}
            className="p-2 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-300 transition cursor-pointer flex items-center justify-center shrink-0"
            title="Return to Sales Pipeline"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Pipeline Settings</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800 uppercase tracking-wider">
                Settings Hub
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Configure outreach templates, lead ingest channels, and assignment routing for your sales team.
            </p>
          </div>
        </div>

        {/* Primary Settings Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-100/90 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 shrink-0 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'templates'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <MessageSquareText className="w-3.5 h-3.5 text-indigo-500" />
            <span>Templates</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ingest')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'ingest'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <Webhook className="w-3.5 h-3.5 text-blue-500" />
            <span>Ingest Sources</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'rules'
                ? 'bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-100 shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-violet-500" />
            <span>Rules &amp; Team</span>
          </button>
        </div>
      </header>

      {/* Main Tab Content with Smooth Scrolling */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto w-full">
          {activeTab === 'templates' && <CrmSettingsTemplates />}
          {activeTab === 'ingest' && <CrmSettingsIngest />}
          {activeTab === 'rules' && <CrmSettingsRules assignees={assignees} />}
        </div>
      </main>
    </div>
  );
};
