import React, { useState, useEffect } from 'react';
import { ArrowLeft, MessageSquareText, Webhook, SlidersHorizontal } from 'lucide-react';
import { CrmSettingsTemplates } from './CrmSettingsTemplates';
import { CrmSettingsIngest } from './CrmSettingsIngest';
import { CrmSettingsRules } from './CrmSettingsRules';
import { Button } from '../../ui/button';
import type { CrmAssignee } from '../../../types/crm';

export type CrmSettingsTab = 'templates' | 'ingest' | 'rules';

interface CrmSettingsViewProps {
  initialTab?: CrmSettingsTab;
  onBackToPipeline: () => void;
  assignees?: CrmAssignee[];
}

const SETTINGS_NAV_ITEMS = [
  { id: 'templates' as const, label: 'Message templates', icon: MessageSquareText },
  { id: 'ingest' as const, label: 'Lead sources', icon: Webhook },
  { id: 'rules' as const, label: 'Lead routing', icon: SlidersHorizontal },
];

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
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-canvas">
      {/* Top Header Bar */}
      <header className="px-6 py-3 border-b border-border bg-surface flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToPipeline}
            className="p-1.5 h-8 w-8 text-fg-muted hover:text-fg"
            title="Return to sales pipeline"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-fg tracking-tight">Pipeline settings</h1>
              <span className="px-2 py-0.5 text-micro font-medium rounded-full bg-subtle text-fg-muted border border-border">
                Settings
              </span>
            </div>
            <p className="text-small text-fg-muted">
              Outreach templates, lead ingest channels, and assignment routing for your sales team.
            </p>
          </div>
        </div>
      </header>

      {/* Main Layout: 220px Sub-Nav + Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 220px Sub-Nav */}
        <nav
          aria-label="Pipeline settings navigation"
          className="w-[220px] shrink-0 p-4 border-r border-border bg-surface overflow-y-auto space-y-1"
        >
          <div className="px-2.5 pb-2 text-micro font-medium text-fg-muted uppercase tracking-wider">
            Pipeline
          </div>
          {SETTINGS_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full h-8 px-2.5 rounded-md text-small font-medium transition-colors cursor-pointer flex items-center gap-2.5 ${
                  isActive
                    ? 'bg-accent-soft text-accent-text font-semibold'
                    : 'text-fg-muted hover:text-fg hover:bg-hover'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content Pane: Max 760px */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-[760px] mx-auto w-full">
            {activeTab === 'templates' && <CrmSettingsTemplates />}
            {activeTab === 'ingest' && <CrmSettingsIngest />}
            {activeTab === 'rules' && <CrmSettingsRules assignees={assignees} />}
          </div>
        </main>
      </div>
    </div>
  );
};
