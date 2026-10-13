import React from 'react';
import { ShieldOff } from 'lucide-react';
import { EmptyState } from './EmptyState';

export const AccessDenied: React.FC<{ module?: string }> = ({ module }) => (
  <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden view-enter">
    <EmptyState
      icon={ShieldOff}
      title="No access"
      description={
        module
          ? `You do not have access to ${module}.`
          : 'You do not have access to this module.'
      }
      variant="page"
    />
  </div>
);
