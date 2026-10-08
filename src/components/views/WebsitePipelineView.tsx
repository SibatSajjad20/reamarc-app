import React, { useState, useMemo, useEffect } from 'react';
import {
  Kanban as KanbanIcon,
  List as ListIcon,
  Download,
  Plus,
  Search,
  ArrowUpDown,
  MoreHorizontal,
  ExternalLink,
  Check,
  Clock,
  User,
  Calendar,
  ChevronRight,
  X,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { Callout } from '../ui/Callout';
import { StatusPill } from '../ui/StatusPill';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '../ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog';
import { cn } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import type { Workspace } from '../../types';

// 7 Pipeline Stages per mock 05-website-pipeline-proposed.png
export interface PipelineStageConfig {
  id: PipelineStageId;
  step: number;
  label: string;
  name: string;
}

export type PipelineStageId =
  | 'discovery'
  | 'wireframes'
  | 'design'
  | 'development'
  | 'qa'
  | 'launch'
  | 'maintenance';

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { id: 'discovery', step: 1, label: '1. Discovery', name: 'Discovery' },
  { id: 'wireframes', step: 2, label: '2. Sitemap & wireframes', name: 'Sitemap & wireframes' },
  { id: 'design', step: 3, label: '3. UI design', name: 'UI design' },
  { id: 'development', step: 4, label: '4. Development', name: 'Development' },
  { id: 'qa', step: 5, label: '5. Content & QA', name: 'Content & QA' },
  { id: 'launch', step: 6, label: '6. Launch', name: 'Launch' },
  { id: 'maintenance', step: 7, label: '7. Maintenance', name: 'Maintenance' },
];

export type HealthStatus = 'on_track' | 'at_risk' | 'overdue' | 'not_started' | 'live';
export type StatusCategory = 'active' | 'live' | 'archived';

export interface ProposedProject {
  id: string;
  initials: string;
  name: string;
  client: string;
  stageId: PipelineStageId;
  stageStep: number;
  stageName: string;
  progress: number;
  nextMilestone: string;
  leadInitials: string;
  leadName: string;
  due: string;
  isOverdue?: boolean;
  health: HealthStatus;
  healthLabel: string;
  category: StatusCategory;
  description: string;
  deliverables: string[];
  techStack: string[];
  stagingUrl?: string;
  liveUrl?: string;
}

