import React, { useEffect, useState } from 'react';
import { Calendar, Globe } from 'lucide-react';
import { ContentCalendarClientReviews } from '../content-calendar/ContentCalendarClientReviews';
import { WebsiteClientPortalSection } from './WebsiteClientPortalSection';
import { websiteProjectService } from '../../services/websiteProjectService';
import { contentCalendarService } from '../../services/contentCalendarService';

interface ClientPortalContainerProps {
  activeTab?: 'content' | 'website';
  onTabChange?: (tab: 'content' | 'website') => void;
}

export const ClientPortalContainer: React.FC<ClientPortalContainerProps> = ({
  activeTab: controlledTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<'content' | 'website'>('content');
  const activeTab = controlledTab ?? internalTab;

  const setActiveTab = (tab: 'content' | 'website') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [hasCheckedCounts, setHasCheckedCounts] = useState(false);
  const [websiteCount, setWebsiteCount] = useState<number>(0);
  const [contentCount, setContentCount] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function checkAvailability() {
      try {
        const [wRes, cRes] = await Promise.all([
          websiteProjectService.getProjects(),
          contentCalendarService.getItems(),
        ]);

        if (cancelled) return;
        const wTotal = wRes.total || (wRes.items || []).length;
        const cTotal = cRes.total || (cRes.items || []).length;

        setWebsiteCount(wTotal);
        setContentCount(cTotal);

        // Smart default: if only website projects exist, default to website tab!
        if (wTotal > 0 && cTotal === 0) {
          if (!controlledTab) setActiveTab('website');
        } else {
          if (!controlledTab) setActiveTab('content');
        }
      } catch {
        // Fallback to content
      } finally {
        if (!cancelled) setHasCheckedCounts(true);
      }
    }

    checkAvailability();

    return () => {
      cancelled = true;
    };
  }, [controlledTab]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-canvas">
      {/* Top Switcher Bar */}
      <div className="px-6 py-2.5 bg-surface border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-0.5 rounded-lg bg-subtle border border-border flex items-center">
            <button
              onClick={() => setActiveTab('content')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'content'
                  ? 'bg-surface text-accent-text font-semibold shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Content Calendar</span>
              {hasCheckedCounts ? (
                contentCount > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-subtle text-accent-text font-mono border border-border">
                    {contentCount}
                  </span>
                ) : null
              ) : (
                <span className="w-3.5 h-3 bg-skel rounded-full animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActiveTab('website')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'website'
                  ? 'bg-surface text-accent-text font-semibold shadow-xs'
                  : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Website Portal</span>
              {hasCheckedCounts ? (
                websiteCount > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-subtle text-accent-text font-mono border border-border">
                    {websiteCount}
                  </span>
                ) : null
              ) : (
                <span className="w-3.5 h-3 bg-skel rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'content' ? (
          <ContentCalendarClientReviews />
        ) : (
          <WebsiteClientPortalSection />
        )}
      </div>
    </div>
  );
};
