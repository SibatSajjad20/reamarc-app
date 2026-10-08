import React from 'react';
import type { ViewType } from '@/types';
import type { CrmSubSection } from '@/types/crm';
import type { AttendanceSubSection } from '@/types/attendance';
import type { AdminSectionType } from '@/components/admin/AdminSidebarNav';
import { useBreadcrumb, type BreadcrumbItem } from './BreadcrumbContext';
import { NotificationBell } from '@/components/NotificationBell';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  CircleQuestionMark,
  ChevronRight,
  PanelLeft,
  Keyboard,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export interface TopBarProps {
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
  activeCrmSection?: CrmSubSection;
  onSelectCrmSection?: (section: CrmSubSection) => void;
  activeAttendanceSection?: AttendanceSubSection;
  onSelectAttendanceSection?: (section: AttendanceSubSection) => void;
  activeAdminSection?: AdminSectionType;
  onSelectAdminSection?: (section: AdminSectionType) => void;
  activeWebsiteSection?: 'board' | 'tasks' | 'table';
  onSelectWebsiteSection?: (section: 'board' | 'tasks' | 'table') => void;
  activePortalTab?: 'content' | 'website';
  onSelectPortalTab?: (tab: 'content' | 'website') => void;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenMobileMenu?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentView,
  onSelectView,
  activeCrmSection = 'board',
  onSelectCrmSection,
  activeAttendanceSection,
  onSelectAttendanceSection,
  activeAdminSection = 'directory',
  onSelectAdminSection,
  activeWebsiteSection = 'board',
  onSelectWebsiteSection,
  activePortalTab = 'content',
  onSelectPortalTab,
  onOpenCommandPalette,
  onOpenShortcuts,
  onOpenMobileMenu,
}) => {
  const { trail: customTrail } = useBreadcrumb();
  const { user } = useAuth();

  const isMac =
    typeof window !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(window.navigator.userAgent);

  // Compute default breadcrumbs per §9.1
  const getDefaultTrail = (): BreadcrumbItem[] => {
    switch (currentView) {
      case 'dashboard':
        return [
          { label: 'Overview' },
          { label: 'Dashboard', onClick: () => onSelectView('dashboard') },
        ];
      case 'active-clients':
        return [
          { label: 'Clients' },
          { label: 'Active clients', onClick: () => onSelectView('active-clients') },
        ];
      case 'crm': {
        const crmLabels: Record<string, string> = {
          board: 'Leads board',
          deals: 'Deals',
          list: 'All leads',
          followup: 'Follow-ups',
          settings: 'Pipeline settings',
          templates: 'Pipeline settings',
          ingest: 'Pipeline settings',
          rules: 'Pipeline settings',
        };
        const activeLabel = crmLabels[activeCrmSection] || 'Leads board';
        return [
          { label: 'Clients' },
          { label: 'Sales pipeline', onClick: () => onSelectView('crm') },
          {
            label: activeLabel,
            onClick: () => {
              onSelectView('crm');
              if (onSelectCrmSection) onSelectCrmSection(activeCrmSection);
            },
          },
        ];
      }
      case 'marketing':
        return [
          { label: 'Clients' },
          { label: 'Performance marketing', onClick: () => onSelectView('marketing') },
        ];
      case 'content-calendar':
        return [
          { label: 'Clients' },
          { label: 'Content calendar', onClick: () => onSelectView('content-calendar') },
        ];
      case 'attendance': {
        const attendanceLabels: Record<string, string> = {
          'daily-matrix': 'Daily attendance',
          'punctuality-hub': 'Punctuality reports',
          'employee-timesheets': 'Timesheets',
          approvals: 'Approvals',
          timesheet: 'My timesheet',
          requests: 'My requests',
        };
        const activeLabel = activeAttendanceSection
          ? attendanceLabels[activeAttendanceSection] || 'Daily attendance'
          : 'Daily attendance';
        return [
          { label: 'Team' },
          { label: 'Attendance', onClick: () => onSelectView('attendance') },
          {
            label: activeLabel,
            onClick: () => {
              onSelectView('attendance');
              if (activeAttendanceSection && onSelectAttendanceSection) {
                onSelectAttendanceSection(activeAttendanceSection);
              }
            },
          },
        ];
      }
      case 'daily-log':
        return [
          { label: 'Team' },
          { label: 'Daily log', onClick: () => onSelectView('daily-log') },
        ];
      case 'exceptions':
        return [
          { label: 'Team' },
          { label: 'Exceptions', onClick: () => onSelectView('exceptions') },
        ];
      case 'admin': {
        const panelLabel = user?.role === 'hr' ? 'HR panel' : user?.role === 'operations' ? 'Operations panel' : 'Admin panel';
        const adminLabels: Record<string, string> = {
          directory: 'Team directory',
          compliance: 'Log compliance',
          attendance_policies: 'Attendance policies',
          mobile_ops: 'Mobile & alerts',
          workspaces: 'Client workspaces',
          ad_accounts: 'Ad accounts',
        };
        const activeLabel = adminLabels[activeAdminSection] || 'Team directory';
        return [
          { label: 'Admin' },
          { label: panelLabel, onClick: () => onSelectView('admin') },
          {
            label: activeLabel,
            onClick: () => {
              onSelectView('admin');
              if (onSelectAdminSection) onSelectAdminSection(activeAdminSection);
            },
          },
        ];
      }
      case 'profile':
        return [
          { label: 'Settings' },
          { label: 'Profile', onClick: () => onSelectView('profile') },
        ];
      case 'portal': {
        const portalLabels: Record<string, string> = {
          content: 'Content calendar',
          website: 'Website portal',
        };
        const activeLabel = portalLabels[activePortalTab] || 'Approvals';
        return [
          { label: 'Client portal' },
          {
            label: activeLabel,
            onClick: () => {
              onSelectView('portal');
              if (onSelectPortalTab) onSelectPortalTab(activePortalTab);
            },
          },
        ];
      }
      case 'website-pipeline': {
        const websiteLabels: Record<string, string> = {
          board: 'Websites pipeline',
          tasks: 'Tasks pipeline',
          table: 'Table view',
        };
        const activeLabel = websiteLabels[activeWebsiteSection] || 'Websites pipeline';
        return [
          { label: 'Clients' },
          { label: 'Website pipeline', onClick: () => onSelectView('website-pipeline') },
          {
            label: activeLabel,
            onClick: () => {
              onSelectView('website-pipeline');
              if (onSelectWebsiteSection) onSelectWebsiteSection(activeWebsiteSection);
            },
          },
        ];
      }
      default:
        return [{ label: 'Reamarc' }];
    }
  };

  const trail = customTrail || getDefaultTrail();

  return (
    <header className="h-14 shrink-0 bg-surface border-b border-border flex items-center px-6 xl:px-8 gap-2 sticky top-0 z-20 select-none">
      {/* Mobile Drawer Trigger (<1024px) (§6.4) */}
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="w-8 h-8 rounded-md flex lg:hidden items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer mr-1 focus-visible:focus-ring"
        aria-label="Open navigation menu"
      >
        <PanelLeft size={18} />
      </button>

      {/* Left: Breadcrumbs (§9.1) */}
      <nav aria-label="Breadcrumbs" className="flex items-center gap-1.5 text-[13px] text-fg-muted overflow-hidden">
        {trail.map((item, index) => {
          const isLast = index === trail.length - 1;

          return (
            <React.Fragment key={`${item.label}-${index}`}>
              {index > 0 && (
                <ChevronRight size={14} className="text-fg-faint shrink-0" aria-hidden="true" />
              )}
              {isLast ? (
                <span className="font-medium text-fg truncate">{item.label}</span>
              ) : item.onClick ? (
                <button
                  type="button"
                  onClick={item.onClick}
                  className="hover:text-fg transition-colors cursor-pointer truncate"
                >
                  {item.label}
                </button>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* Right: Search, Help, Bell */}
      <div className="ml-auto flex items-center gap-2">
        {/* Search trigger (320px on desktop; icon button on mobile) (§9.1) */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className={cn(
            'hidden md:flex w-80 h-8 border border-border rounded-md items-center pl-2.5 pr-1.5 gap-2 bg-canvas hover:border-border-strong text-fg-faint text-[13px] transition-colors cursor-pointer select-none focus-visible:focus-ring mr-2'
          )}
          aria-label="Search pages and actions"
        >
          <Search size={16} className="text-fg-muted shrink-0" />
          <span className="truncate">Search pages and actions…</span>
          <kbd className="ml-auto font-mono text-xs leading-[18px] border border-border rounded px-1 text-fg-muted bg-surface select-none shadow-xs">
            {isMac ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>

        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="flex md:hidden w-8 h-8 rounded-md items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer select-none focus-visible:focus-ring"
          aria-label="Search pages and actions"
        >
          <Search size={18} />
        </button>

        {/* Help IconButton (§9.4) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="w-8 h-8 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer select-none focus-visible:focus-ring data-[state=open]:bg-subtle data-[state=open]:text-fg"
              aria-label="Help"
            >
              <CircleQuestionMark size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" sideOffset={8} className="w-56">
            <DropdownMenuItem
              onClick={onOpenShortcuts}
              className="text-[13px] gap-2.5 cursor-pointer"
            >
              <Keyboard size={16} className="text-fg-muted" />
              <span>Keyboard shortcuts</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notification Bell (§9.3) */}
        <NotificationBell onSelectView={onSelectView} />
      </div>
    </header>
  );
};
