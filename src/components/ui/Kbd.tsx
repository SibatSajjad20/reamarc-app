import React from 'react';
import { cn } from '../../lib/utils';

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export const Kbd: React.FC<KbdProps> = ({ children, className, ...props }) => {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center font-mono text-micro text-fg-muted bg-surface border border-border rounded-xs px-1.5 h-[18px] min-w-[18px] select-none align-baseline leading-none shadow-xs',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
};
