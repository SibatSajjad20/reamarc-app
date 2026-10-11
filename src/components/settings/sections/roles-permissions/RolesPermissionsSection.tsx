import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { RoleDefaultsTab } from './RoleDefaultsTab';
import { MembersTab } from './MembersTab';
import { AuditLogTab } from './AuditLogTab';

export type PermissionsSubTab = 'defaults' | 'members' | 'audit';

export const RolesPermissionsSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PermissionsSubTab>('defaults');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="-mb-px flex space-x-6" aria-label="Permissions Tabs">
          <button
            type="button"
            onClick={() => setActiveTab('defaults')}
            className={cn(
              'pb-3 px-1 border-b-2 text-xs font-semibold transition-colors',
              activeTab === 'defaults'
                ? 'border-indigo-600 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            Role defaults
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={cn(
              'pb-3 px-1 border-b-2 text-xs font-semibold transition-colors',
              activeTab === 'members'
                ? 'border-indigo-600 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            Members
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={cn(
              'pb-3 px-1 border-b-2 text-xs font-semibold transition-colors',
              activeTab === 'audit'
                ? 'border-indigo-600 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            Audit log
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-w-0">
        {activeTab === 'defaults' && <RoleDefaultsTab />}
        {activeTab === 'members' && <MembersTab />}
        {activeTab === 'audit' && <AuditLogTab />}
      </div>
    </div>
  );
};
