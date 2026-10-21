import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (controlledTab) return;
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
        if (wTotal > 0 && cTotal === 0) {
          setInternalTab('website');
          onTabChange?.('website');
        }
      } catch {
        // Keep content as the default tab.
      }
    }

    void checkAvailability();
    return () => {
      cancelled = true;
    };
  }, [controlledTab, onTabChange]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-canvas">
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
