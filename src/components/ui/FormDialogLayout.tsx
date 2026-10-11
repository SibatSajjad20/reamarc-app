import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './dialog';
import { cn } from '@/lib/utils';

export interface FormDialogProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  headerActions?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showClose?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const FormDialog: React.FC<FormDialogProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
  title,
  subtitle,
  description,
  headerActions,
  maxWidth = 'md',
  showClose = true,
  className,
  children,
}) => {
  const isControlledOpen = open ?? isOpen ?? false;

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);
    if (!nextOpen) {
      onClose?.();
    }
  };

  const desc = subtitle ?? description;

  return (
    <Dialog open={isControlledOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        maxWidth={maxWidth}
        showClose={showClose}
        className={cn(
          'p-0 flex flex-col max-h-[min(90vh,900px)] overflow-hidden gap-0',
          className
        )}
      >
        {title && (
          <div className="shrink-0 px-6 py-4 border-b border-border flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-ui font-semibold text-fg truncate">
                {title}
              </DialogTitle>
              {desc && (
                <DialogDescription className="text-xs text-fg-muted mt-0.5 truncate">
                  {desc}
                </DialogDescription>
              )}
            </div>
            {headerActions && (
              <div className="flex items-center gap-2 shrink-0">{headerActions}</div>
            )}
          </div>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
};

export interface FormDialogHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
}

export const FormDialogHeader: React.FC<FormDialogHeaderProps> = ({
  title,
  subtitle,
  description,
  icon,
  onClose,
  className,
  children,
  ...props
}) => {
  const desc = subtitle ?? description;
  return (
    <div
      className={cn(
        'shrink-0 px-6 py-4 border-b border-border flex items-center justify-between gap-4',
        className
      )}
      {...props}
    >
      {title ? (
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {icon && <div className="shrink-0">{icon}</div>}
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-ui font-semibold text-fg truncate">
              {title}
            </DialogTitle>
            {desc && (
              <DialogDescription className="text-xs text-fg-muted mt-0.5 truncate">
                {desc}
              </DialogDescription>
            )}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
};

export interface FormDialogBodyProps extends React.HTMLAttributes<HTMLDivElement> {}

export const FormDialogBody = React.forwardRef<HTMLDivElement, FormDialogBodyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('flex-1 min-h-0 overflow-y-auto px-6 py-5', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
FormDialogBody.displayName = 'FormDialogBody';
