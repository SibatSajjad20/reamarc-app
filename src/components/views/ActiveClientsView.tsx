import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Search,
  Calendar,
  Paperclip,
  Download,
  User,
  Mail,
  Phone,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { Workspace } from '../../types';
import { downloadFileAttachment, openFileAttachment } from '../../utils/fileUrl';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { HealthBadge, PriorityBadge } from '../ui/WorkspaceBadges';
import { PageHeader } from '../ui/PageHeader';
import { Input } from '../ui/input';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import {
  TableCard,
  Table,
  THead,
  TBody,
  TH,
  TD,
  TR,
  TableEmpty,
  TableSkeletonRows,
} from '../ui/DataTable';
import { Sheet, SheetContent } from '../ui/sheet';
import { Button } from '../ui/button';

interface ActiveClientsViewProps {
  workspaces?: Workspace[];
}

type ClientFilter = 'All' | 'Retainer' | 'One-Time Project' | 'High Priority' | 'Emergency';

const FILTER_OPTIONS: SegmentedOption[] = [
  { value: 'All', label: 'All' },
  { value: 'Retainer', label: 'Retainer' },
  { value: 'One-Time Project', label: 'One-time project' },
  { value: 'High Priority', label: 'High priority' },
  { value: 'Emergency', label: 'Emergency' },
];

function formatContractDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso.includes('T') ? iso : `${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function ClientMark({ ws, size = 28 }: { ws: Workspace; size?: 28 | 40 }) {
  const fontSize = Math.round(size * 0.42);
  const initials = ws.initials || ws.name.substring(0, 2).toUpperCase();
  const bg = ws.brandColor?.startsWith('#') ? ws.brandColor : '#4f46e5';

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${fontSize}px`,
        backgroundColor: bg,
      }}
      className="rounded-mark text-white font-semibold flex items-center justify-center shrink-0 select-none shadow-xs"
      aria-hidden="true"
    >
      <span>{initials}</span>
    </div>
  );
}