// 9 Exact Projects from 05-website-pipeline-proposed.png
export const INITIAL_PROJECTS: ProposedProject[] = [
  {
    id: 'proj-1',
    initials: 'ND',
    name: 'Website revamp',
    client: 'Northwind Dental',
    stageId: 'development',
    stageStep: 4,
    stageName: 'Development',
    progress: 62,
    nextMilestone: 'Booking flow build',
    leadInitials: 'AM',
    leadName: 'Ali Malik',
    due: 'Oct 30',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'Comprehensive dental clinic website redesign with custom online appointment booking and patient intake forms.',
    deliverables: ['Custom booking flow', 'Mobile responsive design', 'Dental service catalog', 'Google Maps integration'],
    techStack: ['Next.js', 'Tailwind CSS', 'Sanity CMS', 'Vercel'],
    stagingUrl: 'https://staging.northwind-dental.reamarc.dev',
  },
  {
    id: 'proj-2',
    initials: 'VO',
    name: 'Shopify store',
    client: 'Verde Organics',
    stageId: 'launch',
    stageStep: 6,
    stageName: 'Launch',
    progress: 95,
    nextMilestone: 'DNS switch · Oct 12',
    leadInitials: 'BH',
    leadName: 'Bilal Hassan',
    due: 'Oct 12',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'Direct-to-consumer organic wellness e-commerce store with subscription delivery engine and custom bundle builder.',
    deliverables: ['Shopify 2.0 theme', 'Recharge subscriptions', 'Custom bundle quiz', 'Payment gateway configuration'],
    techStack: ['Shopify Liquid', 'Alpine.js', 'Tailwind CSS', 'Klaviyo'],
    stagingUrl: 'https://verde-organics.myshopify.com',
  },
  {
    id: 'proj-3',
    initials: 'HC',
    name: 'Room booking site',
    client: 'Harbor & Co.',
    stageId: 'qa',
    stageStep: 5,
    stageName: 'Content & QA',
    progress: 84,
    nextMilestone: 'Client copy pending',
    leadInitials: 'AM',
    leadName: 'Ali Malik',
    due: 'Oct 18',
    health: 'at_risk',
    healthLabel: 'At risk',
    category: 'active',
    description: 'Luxury seaside boutique hotel reservations portal with dynamic room pricing and seasonal packages.',
    deliverables: ['Booking calendar integration', 'Room 360 preview', 'Dining reservation hook', 'Multi-currency checkout'],
    techStack: ['React', 'Node.js', 'Stripe', 'PostgreSQL'],
    stagingUrl: 'https://preview.harborandco.com',
  },
  {
    id: 'proj-4',
    initials: 'BS',
    name: 'Campaign landing pages',
    client: 'Bloom Skincare',
    stageId: 'development',
    stageStep: 4,
    stageName: 'Development',
    progress: 55,
    nextMilestone: 'Quiz integration',
    leadInitials: 'BH',
    leadName: 'Bilal Hassan',
    due: 'Oct 22',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'High-converting interactive skincare routine quiz landing pages with personalized recommendation engine.',
    deliverables: ['Interactive quiz funnel', 'Dynamic product bundling', 'Meta pixel event tracking', 'A/B testing setup'],
    techStack: ['Next.js', 'Framer Motion', 'Shopify Storefront API'],
    stagingUrl: 'https://campaign.bloomskincare.co',
  },
  {
    id: 'proj-5',
    initials: 'LR',
    name: 'Listings portal',
    client: 'Lumen Realty',
    stageId: 'design',
    stageStep: 3,
    stageName: 'UI design',
    progress: 40,
    nextMilestone: 'Listing page review',
    leadInitials: 'AM',
    leadName: 'Ali Malik',
    due: 'Nov 20',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'Modern real estate brokerage property search platform with interactive maps and neighborhood demographic statistics.',
    deliverables: ['Figma design system', 'MLS listing sync spec', 'Agent directory design', 'Virtual tour embeds'],
    techStack: ['Figma', 'React', 'Mapbox GL', 'Tailwind CSS'],
  },
  {
    id: 'proj-6',
    initials: 'PE',
    name: 'Admissions site',
    client: 'Pinecrest Academy',
    stageId: 'wireframes',
    stageStep: 2,
    stageName: 'Sitemap & wireframes',
    progress: 25,
    nextMilestone: 'Sitemap sign-off',
    leadInitials: 'BH',
    leadName: 'Bilal Hassan',
    due: 'Dec 5',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'Private academy academic portal with online admissions inquiry, virtual open house scheduling, and fee calculators.',
    deliverables: ['Comprehensive sitemap', 'Wireframe deck', 'Admissions application form', 'Academic calendar architecture'],
    techStack: ['Figma', 'Whimsical', 'WordPress CMS'],
  },
  {
    id: 'proj-7',
    initials: 'KM',
    name: 'Dealer website',
    client: 'Kinetic Motors',
    stageId: 'discovery',
    stageStep: 1,
    stageName: 'Discovery',
    progress: 10,
    nextMilestone: 'Kick-off call · Oct 13',
    leadInitials: 'AM',
    leadName: 'Ali Malik',
    due: 'Jan 15',
    health: 'not_started',
    healthLabel: 'Not started',
    category: 'active',
    description: 'EV dealership digital showroom with inventory filter, trade-in valuation tool, and test drive booking.',
    deliverables: ['Project scope document', 'Competitor benchmark report', 'Technical architecture brief'],
    techStack: ['Next.js', 'Supabase', 'Tailwind CSS'],
  },
  {
    id: 'proj-8',
    initials: 'CF',
    name: 'Recipe hub',
    client: 'Crescent Foods',
    stageId: 'development',
    stageStep: 4,
    stageName: 'Development',
    progress: 48,
    nextMilestone: 'API delay from vendor',
    leadInitials: 'AR',
    leadName: 'Ahmed Raza',
    due: 'Oct 15',
    isOverdue: true,
    health: 'overdue',
    healthLabel: 'Overdue',
    category: 'active',
    description: 'Food brand recipe magazine with grocery delivery integrations, nutritional breakdown, and user recipe submissions.',
    deliverables: ['Recipe indexing engine', 'Nutritional facts calculator', 'Instacart API connection', 'Printable recipe cards'],
    techStack: ['React', 'Express.js', 'MongoDB', 'Cloudinary'],
    stagingUrl: 'https://staging.crescentrecipes.com',
  },
  {
    id: 'proj-9',
    initials: 'SL',
    name: 'Menu & reservations',
    client: 'Saffron Lane',
    stageId: 'maintenance',
    stageStep: 7,
    stageName: 'Maintenance',
    progress: 100,
    nextMilestone: 'Monthly care plan',
    leadInitials: 'BH',
    leadName: 'Bilal Hassan',
    due: '—',
    health: 'live',
    healthLabel: 'Live',
    category: 'live',
    description: 'Fine dining contemporary restaurant digital presence with contactless QR code menus and OpenTable integration.',
    deliverables: ['Production deployment', 'SSL & DNS routing', 'Staff menu update guide', 'Monthly maintenance agreement'],
    techStack: ['Astro', 'Tailwind CSS', 'OpenTable Widget', 'Cloudflare Pages'],
    liveUrl: 'https://saffronlane.com',
  },
];

