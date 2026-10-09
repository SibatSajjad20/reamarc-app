import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { CircleCheck, Info, TriangleAlert, CircleX } from 'lucide-react';
import { setFileUrlNotifier } from '../lib/notify';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface ToastContextType {
  addToast: (
    title: string,
    description?: string,
    type?: ToastType,
    duration?: number
  ) => void;
  removeToast: (id: string) => void;
}

export const stripEmoji = (str: string): string => {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim();
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const toastMap = {
  success: toast.success,
  info: toast.info,
  warning: toast.warning,
  error: toast.error,
} as const;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const removeToast = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  const addToast = useCallback(
    (
      title: string,
      description?: string,
      type: ToastType = 'info',
      duration?: number
    ) => {
      const d = duration ?? (type === 'error' ? 6000 : type === 'warning' ? 5000 : 4000);
      const cleanTitle = stripEmoji(title);
      const cleanDesc = description ? stripEmoji(description) : undefined;
      const fn = toastMap[type] || toast.info;

      fn(cleanTitle, {
        description: cleanDesc,
        duration: d,
      });
    },
    []
  );

  useEffect(() => {
    setFileUrlNotifier((title, message, type) => {
      addToast(title, message, type ?? 'error');
    });
    return () => {
      setFileUrlNotifier(null);
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <Toaster
        position={isMobile ? 'top-center' : 'bottom-right'}
        offset={24}
        gap={8}
        visibleToasts={3}
        closeButton
        icons={{
          success: <CircleCheck className="w-4 h-4 text-success-fg shrink-0" />,
          info: <Info className="w-4 h-4 text-info-fg shrink-0" />,
          warning: <TriangleAlert className="w-4 h-4 text-warning-fg shrink-0" />,
          error: <CircleX className="w-4 h-4 text-danger-fg shrink-0" />,
        }}
        toastOptions={{
          className:
            '!w-[360px] !bg-surface !text-fg !border !border-border !rounded-xl !shadow-md !p-[12px_14px] !font-sans',
          classNames: {
            title: '!text-[13px] !font-medium !text-fg !leading-snug',
            description: '!text-xs !text-fg-muted !leading-snug !mt-0.5',
            closeButton:
              '!bg-surface !border-border !text-fg-muted hover:!text-fg !opacity-0 group-hover:!opacity-100 transition-opacity',
          },
        }}
      />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