export const ActiveClientsView: React.FC<ActiveClientsViewProps> = ({
  workspaces: propWorkspaces,
}) => {
  const { workspaces: liveWorkspaces, isLoading } = useWorkspaces();
  const workspaces = useMemo(
    () => (liveWorkspaces && liveWorkspaces.length > 0 ? liveWorkspaces : propWorkspaces || []),
    [liveWorkspaces, propWorkspaces]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ClientFilter>('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeWorkspaces = useMemo(
    () => workspaces.filter((w) => w.status !== 'inactive'),
    [workspaces]
  );

  const filteredWorkspaces = useMemo(() => {
    return activeWorkspaces.filter((w) => {
      const q = searchQuery.toLowerCase().trim();
      const servicesStr = (w.services || []).join(' ').toLowerCase();
      const matchesQuery =
        !q ||
        w.name.toLowerCase().includes(q) ||
        (w.poc_name && w.poc_name.toLowerCase().includes(q)) ||
        (w.poc_email && w.poc_email.toLowerCase().includes(q)) ||
        (w.poc_phone && w.poc_phone.toLowerCase().includes(q)) ||
        (w.project_cycle && w.project_cycle.toLowerCase().includes(q)) ||
        servicesStr.includes(q);

      let matchesFilter = true;
      if (activeFilter === 'Retainer') {
        matchesFilter = (w.project_cycle || 'Retainer') === 'Retainer';
      } else if (activeFilter === 'One-Time Project') {
        matchesFilter = w.project_cycle === 'One-Time Project';
      } else if (activeFilter === 'High Priority') {
        matchesFilter = w.priority === 'High';
      } else if (activeFilter === 'Emergency') {
        matchesFilter = w.health === 'Emergency';
      }

      return matchesQuery && matchesFilter;
    });
  }, [activeWorkspaces, searchQuery, activeFilter]);

  const selectedClient = useMemo(
    () => (selectedId ? activeWorkspaces.find((w) => w.id === selectedId) ?? null : null),
    [selectedId, activeWorkspaces]
  );

  // Close drawer if selected client disappears from the active set
  useEffect(() => {
    if (selectedId && !activeWorkspaces.some((w) => w.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, activeWorkspaces]);

  useEffect(() => {
    if (!selectedClient) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedClient]);

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-canvas p-6">
      {/* Page Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-2.5">
            <span>Active clients</span>
            <span className="px-2 py-0.5 text-xs font-numeric font-medium rounded-full bg-subtle text-fg-muted border border-border">
              {filteredWorkspaces.length}
            </span>
          </div>
        }
        description="Contracts, services and contacts for every active account."
      />

      {/* Toolbar: Search input (320px) + Segmented control */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="w-80">
          <Input
            inputSize="sm"
            icon={Search}
            placeholder="Search by name, service or contact"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clearable
            onClear={() => setSearchQuery('')}
          />
        </div>

        <SegmentedControl
          size="sm"
          value={activeFilter}
          onValueChange={(val) => setActiveFilter(val as ClientFilter)}
          options={FILTER_OPTIONS}
        />
      </div>

      {/* Client List DataTable */}
      <TableCard>
        <Table>
          <THead>
            <tr>
              <TH>Client</TH>
              <TH>Engagement</TH>
              <TH>Services</TH>
              <TH>POC</TH>
              <TH>Health</TH>
              <TH>Priority</TH>
              <TH>Contract end</TH>
              <TH className="w-10" />
            </tr>
          </THead>
          <TBody>
            {isLoading && workspaces.length === 0 ? (
              <TableSkeletonRows rows={6} columns={8} />
            ) : filteredWorkspaces.length === 0 ? (
              <TableEmpty
                colSpan={8}
                title="No active clients found"
                description={
                  searchQuery || activeFilter !== 'All'
                    ? 'Try adjusting your search query or filter.'
                    : 'No active client workspaces are currently registered.'
                }
                icon={Building2}
                isFiltered={Boolean(searchQuery || activeFilter !== 'All')}
                onClearFilters={() => {
                  setSearchQuery('');
                  setActiveFilter('All');
                }}
              />
            ) : (
              filteredWorkspaces.map((ws) => {
                const serviceCount = ws.services?.length ?? 0;
                const isOpen = selectedId === ws.id;
                const firstTwoServices = (ws.services || []).slice(0, 2);
                const extraServices = serviceCount - 2;

                return (
                  <TR
                    key={ws.id}
                    clickable
                    selected={isOpen}
                    onClick={() => setSelectedId(ws.id)}
                  >
                    <TD>
                      <div className="flex items-center gap-3 min-w-0">
                        <ClientMark ws={ws} size={28} />
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-fg truncate">
                            {ws.name}
                          </div>
                          {ws.industry && (
                            <div className="text-xs text-fg-muted truncate">
                              {ws.industry}
                            </div>
                          )}
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium bg-subtle border border-border text-fg-muted">
                        {ws.project_cycle || '—'}
                      </span>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-1 flex-wrap">
                        {firstTwoServices.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-subtle border border-border text-fg-muted"
                          >
                            {s}
                          </span>
                        ))}
                        {extraServices > 0 && (
                          <span className="text-[10px] text-fg-muted font-medium">
                            +{extraServices}
                          </span>
                        )}
                        {serviceCount === 0 && (
                          <span className="text-fg-muted text-xs">—</span>
                        )}
                      </div>
                    </TD>
                    <TD>
                      {ws.poc_name ? (
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-fg truncate">
                            {ws.poc_name}
                          </div>
                          {ws.poc_email && (
                            <div className="text-xs text-fg-muted truncate">
                              {ws.poc_email}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-fg-muted text-xs">—</span>
                      )}
                    </TD>
                    <TD>
                      <HealthBadge health={ws.health} />
                    </TD>
                    <TD>
                      <PriorityBadge priority={ws.priority} />
                    </TD>
                    <TD>
                      <span className="font-numeric text-xs text-fg-muted">
                        {ws.contract_end_date || 'Ongoing'}
                      </span>
                    </TD>
                    <TD className="w-10 text-right pr-4">
                      <ChevronRight className="w-4 h-4 text-fg-muted group-hover:text-fg transition-colors inline-block" />
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </TableCard>

      {/* Detail Sheet (640px) */}
      <Sheet open={Boolean(selectedClient)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <SheetContent side="right" size="wide" className="p-0 flex flex-col bg-surface border-l border-border">
          {selectedClient && (
            <>
              {/* Header with ClientMark 40, badges */}
              <div className="p-6 border-b border-border flex items-start justify-between gap-4 pr-12">
                <div className="flex items-center gap-3.5 min-w-0">
                  <ClientMark ws={selectedClient} size={40} />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-fg truncate">
                      {selectedClient.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1 text-xs text-fg-muted">
                      <span>{selectedClient.project_cycle || '—'}</span>
                      {selectedClient.industry && (
                        <>
                          <span>•</span>
                          <span>{selectedClient.industry}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <HealthBadge health={selectedClient.health} />
                  <PriorityBadge priority={selectedClient.priority} />
                </div>
              </div>

              {/* Drawer body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
                {/* Contract */}
                {(selectedClient.contract_start_date || selectedClient.contract_end_date) && (
                  <div className="p-4 rounded-lg bg-subtle/50 border border-border space-y-1.5">
                    <h3 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-accent" />
                      <span>Contract</span>
                    </h3>
                    <p className="text-xs font-numeric text-fg-muted">
                      {formatContractDate(selectedClient.contract_start_date) || 'Start'} →{' '}
                      {formatContractDate(selectedClient.contract_end_date) || 'Ongoing'}
                    </p>
                  </div>
                )}

                {/* Services */}
                {selectedClient.services && selectedClient.services.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-fg">
                      Services ({selectedClient.services.length})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedClient.services.map((service) => (
                        <span
                          key={service}
                          className="px-2 py-0.5 rounded-sm text-xs font-medium bg-subtle text-fg border border-border"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Point of contact */}
                {(selectedClient.poc_name ||
                  selectedClient.poc_email ||
                  selectedClient.poc_phone) && (
                  <div className="p-4 rounded-lg bg-subtle/50 border border-border space-y-2.5">
                    <h3 className="text-xs font-semibold text-fg flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-accent" />
                      <span>Point of contact</span>
                    </h3>
                    {selectedClient.poc_name && (
                      <p className="font-medium text-fg text-sm">
                        {selectedClient.poc_name}
                      </p>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {selectedClient.poc_email && (
                        <a
                          href={`mailto:${selectedClient.poc_email}`}
                          className="text-accent hover:underline flex items-center gap-1.5 truncate text-xs"
                          title={selectedClient.poc_email}
                        >
                          <Mail className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{selectedClient.poc_email}</span>
                        </a>
                      )}
                      {selectedClient.poc_phone && (
                        <a
                          href={`tel:${selectedClient.poc_phone}`}
                          className="text-fg-muted hover:text-fg flex items-center gap-1.5 text-xs font-numeric"
                          title={selectedClient.poc_phone}
                        >
                          <Phone className="w-3.5 h-3.5 shrink-0 text-success-fg" />
                          <span>{selectedClient.poc_phone}</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Tagline */}
                {selectedClient.tagline && (
                  <div className="p-4 rounded-lg bg-subtle/50 border border-border">
                    <p className="text-xs text-fg-muted">
                      {selectedClient.tagline}
                    </p>
                  </div>
                )}

                {/* Proposals */}
                {selectedClient.proposal_url && (
                  <div className="w-full flex items-center justify-between p-3.5 rounded-lg bg-subtle border border-border text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3.5 h-3.5 text-accent shrink-0" />
                      <span className="truncate font-medium text-fg">
                        {selectedClient.proposal_name || 'Client proposal document'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          openFileAttachment(
                            selectedClient.proposal_url!,
                            selectedClient.proposal_name || `${selectedClient.name}_Proposal`
                          )
                        }
                        title="View proposal in browser"
                      >
                        <span>View</span>
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          downloadFileAttachment(
                            selectedClient.proposal_url!,
                            selectedClient.proposal_name || `${selectedClient.name}_Proposal`
                          )
                        }
                        title="Download proposal document"
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}

                {selectedClient.description && (
                  <p className="text-xs leading-relaxed text-fg-muted">
                    {selectedClient.description}
                  </p>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
