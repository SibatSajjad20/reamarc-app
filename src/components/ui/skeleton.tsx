import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton rounded-md bg-skel shrink-0', className)}
      aria-hidden="true"
      {...props}
    />
  );
}
