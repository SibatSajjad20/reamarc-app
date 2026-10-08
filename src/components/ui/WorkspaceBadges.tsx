import { StatusPill } from './StatusPill';

export function HealthBadge({ health }: { health?: string }) {
  switch (health) {
    case 'Emergency':
      return <StatusPill variant="danger" label="Emergency" dot />;
    case 'Moderate':
      return <StatusPill variant="warning" label="Moderate" dot />;
    case 'Excellent':
      return <StatusPill variant="success" label="Excellent" dot />;
    default:
      return <StatusPill variant="info" label="Good" dot />;
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
        <StatusPill
          variant="warning"
          label={showSuffix ? 'High priority' : 'High'}
          dot
        />
      );
    case 'Low':
      return (
        <StatusPill
          variant="neutral"
          label={showSuffix ? 'Low priority' : 'Low'}
          dot={false}
        />
      );
    default:
      return (
        <StatusPill
          variant="neutral"
          label={showSuffix ? 'Medium priority' : 'Medium'}
          dot={false}
        />
      );
  }
}
