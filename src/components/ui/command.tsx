import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, type DialogContentProps } from '@/components/ui/dialog';

export const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-lg bg-surface text-fg',
      className
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

export interface CommandDialogProps extends DialogContentProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const CommandDialog = ({ children, open, onOpenChange, ...props }: CommandDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent maxWidth="lg" showClose={false} className="overflow-hidden p-0 shadow-lg" {...props}>
        <Command className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-4 [&_[cmdk-input-wrapper]_svg]:w-4 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

export const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
    <Search className="mr-2 h-4 w-4 shrink-0 text-fg-muted" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-fg-faint disabled:cursor-not-allowed disabled:opacity-50 text-fg',
        className
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

export const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[360px] overflow-y-auto overflow-x-hidden p-1', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

export const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="py-6 text-center text-sm text-fg-muted"
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

export const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-1 text-fg [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted',
      className
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

export const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 h-px bg-border', className)}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

export const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none transition-colors duration-120',
      'hover:bg-hover aria-selected:bg-hover aria-selected:text-fg text-fg',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:shrink-0 [&_svg]:text-fg-muted',
      className
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

export const CommandShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn('ml-auto text-micro font-mono text-fg-muted', className)}
      {...props}
    />
  );
};
CommandShortcut.displayName = 'CommandShortcut';
