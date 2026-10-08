import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,transform] duration-[120ms] ease-[var(--ease-standard)] active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:focus-ring [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg border border-accent shadow-xs hover:bg-accent-hover active:bg-accent-active',
        secondary: 'bg-surface text-fg border border-border-strong shadow-xs hover:bg-subtle [&_svg]:text-fg-muted',
        ghost: 'text-fg-2 border border-transparent hover:bg-hover hover:text-fg',
        soft: 'bg-accent-soft-2 text-accent-text border border-transparent hover:bg-accent-200/60',
        destructive: 'bg-danger-solid text-white border border-danger-solid hover:bg-danger-fg',
        danger: 'bg-danger-solid text-white border border-danger-solid hover:bg-danger-fg',
        'destructive-outline': 'bg-surface text-danger-fg border border-danger-bd hover:bg-danger-bg',
        'danger-secondary': 'bg-surface text-danger-fg border border-danger-bd hover:bg-danger-bg',
        'success-outline': 'bg-surface text-success-fg border border-border-strong hover:bg-success-bg [&_svg]:text-success-fg',
        outline: 'border border-border-strong bg-surface text-fg hover:bg-hover',
        link: 'text-accent-text border-0 p-0 h-auto hover:underline underline-offset-4',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-base',
        icon: 'h-8 w-8 p-0',
        'icon-sm': 'h-7 w-7 p-0',
        'icon-lg': 'h-9 w-9 p-0',
      },
      block: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  icon?: React.ComponentType<{ className?: string; size?: number }>;
  trailingIcon?: React.ComponentType<{ className?: string; size?: number }>;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      block,
      asChild = false,
      loading = false,
      icon: Icon,
      trailingIcon: TrailingIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot.Root : 'button';
    const isDisabled = disabled || loading;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, block, className }))}
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading ? 'true' : undefined}
        {...props}
      >
        {loading ? (
          <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />
        ) : (
          Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden="true" />
        )}
        {children}
        {TrailingIcon && !loading && (
          <TrailingIcon size={size === 'sm' ? 14 : 16} aria-hidden="true" />
        )}
      </Comp>
    );
  }
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  variant?: 'ghost' | 'secondary' | 'primary' | 'soft' | 'destructive' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  hasDot?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      icon: Icon,
      variant = 'ghost',
      size = 'md',
      hasDot = false,
      className,
      ...props
    },
    ref
  ) => {
    const iconSizes = { sm: 14, md: 16, lg: 18 };
    const sizeMap = { sm: 'icon-sm' as const, md: 'icon' as const, lg: 'icon-lg' as const };

    return (
      <Button
        ref={ref}
        variant={variant}
        size={sizeMap[size]}
        aria-label={label}
        title={label}
        className={cn('relative', className)}
        {...props}
      >
        <Icon size={iconSizes[size]} aria-hidden="true" />
        {hasDot && (
          <span
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-accent ring-2 ring-surface"
            aria-hidden="true"
          />
        )}
      </Button>
    );
  }
);
IconButton.displayName = 'IconButton';
