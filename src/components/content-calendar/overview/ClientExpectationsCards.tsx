import React from 'react';
import { Target } from 'lucide-react';
import type { ClientExpectationSummary, ExpectationLineProgress } from '../../../utils/contentCalendarExpectations';
import { ClientAvatar } from '../../ui/ClientAvatar';
import { useResolvedClient } from '../../../hooks/useClientLookup';

interface CardsProps {
  summaries: ClientExpectationSummary[];
  isLoading?: boolean;
}

function lineLabel(line: ExpectationLineProgress): string {
  if (line.layout) return `${line.creative_type} (${line.layout})`;
  return line.creative_type;
}

function expectedQuotaText(line: ExpectationLineProgress): string {
  if (line.expected == null) return '';
  if (line.expectedMax != null && line.expectedMax !== line.expected) {
    return `${line.posted}/${line.expected}–${line.expectedMax}`;
  }
  return `${line.posted}/${line.expected}`;
}

function LineRow({ line }: { line: ExpectationLineProgress }) {
  if (line.paused) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-xs">
        <span className="text-fg-2 truncate">{lineLabel(line)}</span>
        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted border border-border text-caption">
          Paused this month · {line.posted} posted
        </span>
      </div>
    );
  }
  if (line.expected == null) {
    return (
      <div className="flex items-center justify-between gap-2 py-1 text-xs">
        <span className="text-fg-2 truncate">{lineLabel(line)}</span>
        <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-subtle text-fg-muted border border-border text-caption">
          Included · {line.posted} posted
        </span>
      </div>
    );
  }

  const pct = line.expected === 0 ? 0 : Math.min(100, Math.round((line.delivered / line.expected) * 100));
  return (
    <div className="space-y-1 py-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-fg-2 truncate">{lineLabel(line)}</span>
        <span className="font-numeric text-caption text-fg-muted shrink-0">
          {expectedQuotaText(line)}
          {line.leftover > 0 ? ` · ${line.leftover} left` : ''}
          {line.extra > 0 ? ` · +${line.extra}` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
        <div
          className={`h-full rounded-full ${line.leftover === 0 ? 'bg-success-fg' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ExpectationCard({ summary }: { summary: ClientExpectationSummary }) {
  const resolveClient = useResolvedClient();
  const client = resolveClient({ workspace_id: summary.workspaceId, client_name: summary.clientName });
  const metPct =
    summary.expectedTotal === 0
      ? 0
      : Math.min(100, Math.round((summary.deliveredTotal / summary.expectedTotal) * 100));

  return (
    <div className="rounded-xl bg-surface border border-border shadow-xs p-4 flex flex-col min-w-0">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <ClientAvatar
            name={client?.name || summary.clientName}
            logoUrl={client?.logo_url}
            clientId={client?.id}
            brandColor={client?.brandColor}
            initials={client?.initials}
            size={24}
            decorative
          />
          <div className="min-w-0">
            <div className="text-ui font-semibold text-fg truncate">{summary.clientName}</div>
            <p className="text-caption text-fg-muted">This month</p>
          </div>
        </div>
        <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border shrink-0">
          {summary.deliveredTotal}/{summary.expectedTotal} met
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-subtle overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${summary.leftoverTotal === 0 ? 'bg-success-fg' : 'bg-accent'}`}
          style={{ width: `${metPct}%` }}
        />
      </div>
      <p className="text-caption text-fg-muted mb-2 font-numeric">
        {summary.leftoverTotal} left
        {summary.extraTotal > 0 ? ` · ${summary.extraTotal} extra` : ''}
      </p>
      <div className="divide-y divide-border">
        {summary.lines.map((line) => (
          <LineRow key={line.creative_type} line={line} />
        ))}
      </div>
    </div>
  );
}

export const ClientExpectationsCards: React.FC<CardsProps> = ({ summaries, isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-surface border border-border p-4 h-40 animate-pulse">
            <div className="h-4 w-40 bg-skel rounded mb-4" />
            <div className="h-2 w-full bg-skel rounded mb-3" />
            <div className="h-3 w-28 bg-skel rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!summaries.length) return null;

  return (
    <div className="w-full rounded-xl bg-surface border border-border shadow-xs p-4">
      <div className="flex items-center gap-2 pb-3 border-b border-border mb-3">
        <Target className="w-3.5 h-3.5 text-accent" />
        <h3 className="text-ui font-semibold text-fg">Client expectations</h3>
        <span className="font-numeric text-xs font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border">
          This month
        </span>
      </div>
      <div className={`grid grid-cols-1 ${summaries.length > 1 ? 'md:grid-cols-2' : ''} gap-3`}>
        {summaries.map((summary) => (
          <ExpectationCard key={summary.workspaceId || summary.clientName} summary={summary} />
        ))}
      </div>
    </div>
  );
};

interface BannerProps {
  summary: ClientExpectationSummary;
}

export const ClientExpectationsBanner: React.FC<BannerProps> = ({ summary }) => {
  return (
    <div className="shrink-0 mx-3 sm:mx-5 mt-2 mb-1 rounded-lg border border-border bg-subtle px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-semibold text-fg inline-flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-accent" />
          Expectations this month
        </span>
        <span className="font-numeric text-caption text-fg-muted">
          {summary.deliveredTotal}/{summary.expectedTotal} met · {summary.leftoverTotal} left
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {summary.lines.map((line) => (
            <span
              key={line.creative_type}
              className="text-caption px-1.5 py-0.5 rounded-md bg-surface border border-border text-fg-2 font-numeric"
              title={line.layout ? `${line.creative_type} layout ${line.layout}` : line.creative_type}
            >
              {line.paused
                ? `${line.creative_type}: paused`
                : line.expected == null
                ? `${line.creative_type}: included`
                : `${line.creative_type}${line.layout ? ` ${line.layout}` : ''}: ${expectedQuotaText(line)}`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
