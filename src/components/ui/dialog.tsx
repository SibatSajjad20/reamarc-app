import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-[var(--z-overlay)] bg-overlay',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showClose?: boolean;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, maxWidth = 'md', showClose = true, ...props }, ref) => {
  const maxWidthMap = {
    sm: 'max-w-[400px]',
    md: 'max-w-[560px]',
    lg: 'max-w-[720px]',
    xl: 'max-w-[880px]',
    '2xl': 'max-w-[1024px]',
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-[var(--z-dialog)] w-full translate-x-[-50%] translate-y-[-50%]',
          'max-h-[calc(100vh-64px)] flex flex-col rounded-lg border border-border bg-surface shadow-lg text-fg outline-none',
          'duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          maxWidthMap[maxWidth],
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm p-1 text-fg-muted hover:text-fg hover:bg-hover transition-colors outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)] cursor-pointer">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col space-y-1.5 p-5 pb-0 text-left', className)}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-end gap-2 border-t border-border bg-canvas dark:bg-surface px-6 py-4 mt-auto rounded-b-lg',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-h2 font-semibold text-fg tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-fg-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
