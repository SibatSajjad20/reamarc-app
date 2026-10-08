import React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { IconButton } from './button';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
}

const maxWidthMap: Record<string, string> = {
  sm: 'max-w-[400px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[720px]',
  xl: 'max-w-[880px]',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'xl',
}) => {
  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[var(--z-overlay,50)] bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-150"
        />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-[var(--z-dialog,51)] grid w-full translate-x-[-50%] translate-y-[-50%] bg-surface border border-border rounded-lg shadow-lg max-h-[calc(100vh-64px)] flex flex-col duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 outline-none',
            maxWidthMap[maxWidth] || 'max-w-[880px]'
          )}
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between p-5 sm:p-6 pb-4 border-b border-border">
            <div className="min-w-0 pr-4">
              <DialogPrimitive.Title asChild>
                {typeof title === 'string' ? (
                  <h2 className="text-h2 font-semibold text-fg tracking-tight">{title}</h2>
                ) : (
                  <div>{title}</div>
                )}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-small text-fg-muted mt-1 leading-normal">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton
                variant="ghost"
                size="sm"
                icon={X}
                label="Close modal"
                className="shrink-0 -mt-1 -mr-1"
              />
            </DialogPrimitive.Close>
          </div>

          {/* Modal Body */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 text-body text-fg">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
