/**
 * Shared styling utilities and badge configurations for Website Projects.
 */

export interface HealthBadgeInfo {
  dot: string;
  bg: string;
  text: string;
  border: string;
  label: string;
}

export function healthBadge(health?: string | null): HealthBadgeInfo {
  switch (health) {
    case 'waiting_on_client':
      return {
        dot: 'bg-warning-solid',
        bg: 'bg-warning-bg',
        text: 'text-warning-fg',
        border: 'border-warning-bd',
        label: 'Waiting on Client',
      };
    case 'at_risk':
      return {
        dot: 'bg-danger-solid',
        bg: 'bg-danger-bg',
        text: 'text-danger-fg',
        border: 'border-danger-bd',
        label: 'At Risk',
      };
    case 'on_hold':
      return {
        dot: 'bg-fg-muted',
        bg: 'bg-surface',
        text: 'text-fg-muted',
        border: 'border-border',
        label: 'On Hold',
      };
    case 'completed':
      return {
        dot: 'bg-accent',
        bg: 'bg-accent-soft',
        text: 'text-accent-text',
        border: 'border-accent-pill-bd',
        label: 'Completed',
      };
    case 'on_track':
    default:
      return {
        dot: 'bg-success-dot',
        bg: 'bg-success-bg',
        text: 'text-success-fg',
        border: 'border-success-bd',
        label: 'On Track',
      };
  }
}

export function cleanLabel(val?: string | null): string {
  if (!val) return '';
  return val.replaceAll('_', ' ');
}
