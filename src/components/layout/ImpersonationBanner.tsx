import React from 'react';
import { Eye, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface ImpersonationBannerProps {
  onExit?: () => void;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({ onExit }) => {
  const { user } = useAuth();

  if (!user?.impersonating) {
    return null;
  }

  const companyName = user.company?.name || user.company_id || 'Tenant';
  const isReadOnly = user.read_only !== false;

  const handleExit = () => {
    if (onExit) {
      onExit();
      return;
    }
    // Remove impersonation token and navigate to /owner
    try {
      localStorage.removeItem('reamarc_impersonation_token');
    } catch {}
    window.location.href = '/owner';
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex items-center justify-between px-4 py-2 text-xs md:text-sm font-medium bg-amber-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 backdrop-blur-sm shadow-sm"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>
          Viewing as Owner:{' '}
          <strong className="font-semibold underline decoration-amber-500/50">{companyName}</strong>
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
          <ShieldAlert className="w-3 h-3" />
          {isReadOnly ? 'Read-Only' : 'Edit Mode'}
        </span>
      </div>

      <button
        onClick={handleExit}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
      >
        <LogOut className="w-3.5 h-3.5" />
        Exit to Owner Console
      </button>
    </div>
  );
};