export interface WebsitePipelineViewProps {
  workspaces?: Workspace[];
  activeSection?: 'board' | 'table' | 'tasks';
  onSectionChange?: (section: 'board' | 'table' | 'tasks') => void;
}

export const WebsitePipelineView: React.FC<WebsitePipelineViewProps> = ({
  activeSection,
  onSectionChange,
}) => {
  const { addToast } = useToast();

  // In-memory project state (zero external network requests per Phase 21 spec)
  const [projects, setProjects] = useState<ProposedProject[]>(INITIAL_PROJECTS);
  const [viewMode, setViewMode] = useState<'table' | 'board'>(() =>
    activeSection === 'board' ? 'board' : 'table'
  );

  useEffect(() => {
    if (activeSection && (activeSection === 'board' || activeSection === 'table')) {
      setViewMode(activeSection);
    }
  }, [activeSection]);
  const [categoryFilter, setCategoryFilter] = useState<StatusCategory>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStageId | 'all'>('all');
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<HealthStatus | 'all'>('all');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Selected row checkboxes
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Selected project for Sheet Drawer
  const [selectedProject, setSelectedProject] = useState<ProposedProject | null>(null);

  // New Project Dialog state
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newStage, setNewStage] = useState<PipelineStageId>('discovery');
  const [newLead, setNewLead] = useState('AM');
  const [newDue, setNewDue] = useState('Nov 30');
  const [newDescription, setNewDescription] = useState('');

  // Counts by stage for the KPI strip
  const stageCounts = useMemo(() => {
    const counts: Record<PipelineStageId, number> = {
      discovery: 0,
      wireframes: 0,
      design: 0,
      development: 0,
      qa: 0,
      launch: 0,
      maintenance: 0,
    };
    for (const p of projects) {
      if (counts[p.stageId] !== undefined) {
        counts[p.stageId]++;
      }
    }
    return counts;
  }, [projects]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const active = projects.filter((p) => p.category === 'active').length;
    const live = projects.filter((p) => p.category === 'live').length;
    return { active, live, archived: 14 };
  }, [projects]);

  // Filtered & Sorted Projects
  const filteredProjects = useMemo(() => {
    return projects
      .filter((p) => {
        // Tab category
        if (categoryFilter === 'active' && p.category !== 'active') return false;
        if (categoryFilter === 'live' && p.category !== 'live') return false;
        if (categoryFilter === 'archived' && p.category !== 'archived') return false;

        // Stage filter
        if (stageFilter !== 'all' && p.stageId !== stageFilter) return false;

        // Lead filter
        if (leadFilter !== 'all' && p.leadInitials !== leadFilter) return false;

        // Health filter
        if (healthFilter !== 'all' && p.health !== healthFilter) return false;

        // Search text
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            p.name.toLowerCase().includes(q) ||
            p.client.toLowerCase().includes(q) ||
            p.stageName.toLowerCase().includes(q) ||
            p.nextMilestone.toLowerCase().includes(q) ||
            p.leadName.toLowerCase().includes(q);
          if (!match) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (!sortAsc) return a.due.localeCompare(b.due);
        return b.due.localeCompare(a.due);
      });
  }, [projects, categoryFilter, stageFilter, leadFilter, healthFilter, searchQuery, sortAsc]);

  // Checkbox handlers
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredProjects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
    }
  };

  const handleToggleRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Move project stage (in Sheet)
  const handleMoveStage = (projectId: string, newStageId: PipelineStageId) => {
    const stageConf = PIPELINE_STAGES.find((s) => s.id === newStageId);
    if (!stageConf) return;

    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          const updated: ProposedProject = {
            ...p,
            stageId: newStageId,
            stageStep: stageConf.step,
            stageName: stageConf.name,
            progress: Math.min(100, Math.round((stageConf.step / 7) * 100)),
            category: newStageId === 'maintenance' ? 'live' : 'active',
            health: newStageId === 'maintenance' ? 'live' : p.health,
            healthLabel: newStageId === 'maintenance' ? 'Live' : p.healthLabel,
          };
          if (selectedProject?.id === projectId) {
            setSelectedProject(updated);
          }
          return updated;
        }
        return p;
      })
    );
    addToast('Stage Updated', `Moved project to ${stageConf.name}`, 'success');
  };

  // Create new project locally
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newClient.trim()) return;

    const stageConf = PIPELINE_STAGES.find((s) => s.id === newStage) || PIPELINE_STAGES[0];
    const initials = newClient
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'WP';

    const newProj: ProposedProject = {
      id: `proj-${Date.now()}`,
      initials,
      name: newName.trim(),
      client: newClient.trim(),
      stageId: stageConf.id,
      stageStep: stageConf.step,
      stageName: stageConf.name,
      progress: Math.round((stageConf.step / 7) * 100),
      nextMilestone: 'Initial requirements alignment',
      leadInitials: newLead,
      leadName: newLead === 'AM' ? 'Ali Malik' : newLead === 'BH' ? 'Bilal Hassan' : 'Ahmed Raza',
      due: newDue.trim() || 'TBD',
      health: 'on_track',
      healthLabel: 'On track',
      category: 'active',
      description: newDescription.trim() || 'Custom website build project.',
      deliverables: ['Discovery brief', 'Responsive wireframes', 'UI mockups', 'Production deploy'],
      techStack: ['Next.js', 'Tailwind CSS'],
    };

    setProjects((prev) => [newProj, ...prev]);
    setIsNewProjectOpen(false);
    setNewName('');
    setNewClient('');
    setNewDescription('');
    addToast('Project Created', `Added ${newProj.name} to website pipeline`, 'success');
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Project', 'Client', 'Stage', 'Progress', 'Next Milestone', 'Lead', 'Due Date', 'Health'];
    const rows = filteredProjects.map((p) => [
      `"${p.name}"`,
      `"${p.client}"`,
      `"${p.stageName}"`,
      `"${p.progress}%"`,
      `"${p.nextMilestone}"`,
      `"${p.leadName} (${p.leadInitials})"`,
      `"${p.due}"`,
      `"${p.healthLabel}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `website_pipeline_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast('Export Complete', 'Exported website pipeline to CSV', 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-canvas overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-4">
        {/* Breadcrumb / Category header */}
        <div className="flex items-center gap-1.5 text-xs text-fg-muted font-medium select-none">
          <span>Clients</span>
          <ChevronRight className="w-3.5 h-3.5 text-fg-faint" />
          <span className="text-fg">Website pipeline</span>
        </div>

        {/* PageHeader with Action Buttons matching mock 05-website-pipeline-proposed.png */}
        <PageHeader
          title="Website pipeline"
          description="Website builds by stage, from discovery to launch and care plans."
          actions={
            <div className="flex items-center gap-2">
              {/* Board / Table View Switcher */}
              <button
                type="button"
                onClick={() => {
                  const next = viewMode === 'table' ? 'board' : 'table';
                  setViewMode(next);
                  onSectionChange?.(next);
                }}
                className={cn(
                  'h-9 px-3 rounded-md border text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer select-none',
                  viewMode === 'board'
                    ? 'bg-subtle border-border-strong text-fg'
                    : 'bg-surface border-border text-fg hover:bg-hover hover:border-border-strong'
                )}
                title={viewMode === 'table' ? 'Switch to Kanban Board' : 'Switch to Table'}
              >
                {viewMode === 'table' ? (
                  <>
                    <KanbanIcon className="w-3.5 h-3.5 text-fg-muted" />
                    <span>Board</span>
                  </>
                ) : (
                  <>
                    <ListIcon className="w-3.5 h-3.5 text-fg-muted" />
                    <span>Table</span>
                  </>
                )}
              </button>

              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-9 px-3 rounded-md border border-border hover:border-border-strong bg-surface hover:bg-hover text-xs font-medium text-fg transition-colors flex items-center gap-1.5 cursor-pointer select-none"
              >
                <Download className="w-3.5 h-3.5 text-fg-muted" />
                <span>Export</span>
              </button>

              {/* Primary Action: New project */}
              <button
                type="button"
                onClick={() => setIsNewProjectOpen(true)}
                className="h-9 px-3.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer select-none shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New project</span>
              </button>
            </div>
          }
        />

        {/* Visible Info Callout per §13.21 Definition of Done */}
        <Callout
          variant="info"
          title="Preview: not connected to data yet"
          className="mb-2"
        >
          This is a frontend demonstration of the proposed website pipeline module. Data is stored locally in session memory and zero external network requests are made.
        </Callout>

        {/* Stage KPI Pipeline Strip: 7 stage blocks matching mock 05 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {PIPELINE_STAGES.map((s) => {
            const count = stageCounts[s.id] || 0;
            const isSelected = stageFilter === s.id;
            // Development is highlighted in the mock
            const isDevHighlight = s.id === 'development' && stageFilter === 'all';

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setStageFilter((curr) => (curr === s.id ? 'all' : s.id))}
                className={cn(
                  'p-3 rounded-lg border text-left transition-all cursor-pointer select-none flex flex-col justify-between min-h-[72px]',
                  isSelected
                    ? 'bg-accent-soft border-accent ring-1 ring-accent'
                    : isDevHighlight
                    ? 'bg-accent-soft/40 border-accent/40 hover:border-accent'
                    : 'bg-surface border-border hover:border-border-strong hover:bg-hover'
                )}
              >
                <div className="text-xs font-medium text-fg-muted truncate">
                  {s.label}
                </div>
                <div
                  className={cn(
                    'text-xl font-semibold font-mono leading-none mt-2',
                    isSelected || isDevHighlight ? 'text-accent' : 'text-fg'
                  )}
                >
                  {count}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filters Toolbar: Segmented Tabs · Search · Stage · Lead · Health · Sort */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          {/* Left: Category Tabs + Search + Dropdown filters */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
            {/* Status Tabs: Active · Live · Archived */}
            <div className="inline-flex p-0.5 rounded-lg bg-subtle border border-border text-xs select-none">
              <button
                type="button"
                onClick={() => setCategoryFilter('active')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                  categoryFilter === 'active'
                    ? 'bg-surface text-fg shadow-2xs font-semibold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                <span>Active</span>
                <span className="font-mono text-xs opacity-80">{tabCounts.active}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('live')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                  categoryFilter === 'live'
                    ? 'bg-surface text-fg shadow-2xs font-semibold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                <span>Live</span>
                <span className="font-mono text-xs opacity-80">{tabCounts.live}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('archived')}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5',
                  categoryFilter === 'archived'
                    ? 'bg-surface text-fg shadow-2xs font-semibold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                <span>Archived</span>
                <span className="font-mono text-xs opacity-80">{tabCounts.archived}</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px] max-w-[260px] flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects"
                className="w-full h-8 pl-8 pr-3 rounded-md text-xs bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:border-border-strong focus:ring-1 focus:ring-accent transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Stage filter dropdown */}
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg hover:border-border-strong transition-colors cursor-pointer select-none"
            >
              <option value="all">+ Stage</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Lead filter dropdown */}
            <select
              value={leadFilter}
              onChange={(e) => setLeadFilter(e.target.value)}
              className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg hover:border-border-strong transition-colors cursor-pointer select-none"
            >
              <option value="all">Lead Any</option>
              <option value="AM">Ali Malik (AM)</option>
              <option value="BH">Bilal Hassan (BH)</option>
              <option value="AR">Ahmed Raza (AR)</option>
            </select>

            {/* Health filter dropdown */}
            <select
              value={healthFilter}
              onChange={(e) => setHealthFilter(e.target.value as any)}
              className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg hover:border-border-strong transition-colors cursor-pointer select-none"
            >
              <option value="all">+ Health</option>
              <option value="on_track">On track</option>
              <option value="at_risk">At risk</option>
              <option value="overdue">Overdue</option>
              <option value="not_started">Not started</option>
              <option value="live">Live</option>
            </select>
          </div>

          {/* Right: Sort action */}
          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="h-8 px-2.5 rounded-md border border-border hover:border-border-strong bg-surface hover:bg-hover text-xs font-medium text-fg-muted hover:text-fg transition-colors flex items-center gap-1.5 cursor-pointer select-none"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>Due date</span>
          </button>
        </div>

        {/* Content Body: Table View or Board View */}
        {viewMode === 'table' ? (
          /* TABLE VIEW matching 05-website-pipeline-proposed.png */
          <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-subtle text-fg-muted font-medium select-none">
                    <th className="py-2.5 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === filteredProjects.length}
                        onChange={handleToggleSelectAll}
                        className="rounded border-border text-accent focus:ring-accent cursor-pointer"
                      />
                    </th>
                    <th className="py-2.5 px-3 min-w-[200px]">Project</th>
                    <th className="py-2.5 px-3 min-w-[170px]">Stage</th>
                    <th className="py-2.5 px-3 min-w-[120px]">Progress</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Next milestone</th>
                    <th className="py-2.5 px-3 w-16 text-center">Lead</th>
                    <th className="py-2.5 px-3 w-20">Due</th>
                    <th className="py-2.5 px-3 w-28">Health</th>
                    <th className="py-2.5 px-3 w-10 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProjects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-fg-muted text-xs">
                        No projects found matching the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredProjects.map((p) => {
                      const isSelected = selectedIds.has(p.id);

                      return (
                        <tr
                          key={p.id}
                          onClick={() => setSelectedProject(p)}
                          className={cn(
                            'hover:bg-hover transition-colors cursor-pointer group',
                            isSelected && 'bg-accent-soft/30'
                          )}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3" onClick={(e) => handleToggleRow(p.id, e)}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded border-border text-accent focus:ring-accent cursor-pointer"
                            />
                          </td>

                          {/* Project: Initials Avatar tile + Title + Client */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-md bg-subtle border border-border text-fg font-semibold text-xs flex items-center justify-center shrink-0">
                                {p.initials}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-fg text-xs truncate group-hover:text-accent transition-colors">
                                  {p.name}
                                </div>
                                <div className="text-xs text-fg-muted truncate">
                                  {p.client}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Stage: Name + 7-segment dash bar underneath */}
                          <td className="py-3 px-3">
                            <div>
                              <span className="font-medium text-fg text-xs">{p.stageName}</span>
                              {/* 7-segment dash bar indicator */}
                              <div className="flex items-center gap-1 mt-1.5">
                                {[1, 2, 3, 4, 5, 6, 7].map((stepNum) => {
                                  const isFilled = stepNum <= p.stageStep;
                                  return (
                                    <div
                                      key={stepNum}
                                      className={cn(
                                        'w-3 h-1 rounded-full transition-colors',
                                        isFilled ? 'bg-accent' : 'bg-border'
                                      )}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </td>

                          {/* Progress: Progress bar + Percentage */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 bg-border rounded-full overflow-hidden shrink-0">
                                <div
                                  className="h-full bg-accent rounded-full transition-all"
                                  style={{ width: `${p.progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-mono text-fg-muted tabular-nums">
                                {p.progress}%
                              </span>
                            </div>
                          </td>

                          {/* Next milestone */}
                          <td className="py-3 px-3 text-fg truncate max-w-[200px]">
                            {p.nextMilestone}
                          </td>

                          {/* Lead Assignee: Round initials circle */}
                          <td className="py-3 px-3 text-center">
                            <div
                              className="w-6 h-6 rounded-full bg-subtle border border-border text-[10px] font-medium text-fg flex items-center justify-center mx-auto"
                              title={p.leadName}
                            >
                              {p.leadInitials}
                            </div>
                          </td>

                          {/* Due Date: Red if overdue */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span
                              className={cn(
                                'font-mono text-xs',
                                p.isOverdue ? 'text-danger-fg font-semibold' : 'text-fg'
                              )}
                            >
                              {p.due}
                            </span>
                          </td>

                          {/* Health: StatusPill */}
                          <td className="py-3 px-3">
                            <StatusPill
                              variant={
                                p.health === 'on_track'
                                  ? 'success'
                                  : p.health === 'at_risk'
                                  ? 'warning'
                                  : p.health === 'overdue'
                                  ? 'danger'
                                  : p.health === 'live'
                                  ? 'accent'
                                  : 'neutral'
                              }
                              dot
                              label={p.healthLabel}
                            />
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProject(p);
                              }}
                              className="w-7 h-7 rounded-md flex items-center justify-center text-fg-muted hover:text-fg hover:bg-hover opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Project details"
                            >
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* KANBAN BOARD VIEW (7 Columns matching the 7 stages) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 items-start">
            {PIPELINE_STAGES.map((stage) => {
              const stageProjects = filteredProjects.filter((p) => p.stageId === stage.id);

              return (
                <div
                  key={stage.id}
                  className="rounded-lg border border-border bg-subtle/50 p-2.5 space-y-2.5 min-h-[400px] flex flex-col"
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                    <div className="text-xs font-semibold text-fg truncate">
                      {stage.name}
                    </div>
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded-full bg-surface border border-border text-fg-muted">
                      {stageProjects.length}
                    </span>
                  </div>

                  {/* Cards List */}
                  <div className="space-y-2 flex-1">
                    {stageProjects.length === 0 ? (
                      <div className="py-8 text-center text-xs text-fg-faint">
                        No projects
                      </div>
                    ) : (
                      stageProjects.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedProject(p)}
                          className="p-3 rounded-lg border border-border bg-surface hover:border-border-strong hover:shadow-xs transition-all cursor-pointer space-y-2.5 group"
                        >
                          {/* Card Top: Initials + Title + Client */}
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-md bg-subtle border border-border text-fg font-semibold text-xs flex items-center justify-center shrink-0">
                              {p.initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-fg text-xs truncate group-hover:text-accent transition-colors">
                                {p.name}
                              </h3>
                              <p className="text-xs text-fg-muted truncate">
                                {p.client}
                              </p>
                            </div>
                          </div>

                          {/* Progress line */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[10px] text-fg-muted font-mono">
                              <span>Progress</span>
                              <span>{p.progress}%</span>
                            </div>
                            <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent rounded-full"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                          </div>

                          {/* Milestone */}
                          <div className="text-xs text-fg-muted truncate flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-fg-faint shrink-0" />
                            <span className="truncate">{p.nextMilestone}</span>
                          </div>

                          {/* Card Footer: Due Date, Lead Avatar, Health Pill */}
                          <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="w-5 h-5 rounded-full bg-subtle border border-border text-[9px] font-medium text-fg flex items-center justify-center"
                                title={p.leadName}
                              >
                                {p.leadInitials}
                              </div>
                              <span
                                className={cn(
                                  'font-mono text-[10px]',
                                  p.isOverdue ? 'text-danger-fg font-semibold' : 'text-fg-muted'
                                )}
                              >
                                {p.due}
                              </span>
                            </div>

                            <StatusPill
                              variant={
                                p.health === 'on_track'
                                  ? 'success'
                                  : p.health === 'at_risk'
                                  ? 'warning'
                                  : p.health === 'overdue'
                                  ? 'danger'
                                  : p.health === 'live'
                                  ? 'accent'
                                  : 'neutral'
                              }
                              dot
                              label={p.healthLabel}
                              className="scale-90 origin-right"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PROJECT DETAIL SHEET (Drawer) */}
      <Sheet open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        {selectedProject && (
          <SheetContent side="right" size="wide" className="w-full sm:max-w-[560px] p-0 flex flex-col">
            <SheetHeader className="p-5 border-b border-border bg-subtle flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-surface border border-border text-fg font-semibold text-sm flex items-center justify-center shrink-0">
                  {selectedProject.initials}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-sm font-semibold text-fg truncate">
                    {selectedProject.name}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-fg-muted truncate">
                    {selectedProject.client}
                  </SheetDescription>
                </div>
              </div>
              <SheetClose className="w-7 h-7 rounded-md border border-border bg-surface text-fg-muted hover:text-fg flex items-center justify-center">
                <X className="w-4 h-4" />
              </SheetClose>
            </SheetHeader>

            {/* Sheet Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Quick Status Bar */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-subtle border border-border">
                <div className="space-y-0.5">
                  <div className="text-xs text-fg-muted">Current Stage</div>
                  <div className="font-semibold text-fg">{selectedProject.stageName}</div>
                </div>
                <StatusPill
                  variant={
                    selectedProject.health === 'on_track'
                      ? 'success'
                      : selectedProject.health === 'at_risk'
                      ? 'warning'
                      : selectedProject.health === 'overdue'
                      ? 'danger'
                      : selectedProject.health === 'live'
                      ? 'accent'
                      : 'neutral'
                  }
                  dot
                  label={selectedProject.healthLabel}
                />
              </div>

              {/* Stage Progress Stepper */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-medium text-fg">
                  <span>Stage Progression</span>
                  <span className="font-mono text-fg-muted">{selectedProject.progress}%</span>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {PIPELINE_STAGES.map((s) => {
                    const isPassed = s.step <= selectedProject.stageStep;
                    const isCurrent = s.step === selectedProject.stageStep;

                    return (
                      <div
                        key={s.id}
                        className={cn(
                          'h-2 rounded-full transition-colors',
                          isCurrent
                            ? 'bg-accent ring-2 ring-accent/30'
                            : isPassed
                            ? 'bg-accent'
                            : 'bg-border'
                        )}
                        title={s.name}
                      />
                    );
                  })}
                </div>
                <div className="text-xs text-fg-muted">
                  Stage {selectedProject.stageStep} of 7: {selectedProject.stageName}
                </div>
              </div>

              {/* Move Stage Selector */}
              <div className="space-y-1.5 p-3 rounded-lg border border-border bg-surface">
                <label className="text-xs font-medium text-fg-muted">Update Stage</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedProject.stageId}
                    onChange={(e) => handleMoveStage(selectedProject.id, e.target.value as any)}
                    className="flex-1 h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-subtle">
                <div className="space-y-1">
                  <span className="text-xs text-fg-muted flex items-center gap-1">
                    <User className="w-3 h-3 text-fg-faint" />
                    Project Lead
                  </span>
                  <div className="font-medium text-fg">
                    {selectedProject.leadName} ({selectedProject.leadInitials})
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-fg-muted flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-fg-faint" />
                    Target Due Date
                  </span>
                  <div
                    className={cn(
                      'font-medium font-mono',
                      selectedProject.isOverdue ? 'text-danger-fg font-semibold' : 'text-fg'
                    )}
                  >
                    {selectedProject.due}
                  </div>
                </div>

                <div className="col-span-2 space-y-1 pt-1 border-t border-border/50">
                  <span className="text-xs text-fg-muted flex items-center gap-1">
                    <Clock className="w-3 h-3 text-fg-faint" />
                    Next Immediate Milestone
                  </span>
                  <div className="font-medium text-fg">{selectedProject.nextMilestone}</div>
                </div>
              </div>

              {/* Project Description */}
              <div className="space-y-1">
                <h4 className="font-medium text-fg">Project Overview</h4>
                <p className="text-fg-muted leading-relaxed">{selectedProject.description}</p>
              </div>

              {/* Deliverables Checklist */}
              {selectedProject.deliverables && (
                <div className="space-y-2">
                  <h4 className="font-medium text-fg">Key Deliverables</h4>
                  <div className="space-y-1.5">
                    {selectedProject.deliverables.map((del, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2 rounded-md bg-subtle border border-border text-xs text-fg"
                      >
                        <div className="w-4 h-4 rounded-full bg-success-bg text-success-fg flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span>{del}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tech Stack */}
              {selectedProject.techStack && (
                <div className="space-y-2">
                  <h4 className="font-medium text-fg">Technology Stack</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProject.techStack.map((tech, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-subtle border border-border text-xs font-mono text-fg"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* URLs (Staging / Live) */}
              {(selectedProject.stagingUrl || selectedProject.liveUrl) && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <h4 className="font-medium text-fg">Environments</h4>
                  <div className="space-y-1.5">
                    {selectedProject.stagingUrl && (
                      <a
                        href={selectedProject.stagingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2 rounded-md bg-subtle border border-border text-fg hover:border-border-strong hover:text-accent transition-colors"
                      >
                        <span className="truncate">Staging Environment</span>
                        <ExternalLink className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                      </a>
                    )}
                    {selectedProject.liveUrl && (
                      <a
                        href={selectedProject.liveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-2 rounded-md bg-subtle border border-border text-fg hover:border-border-strong hover:text-accent transition-colors"
                      >
                        <span className="truncate">Live Production Site</span>
                        <ExternalLink className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>

      {/* NEW PROJECT DIALOG (Modal) */}
      <Dialog open={isNewProjectOpen} onOpenChange={setIsNewProjectOpen}>
        <DialogContent maxWidth="md" className="p-0 overflow-hidden">
          <form onSubmit={handleCreateProject}>
            <DialogHeader className="p-5 border-b border-border bg-subtle">
              <DialogTitle className="text-sm font-semibold text-fg">New website project</DialogTitle>
              <DialogDescription className="text-xs text-fg-muted">
                Add a new website delivery project to the pipeline.
              </DialogDescription>
            </DialogHeader>

            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-fg">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Brand Redesign & E-commerce"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-fg">Client Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Health Corp"
                  value={newClient}
                  onChange={(e) => setNewClient(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-fg">Initial Stage</label>
                  <select
                    value={newStage}
                    onChange={(e) => setNewStage(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-fg">Project Lead</label>
                  <select
                    value={newLead}
                    onChange={(e) => setNewLead(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    <option value="AM">Ali Malik (AM)</option>
                    <option value="BH">Bilal Hassan (BH)</option>
                    <option value="AR">Ahmed Raza (AR)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-fg">Target Launch Date</label>
                <input
                  type="text"
                  placeholder="e.g. Nov 30"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-fg">Project Description</label>
                <textarea
                  rows={3}
                  placeholder="Briefly describe the website goals and architecture..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-2.5 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent resize-none"
                />
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-border bg-subtle flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewProjectOpen(false)}
                className="h-9 px-3 rounded-md border border-border bg-surface hover:bg-hover text-xs font-medium text-fg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors"
              >
                Create project
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
