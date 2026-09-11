import { ShieldAlert, HeartPulse, Flame, Sparkles } from 'lucide-react';

export function HealthBadge({ health }: { health?: string }) {
  switch (health) {
    case 'Emergency':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse whitespace-nowrap">
          <ShieldAlert className="w-3 h-3 text-rose-500" />
          <span>Emergency</span>
        </span>
      );
    case 'Moderate':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap">
          <HeartPulse className="w-3 h-3 text-amber-500" />
          <span>Moderate</span>
        </span>
      );
    case 'Excellent':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
          <HeartPulse className="w-3 h-3 text-emerald-500" />
          <span>Excellent</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 whitespace-nowrap">
          <HeartPulse className="w-3 h-3 text-blue-500" />
          <span>Good</span>
        </span>
      );
  }
}

export function PriorityBadge({
  priority,
  showSuffix = false,
}: {
  priority?: string;
  showSuffix?: boolean;
}) {
  switch (priority) {
    case 'High':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 whitespace-nowrap shrink-0">
          <Flame className="w-3 h-3 text-rose-500 shrink-0" />
          <span>{showSuffix ? 'High Priority' : 'High'}</span>
        </span>
      );
    case 'Low':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0">
          <Sparkles className="w-3 h-3 text-sky-500 shrink-0" />
          <span>{showSuffix ? 'Low Priority' : 'Low'}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 whitespace-nowrap shrink-0">
          <Flame className="w-3 h-3 text-amber-500 shrink-0" />
          <span>{showSuffix ? 'Medium Priority' : 'Medium'}</span>
        </span>
      );
  }
}
