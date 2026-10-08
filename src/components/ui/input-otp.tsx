import * as React from 'react';
import { OTPInput, OTPInputContext } from 'input-otp';
import { Dot } from 'lucide-react';
import { cn } from '@/lib/utils';

export const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.ComponentPropsWithoutRef<typeof OTPInput>
>(({ className, containerClassName, ...props }, ref) => (
  <OTPInput
    ref={ref}
    containerClassName={cn(
      'flex items-center gap-2 has-[:disabled]:opacity-50 justify-center',
      containerClassName
    )}
    className={cn('disabled:cursor-not-allowed', className)}
    {...props}
  />
));
InputOTP.displayName = 'InputOTP';

export const InputOTPGroup = React.forwardRef<
  React.ElementRef<'div'>,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center gap-2', className)} {...props} />
));
InputOTPGroup.displayName = 'InputOTPGroup';

export const InputOTPSlot = React.forwardRef<
  React.ElementRef<'div'>,
  React.ComponentPropsWithoutRef<'div'> & { index: number }
>(({ index, className, ...props }, ref) => {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] || {};

  return (
    <div
      ref={ref}
      className={cn(
        'relative flex h-[48px] w-[44px] items-center justify-center rounded-md border border-border-strong bg-surface text-[18px] font-mono font-medium text-fg transition-colors duration-120 select-none',
        isActive && 'border-ring-border outline-none shadow-[0_0_0_3px_var(--ring)]',
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-px animate-pulse bg-fg" />
        </div>
      )}
    </div>
  );
});
InputOTPSlot.displayName = 'InputOTPSlot';

export const InputOTPSeparator = React.forwardRef<
  React.ElementRef<'div'>,
  React.ComponentPropsWithoutRef<'div'>
>(({ ...props }, ref) => (
  <div ref={ref} role="separator" {...props}>
    <Dot className="text-fg-muted" />
  </div>
));
InputOTPSeparator.displayName = 'InputOTPSeparator';
