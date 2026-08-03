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
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        let Icon = CheckCircle2;
        let iconColor = 'text-emerald-500 dark:text-emerald-400';
        let borderColor = 'border-emerald-500/40 dark:border-emerald-500/30';

        if (toast.type === 'info') {
          Icon = Info;
          iconColor = 'text-indigo-600 dark:text-indigo-400';
          borderColor = 'border-indigo-500/40 dark:border-indigo-500/30';
        } else if (toast.type === 'warning' || toast.type === 'error') {
          Icon = AlertCircle;
          iconColor = 'text-amber-600 dark:text-amber-400';
          borderColor = 'border-amber-500/40 dark:border-amber-500/30';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border ${borderColor} bg-white/95 dark:bg-zinc-900/95 text-slate-900 dark:text-zinc-100 shadow-xl dark:shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-0 animate-in fade-in slide-in-from-bottom-3`}
          >
            <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-zinc-100">{toast.title}</h4>
              {toast.description && (
                <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1 leading-relaxed">{toast.description}</p>
              )}
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
