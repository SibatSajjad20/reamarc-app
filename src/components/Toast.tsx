import React from 'react';
import type { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map((toast) => {
        let Icon = CheckCircle2;
        let iconColor = 'text-emerald-500';
        let accentBar = 'bg-emerald-500';

        if (toast.type === 'info') {
          Icon = Info;
          iconColor = 'text-indigo-500';
          accentBar = 'bg-indigo-500';
        } else if (toast.type === 'warning' || toast.type === 'error') {
          Icon = AlertCircle;
          iconColor = 'text-amber-500';
          accentBar = 'bg-amber-500';
        }

        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 pl-0 pr-3 py-3 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl dark:shadow-2xl backdrop-blur-md animate-slide-in-up overflow-hidden"
          >
            {/* Accent left bar */}
            <div className={`w-1 self-stretch rounded-r-full shrink-0 ${accentBar}`} />
            <Icon className={`w-4 h-4 ${iconColor} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-snug">{toast.title}</h4>
              {toast.description && (
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-snug">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-300 dark:text-zinc-600 hover:text-slate-600 dark:hover:text-zinc-300 p-0.5 rounded transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
