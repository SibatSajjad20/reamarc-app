import React, { useState, useEffect } from 'react';
import { Eye, LogOut, Lock, Edit3 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { ownerService } from '@/services/ownerService';

interface ImpersonationBannerProps {
  onExit?: () => void;
}

function getMinutesRemaining(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    if (typeof parsed.exp === 'number') {
      const remainingMs = parsed.exp * 1000 - Date.now();
      return Math.max(0, Math.round(remainingMs / 60000));
    }
  } catch {
    // Ignore decode error
  }
  return null;
}

export const ImpersonationBanner: React.FC<ImpersonationBannerProps> = ({ onExit }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [tokenStr, setTokenStr] = useState<string | null>(null);
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const tok = localStorage.getItem('reamarc_impersonation_token');
        setTokenStr(tok);
        setMinutesRemaining(getMinutesRemaining(tok));
      }
    } catch {}
  }, [user]);

  // Tick countdown every minute
  useEffect(() => {
    if (!tokenStr) return;
    const interval = setInterval(() => {
      setMinutesRemaining(getMinutesRemaining(tokenStr));
    }, 60000);
    return () => clearInterval(interval);
  }, [tokenStr]);

  if (!user?.impersonating && !tokenStr) {
    return null;
  }

  const companyName = user?.company?.name || user?.company_id || 'Company';
  const isReadOnly = user?.read_only !== false;

  const handleExit = async () => {
    setIsExiting(true);
    try {
      await ownerService.exitCompany();
    } catch {
      addToast(
        'Exited',
        'If this was a shared computer, sign out too.',
        'info'
      );
    } finally {
      try {
        localStorage.removeItem('reamarc_impersonation_token');
      } catch {}
      setIsExiting(false);
      if (onExit) {
        onExit();
      } else {
        window.location.href = '/owner';
      }
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[var(--z-dialog,51)] min-h-[40px] px-4 py-1.5 flex items-center justify-between gap-3 bg-fg text-canvas shadow-xs select-none"
    >
      <div className="flex items-center gap-2.5 flex-wrap min-w-0">
        <Eye size={16} className="shrink-0 text-canvas/90" aria-hidden="true" />
        <span className="text-small text-canvas leading-normal">
          You're viewing <strong className="font-semibold text-canvas">{companyName}</strong> as the owner
        </span>

        {/* Mode pill */}
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-medium bg-canvas/15 text-canvas shrink-0">
          {isReadOnly ? <Lock size={12} /> : <Edit3 size={12} />}
          <span>{isReadOnly ? 'Read-only' : 'Can edit'}</span>
        </span>

        {/* Countdown */}
        {minutesRemaining !== null && (
          <span className="text-caption text-canvas/75 hidden sm:inline shrink-0 font-numeric">
            Ends in {minutesRemaining} min
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={handleExit}
        disabled={isExiting}
        className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md bg-canvas text-fg hover:bg-canvas/90 active:bg-canvas/80 transition-colors shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
      >
        <LogOut size={13} aria-hidden="true" />
        <span>{isExiting ? 'Exiting…' : 'Exit'}</span>
      </button>
    </div>
  );
};
