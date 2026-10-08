import React from 'react';
import {
  Info,
  TriangleAlert,
  CircleAlert,
  CircleCheck,
  CircleDot,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type CalloutVariant = 'info' | 'warning' | 'danger' | 'success' | 'neutral';

export interface CalloutProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: CalloutVariant;
  title?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

const variantStyles: Record<
  CalloutVariant,
  { container: string; iconClass: string; defaultIcon: LucideIcon }
> = {
  info: {
    container: 'bg-info-bg border-info-bd text-info-fg',
    iconClass: 'text-info-fg',
    defaultIcon: Info,
  },
  warning: {
    container: 'bg-warning-bg border-warning-bd text-warning-fg',
    iconClass: 'text-warning-fg',
    defaultIcon: TriangleAlert,
  },
  danger: {
    container: 'bg-danger-bg border-danger-bd text-danger-fg',
    iconClass: 'text-danger-fg',
    defaultIcon: CircleAlert,
  },
  success: {
    container: 'bg-success-bg border-success-bd text-success-fg',
    iconClass: 'text-success-fg',
    defaultIcon: CircleCheck,
  },
  neutral: {
    container: 'bg-subtle border-border text-fg-muted',
    iconClass: 'text-fg-muted',
    defaultIcon: CircleDot,
  },
};

export const Callout: React.FC<CalloutProps> = ({
  variant = 'info',
  title,
  icon,
  action,
  children,
  className,
  ...props
}) => {
  const cfg = variantStyles[variant];
  const IconComponent = icon || cfg.defaultIcon;

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 p-2.5 sm:px-3 sm:py-2.5 rounded-md border text-ui transition-colors',
        cfg.container,
        className
      )}
      role="status"
      {...props}
    >
      <div className={cn('shrink-0 mt-0.5', cfg.iconClass)}>
        <IconComponent size={16} />
      </div>

      <div className="flex-1 min-w-0 text-ui text-fg-2 leading-relaxed">
        {title && <span className="font-semibold text-fg mr-1.5">{title}</span>}
        {children}
      </div>

      {action && <div className="shrink-0 ml-2">{action}</div>}
    </div>
  );
};
