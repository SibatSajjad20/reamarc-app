import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutGrid,
  CheckSquare,
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
  X,
  Briefcase,
} from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { StatusPill } from '../ui/StatusPill';
import { SegmentedControl } from '../ui/SegmentedControl';
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

// Canonical 9 Pipeline Stages as originally specified
export interface PipelineStageConfig {
  id: PipelineStageId;
  step: number;
  label: string;
  name: string;
  shortLabel: string;
  color?: string;
}

export type PipelineStageId =
  | 'strategy'
  | 'content'
  | 'design'
  | 'assets'
  | 'development'
  | 'qa'
  | 'client_review'
  | 'production'
  | 'completed';

export const PIPELINE_STAGES: PipelineStageConfig[] = [
  { id: 'strategy', step: 1, label: '1. Strategy', name: '1. Strategy', shortLabel: 'Strategy', color: 'bg-emerald-500' },
  { id: 'content', step: 2, label: '2. Content', name: '2. Content', shortLabel: 'Content', color: 'bg-blue-500' },
  { id: 'design', step: 3, label: '3. Design', name: '3. Design', shortLabel: 'Design', color: 'bg-purple-500' },
  { id: 'assets', step: 4, label: '4. Creative Assets', name: '4. Creative Assets', shortLabel: 'Creative Assets', color: 'bg-pink-500' },
  { id: 'development', step: 5, label: '5. Development', name: '5. Development', shortLabel: 'Development', color: 'bg-cyan-500' },
  { id: 'qa', step: 6, label: '6. Internal QA', name: '6. Internal QA', shortLabel: 'Internal QA', color: 'bg-amber-500' },
  { id: 'client_review', step: 7, label: '7. Client Review', name: '7. Client Review', shortLabel: 'Client Review', color: 'bg-indigo-500' },
  { id: 'production', step: 8, label: '8. Production', name: '8. Production', shortLabel: 'Production', color: 'bg-rose-500' },
  { id: 'completed', step: 9, label: 'Completed', name: 'Completed', shortLabel: 'Completed', color: 'bg-emerald-600' },
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

export const INITIAL_PROJECTS: ProposedProject[] = [
  {
    id: 'proj-7',
    initials: 'KM',
    name: 'Dealer website',
    client: 'Kinetic Motors',
    stageId: 'strategy',
    stageStep: 1,
    stageName: '1. Strategy',
    progress: 15,
    nextMilestone: 'Sitemap architecture & kickoff',
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
    id: 'proj-6',
    initials: 'PE',
    name: 'Admissions site',
    client: 'Pinecrest Academy',
    stageId: 'strategy',
    stageStep: 1,
    stageName: '1. Strategy',
    progress: 25,
    nextMilestone: 'Sitemap & wireframe sign-off',
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
    id: 'proj-10',
    initials: 'AA',
    name: 'Fitness portal revamp',
    client: 'Apex Athletics',
    stageId: 'content',
    stageStep: 2,
    stageName: '2. Content',
    progress: 35,
    nextMilestone: 'Brand messaging & copy sign-off',
    leadInitials: 'AR',
    leadName: 'Ahmed Raza',
    due: 'Nov 12',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'High-energy brand messaging and athletic community copy review across training program landing pages.',
    deliverables: ['Hero messaging brief', 'Membership tier copy doc', 'SEO metadata schema', 'Tone of voice guidelines'],
    techStack: ['Contentful', 'Next.js', 'Tailwind CSS'],
  },
  {
    id: 'proj-5',
    initials: 'LR',
    name: 'Listings portal',
    client: 'Lumen Realty',
    stageId: 'design',
    stageStep: 3,
    stageName: '3. Design',
    progress: 45,
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
    id: 'proj-11',
    initials: 'AB',
    name: 'Cosmetics brand showcase',
    client: 'Aura Beauty',
    stageId: 'assets',
    stageStep: 4,
    stageName: '4. Creative Assets',
    progress: 52,
    nextMilestone: '3D renders & video b-roll handover',
    leadInitials: 'BH',
    leadName: 'Bilal Hassan',
    due: 'Nov 05',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'Custom 3D skincare bottle renders, photorealistic macro textures, and looping video b-roll for product pages.',
    deliverables: ['3D bottle models', 'Product texture render pack', 'Hero banner animations', 'Iconography set'],
    techStack: ['Blender', 'Figma', 'After Effects'],
  },
  {
    id: 'proj-1',
    initials: 'ND',
    name: 'Website revamp',
    client: 'Northwind Dental',
    stageId: 'development',
    stageStep: 5,
    stageName: '5. Development',
    progress: 65,
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
    id: 'proj-4',
    initials: 'BS',
    name: 'Campaign landing pages',
    client: 'Bloom Skincare',
    stageId: 'development',
    stageStep: 5,
    stageName: '5. Development',
    progress: 58,
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
    id: 'proj-8',
    initials: 'CF',
    name: 'Recipe hub',
    client: 'Crescent Foods',
    stageId: 'development',
    stageStep: 5,
    stageName: '5. Development',
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
    id: 'proj-3',
    initials: 'HC',
    name: 'Room booking site',
    client: 'Harbor & Co.',
    stageId: 'qa',
    stageStep: 6,
    stageName: '6. Internal QA',
    progress: 82,
    nextMilestone: 'Cross-browser & booking flow audit',
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
    id: 'proj-12',
    initials: 'NC',
    name: 'Enterprise Cloud Portal',
    client: 'Nexus Cloud',
    stageId: 'client_review',
    stageStep: 7,
    stageName: '7. Client Review',
    progress: 88,
    nextMilestone: 'Staging walkthrough with client',
    leadInitials: 'AR',
    leadName: 'Ahmed Raza',
    due: 'Oct 25',
    health: 'on_track',
    healthLabel: 'On track',
    category: 'active',
    description: 'Cloud infrastructure dashboard marketing site with interactive pricing calculator and live customer case studies.',
    deliverables: ['Staging deployment', 'Security audit sign-off', 'User acceptance test report', 'Client feedback tracker'],
    techStack: ['Next.js', 'PostgreSQL', 'Tailwind CSS', 'Vercel'],
    stagingUrl: 'https://staging.nexuscloud.io',
  },
  {
    id: 'proj-2',
    initials: 'VO',
    name: 'Shopify store',
    client: 'Verde Organics',
    stageId: 'production',
    stageStep: 8,
    stageName: '8. Production',
    progress: 96,
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
    id: 'proj-9',
    initials: 'SL',
    name: 'Menu & reservations',
    client: 'Saffron Lane',
    stageId: 'completed',
    stageStep: 9,
    stageName: 'Completed',
    progress: 100,
    nextMilestone: 'Monthly care plan active',
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

// Tasks Pipeline Definitions
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'completed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskKind = 'task' | 'revision' | 'bug';

export interface ProposedTask {
  id: string;
  projectId: string;
  projectName: string;
  projectInitials: string;
  name: string;
  stageName: string;
  assigneeName: string;
  assigneeInitials: string;
  dueDate: string;
  isOverdue?: boolean;
  status: TaskStatus;
  priority: TaskPriority;
  kind: TaskKind;
  description?: string;
}

export const TASK_COLUMNS: { id: TaskStatus; title: string; dotColor: string }[] = [
  { id: 'todo', title: 'To Do', dotColor: 'bg-fg-muted' },
  { id: 'in_progress', title: 'In Progress', dotColor: 'bg-accent' },
  { id: 'review', title: 'In Review', dotColor: 'bg-amber-500' },
  { id: 'completed', title: 'Completed', dotColor: 'bg-emerald-500' },
];

export const INITIAL_TASKS: ProposedTask[] = [
  {
    id: 'task-1',
    projectId: 'proj-1',
    projectName: 'Website revamp',
    projectInitials: 'ND',
    name: 'Custom appointment booking flow development',
    stageName: '5. Development',
    assigneeName: 'Ali Malik',
    assigneeInitials: 'AM',
    dueDate: 'Oct 20',
    status: 'in_progress',
    priority: 'high',
    kind: 'task',
    description: 'Build interactive calendar and timeslot reservation step with Sanity CMS webhook.',
  },
  {
    id: 'task-2',
    projectId: 'proj-1',
    projectName: 'Website revamp',
    projectInitials: 'ND',
    name: 'Patient intake form mobile styling & validation',
    stageName: '5. Development',
    assigneeName: 'Ali Malik',
    assigneeInitials: 'AM',
    dueDate: 'Oct 24',
    status: 'todo',
    priority: 'medium',
    kind: 'task',
    description: 'Ensure all required intake fields render smoothly on iOS and Android devices.',
  },
  {
    id: 'task-3',
    projectId: 'proj-2',
    projectName: 'Shopify store',
    projectInitials: 'VO',
    name: 'DNS switch & production SSL verification',
    stageName: '8. Production',
    assigneeName: 'Bilal Hassan',
    assigneeInitials: 'BH',
    dueDate: 'Oct 12',
    status: 'review',
    priority: 'urgent',
    kind: 'task',
    description: 'Verify Cloudflare A records and CNAME pointers ahead of the Oct 12 public cutover.',
  },
  {
    id: 'task-4',
    projectId: 'proj-2',
    projectName: 'Shopify store',
    projectInitials: 'VO',
    name: 'Recharge subscription checkout testing',
    stageName: '8. Production',
    assigneeName: 'Bilal Hassan',
    assigneeInitials: 'BH',
    dueDate: 'Oct 10',
    status: 'completed',
    priority: 'high',
    kind: 'task',
    description: 'Live test card transactions across monthly recurring wellness plan tiers.',
  },
  {
    id: 'task-5',
    projectId: 'proj-3',
    projectName: 'Room booking site',
    projectInitials: 'HC',
    name: 'Multi-currency checkout conversion rate fix',
    stageName: '6. Internal QA',
    assigneeName: 'Ali Malik',
    assigneeInitials: 'AM',
    dueDate: 'Oct 16',
    isOverdue: true,
    status: 'in_progress',
    priority: 'urgent',
    kind: 'bug',
    description: 'Stripe webhook occasionally returned EUR amounts instead of GBP on dynamic pricing quotes.',
  },
  {
    id: 'task-6',
    projectId: 'proj-4',
    projectName: 'Campaign landing pages',
    projectInitials: 'BS',
    name: 'Interactive quiz routine recommendation logic',
    stageName: '5. Development',
    assigneeName: 'Bilal Hassan',
    assigneeInitials: 'BH',
    dueDate: 'Oct 22',
    status: 'in_progress',
    priority: 'medium',
    kind: 'task',
    description: 'Hook quiz choices into the Shopify Storefront cart creation bundle link.',
  },
  {
    id: 'task-7',
    projectId: 'proj-5',
    projectName: 'Listings portal',
    projectInitials: 'LR',
    name: 'Figma design system components revision',
    stageName: '3. Design',
    assigneeName: 'Ali Malik',
    assigneeInitials: 'AM',
    dueDate: 'Nov 15',
    status: 'review',
    priority: 'medium',
    kind: 'revision',
    description: 'Client requested larger neighborhood statistic cards with high contrast map pins.',
  },
  {
    id: 'task-8',
    projectId: 'proj-6',
    projectName: 'Admissions site',
    projectInitials: 'PE',
    name: 'Admissions application form wireframe deck',
    stageName: '1. Strategy',
    assigneeName: 'Bilal Hassan',
    assigneeInitials: 'BH',
    dueDate: 'Nov 28',
    status: 'todo',
    priority: 'low',
    kind: 'task',
    description: 'Multi-step student application wireframes including tuition deposit calculator.',
  },
  {
    id: 'task-9',
    projectId: 'proj-7',
    projectName: 'Dealer website',
    projectInitials: 'KM',
    name: 'Competitor benchmark & technical scope brief',
    stageName: '1. Strategy',
    assigneeName: 'Ali Malik',
    assigneeInitials: 'AM',
    dueDate: 'Oct 13',
    status: 'todo',
    priority: 'high',
    kind: 'task',
    description: 'Benchmark top 5 EV dealerships across inventory filtering and trade-in calculators.',
  },
  {
    id: 'task-10',
    projectId: 'proj-8',
    projectName: 'Recipe hub',
    projectInitials: 'CF',
    name: 'Instacart grocery delivery API integration',
    stageName: '5. Development',
    assigneeName: 'Ahmed Raza',
    assigneeInitials: 'AR',
    dueDate: 'Oct 15',
    isOverdue: true,
    status: 'todo',
    priority: 'urgent',
    kind: 'bug',
    description: 'Vendor API token expired in staging sandbox; need refresh credentials from client.',
  },
  {
    id: 'task-11',
    projectId: 'proj-9',
    projectName: 'Menu & reservations',
    projectInitials: 'SL',
    name: 'DNS record transfer & Cloudflare Pages handover',
    stageName: 'Completed',
    assigneeName: 'Bilal Hassan',
    assigneeInitials: 'BH',
    dueDate: 'Oct 5',
    status: 'completed',
    priority: 'low',
    kind: 'task',
    description: 'Complete documentation for restaurant manager to update daily seasonal menu items.',
  },
  {
    id: 'task-12',
    projectId: 'proj-10',
    projectName: 'Fitness portal revamp',
    projectInitials: 'AA',
    name: 'Hero copy & membership value proposition review',
    stageName: '2. Content',
    assigneeName: 'Ahmed Raza',
    assigneeInitials: 'AR',
    dueDate: 'Nov 10',
    status: 'in_progress',
    priority: 'medium',
    kind: 'task',
    description: 'Draft conversion-focused hero headlines and tier benefits for client review.',
  },
  {
    id: 'task-13',
    projectId: 'proj-11',
    projectName: 'Cosmetics brand showcase',
    projectInitials: 'AB',
    name: '3D bottle hero renders and textures pack',
    stageName: '4. Creative Assets',
    assigneeName: 'Bilal Hassan',
    assigneeInitials: 'BH',
    dueDate: 'Nov 04',
    status: 'review',
    priority: 'high',
    kind: 'task',
    description: 'Export 4K transparent PNG passes and looping WebM videos for hero section.',
  },
  {
    id: 'task-14',
    projectId: 'proj-12',
    projectName: 'Enterprise Cloud Portal',
    projectInitials: 'NC',
    name: 'Client staging demo & walkthrough sign-off',
    stageName: '7. Client Review',
    assigneeName: 'Ahmed Raza',
    assigneeInitials: 'AR',
    dueDate: 'Oct 25',
    status: 'todo',
    priority: 'urgent',
    kind: 'task',
    description: 'Prepare staging environment and guide client team through approval checklist.',
  },
];

export interface WebsitePipelineViewProps {
  workspaces?: Workspace[];
  activeSection?: 'board' | 'tasks' | 'table';
  onSectionChange?: (section: 'board' | 'tasks' | 'table') => void;
}

export const WebsitePipelineView: React.FC<WebsitePipelineViewProps> = ({
  activeSection = 'board',
  onSectionChange,
}) => {
  const { addToast } = useToast();

  // In-memory project & tasks state
  const [projects, setProjects] = useState<ProposedProject[]>(INITIAL_PROJECTS);
  const [tasks, setTasks] = useState<ProposedTask[]>(INITIAL_TASKS);

  // Sync viewMode with activeSection prop from Sidebar & TopBar
  const [viewMode, setViewMode] = useState<'board' | 'tasks' | 'table'>(() => {
    if (activeSection === 'tasks' || activeSection === 'table' || activeSection === 'board') {
      return activeSection;
    }
    return 'board';
  });

  useEffect(() => {
    if (activeSection && (activeSection === 'board' || activeSection === 'tasks' || activeSection === 'table')) {
      setViewMode(activeSection);
    }
  }, [activeSection]);

  const handleSwitchViewMode = (mode: 'board' | 'tasks' | 'table') => {
    setViewMode(mode);
    onSectionChange?.(mode);
  };

  // Filters for Projects
  const [categoryFilter, setCategoryFilter] = useState<StatusCategory>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<PipelineStageId | 'all'>('all');
  const [leadFilter, setLeadFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<HealthStatus | 'all'>('all');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Filters for Tasks
  const [taskProjectFilter, setTaskProjectFilter] = useState<string>('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('all');

  // Selected row checkboxes (for Table)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Selected project for Sheet Drawer
  const [selectedProject, setSelectedProject] = useState<ProposedProject | null>(null);

  // Selected task for Sheet Drawer
  const [selectedTask, setSelectedTask] = useState<ProposedTask | null>(null);

  // Drag-and-drop state
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [overStageId, setOverStageId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [overStatusId, setOverStatusId] = useState<TaskStatus | null>(null);

  // New Project Dialog state
  const [isNewProjectOpen, setIsNewProjectOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newStage, setNewStage] = useState<PipelineStageId>('strategy');
  const [newLead, setNewLead] = useState('AM');
  const [newDue, setNewDue] = useState('Nov 30');
  const [newDescription, setNewDescription] = useState('');

  // New Task Dialog state
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskProject, setNewTaskProject] = useState('proj-1');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [newTaskKind, setNewTaskKind] = useState<TaskKind>('task');
  const [newTaskAssignee, setNewTaskAssignee] = useState('AM');
  const [newTaskDue, setNewTaskDue] = useState('Oct 30');
  const [newTaskDesc, setNewTaskDesc] = useState('');

  // Tab counts for projects
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

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (taskProjectFilter !== 'all' && t.projectId !== taskProjectFilter) return false;
      if (taskPriorityFilter !== 'all' && t.priority !== taskPriorityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          t.name.toLowerCase().includes(q) ||
          t.projectName.toLowerCase().includes(q) ||
          t.assigneeName.toLowerCase().includes(q) ||
          t.stageName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [tasks, taskProjectFilter, taskPriorityFilter, searchQuery]);

  // Checkbox handlers for Table view
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

  // Move project stage (via drag or Sheet)
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
            progress: Math.min(100, Math.round((stageConf.step / 9) * 100)),
            category: newStageId === 'completed' ? 'live' : 'active',
            health: newStageId === 'completed' ? 'live' : p.health,
            healthLabel: newStageId === 'completed' ? 'Live' : p.healthLabel,
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

  // Move task status (via drag or modal)
  const handleMoveTaskStatus = (taskId: string, newStatus: TaskStatus) => {
    const statusCol = TASK_COLUMNS.find((c) => c.id === newStatus);
    if (!statusCol) return;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const updated: ProposedTask = { ...t, status: newStatus };
          if (selectedTask?.id === taskId) {
            setSelectedTask(updated);
          }
          return updated;
        }
        return t;
      })
    );
    addToast('Task Updated', `Moved task to ${statusCol.title}`, 'success');
  };

  // Create new project
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newClient.trim()) return;

    const stageConf = PIPELINE_STAGES.find((s) => s.id === newStage) || PIPELINE_STAGES[0];
    const initials =
      newClient
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
      progress: Math.round((stageConf.step / 9) * 100),
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

  // Create new task
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    const p = projects.find((proj) => proj.id === newTaskProject) || projects[0];
    const newTask: ProposedTask = {
      id: `task-${Date.now()}`,
      projectId: p.id,
      projectName: p.name,
      projectInitials: p.initials,
      name: newTaskName.trim(),
      stageName: p.stageName,
      assigneeName: newTaskAssignee === 'AM' ? 'Ali Malik' : newTaskAssignee === 'BH' ? 'Bilal Hassan' : 'Ahmed Raza',
      assigneeInitials: newTaskAssignee,
      dueDate: newTaskDue.trim() || 'TBD',
      status: newTaskStatus,
      priority: newTaskPriority,
      kind: newTaskKind,
      description: newTaskDesc.trim() || undefined,
    };

    setTasks((prev) => [newTask, ...prev]);
    setIsNewTaskOpen(false);
    setNewTaskName('');
    setNewTaskDesc('');
    addToast('Task Created', `Added "${newTask.name}" to task pipeline`, 'success');
  };

  // Export CSV
  const handleExportCsv = () => {
    if (viewMode === 'tasks') {
      const headers = ['Task', 'Project', 'Status', 'Priority', 'Kind', 'Assignee', 'Due Date'];
      const rows = filteredTasks.map((t) => [
        `"${t.name}"`,
        `"${t.projectName}"`,
        `"${t.status}"`,
        `"${t.priority}"`,
        `"${t.kind}"`,
        `"${t.assigneeName} (${t.assigneeInitials})"`,
        `"${t.dueDate}"`,
      ]);
      const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `tasks_pipeline_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('Export Complete', 'Exported tasks pipeline to CSV', 'success');
      return;
    }

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
    <div className="flex-1 flex flex-col h-full min-w-0 bg-canvas overflow-hidden">
      {/* 1. Header (Fixed at top, identical to Sales Pipeline & Content Calendar) */}
      <div className="px-5 py-3 border-b border-border bg-surface shrink-0">
        <PageHeader
          title={
            <div className="flex items-center gap-2.5">
              <span>
                {viewMode === 'tasks'
                  ? 'Tasks pipeline'
                  : viewMode === 'table'
                  ? 'Website projects'
                  : 'Website pipeline'}
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-subtle text-fg-muted border border-border font-numeric">
                {viewMode === 'tasks'
                  ? filteredTasks.length
                  : categoryFilter === 'active'
                  ? tabCounts.active
                  : categoryFilter === 'live'
                  ? tabCounts.live
                  : tabCounts.archived}
              </span>
            </div>
          }
          description={
            viewMode === 'tasks'
              ? 'Production tasks, revisions, and QA across active website builds.'
              : viewMode === 'table'
              ? 'Detailed tabular view of website projects and milestones.'
              : 'Website builds by stage, from strategy and content through development, QA, client review, and production.'
          }
          actions={
            <div className="flex items-center gap-2">
              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="h-9 px-3 rounded-md border border-border hover:border-border-strong bg-surface hover:bg-hover text-xs font-medium text-fg transition-colors flex items-center gap-1.5 cursor-pointer select-none"
              >
                <Download className="w-3.5 h-3.5 text-fg-muted" />
                <span>Export</span>
              </button>

              {/* Primary Action Button */}
              {viewMode === 'tasks' ? (
                <button
                  type="button"
                  onClick={() => setIsNewTaskOpen(true)}
                  className="h-9 px-3.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer select-none shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New task</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsNewProjectOpen(true)}
                  className="h-9 px-3.5 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer select-none shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New project</span>
                </button>
              )}
            </div>
          }
        />
      </div>

      {/* 2. Filters Toolbar (Fixed below header, identical to Sales Pipeline) */}
      <div className="px-5 py-2.5 border-b border-border bg-canvas/50 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: Search + Category Tabs + Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Search Input */}
          <div className="relative min-w-[180px] max-w-[240px] flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-faint" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={viewMode === 'tasks' ? 'Search tasks...' : 'Search projects...'}
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

          {viewMode !== 'tasks' ? (
            <>
              {/* Category Segmented Control: Active · Live · Archived */}
              <SegmentedControl
                size="sm"
                value={categoryFilter}
                onValueChange={(val) => setCategoryFilter(val as StatusCategory)}
                options={[
                  { value: 'active', label: 'Active', count: tabCounts.active },
                  { value: 'live', label: 'Live', count: tabCounts.live },
                  { value: 'archived', label: 'Archived', count: tabCounts.archived },
                ]}
              />

              {/* Stage filter dropdown */}
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value as any)}
                className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg hover:border-border-strong transition-colors cursor-pointer select-none"
              >
                <option value="all">All stages</option>
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
                <option value="all">Anyone</option>
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
                <option value="all">All health</option>
                <option value="on_track">On track</option>
                <option value="at_risk">At risk</option>
                <option value="overdue">Overdue</option>
                <option value="not_started">Not started</option>
                <option value="live">Live</option>
              </select>

              {/* Due date sort action */}
              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                className="h-8 px-2.5 rounded-md border border-border hover:border-border-strong bg-surface hover:bg-hover text-xs font-medium text-fg-muted hover:text-fg transition-colors flex items-center gap-1.5 cursor-pointer select-none"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Due date</span>
              </button>
            </>
          ) : (
            <>
              {/* Task Project filter */}
              <select
                value={taskProjectFilter}
                onChange={(e) => setTaskProjectFilter(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg hover:border-border-strong transition-colors cursor-pointer select-none"
              >
                <option value="all">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {/* Task Priority filter */}
              <select
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value)}
                className="h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg hover:border-border-strong transition-colors cursor-pointer select-none"
              >
                <option value="all">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </>
          )}
        </div>

        {/* Right: View Mode Switcher (Website pipeline | Tasks pipeline | Table view) */}
        <SegmentedControl
          value={viewMode}
          onValueChange={(val) => handleSwitchViewMode(val as any)}
          size="sm"
          options={[
            { value: 'board', label: 'Website pipeline', icon: LayoutGrid },
            { value: 'tasks', label: 'Tasks pipeline', icon: CheckSquare },
            { value: 'table', label: 'Table view', icon: ListIcon },
          ]}
        />
      </div>

      {/* 3. Main Content: Fills remaining viewport height with full-height stage columns */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {viewMode === 'board' && (
          /* KANBAN BOARD VIEW (Matching Leads Board & Content Calendar) */
          <div className="flex-1 min-h-0 flex flex-col p-4 pt-3 select-none overflow-x-auto overflow-y-hidden custom-scrollbar">
            <div className="h-full flex gap-3 min-w-min pb-2 items-stretch">
              {PIPELINE_STAGES.map((stage) => {
                const stageProjects = filteredProjects.filter((p) => p.stageId === stage.id);
                const isOver = overStageId === stage.id;

                return (
                  <div
                    key={stage.id}
                    className="w-72 min-w-[288px] max-w-[288px] flex-shrink-0 flex flex-col bg-surface border border-border rounded-lg overflow-hidden h-full min-h-0 select-none"
                  >
                    {/* Column Header */}
                    <div className="p-3 border-b border-border flex items-center justify-between shrink-0 bg-surface">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('w-2 h-2 rounded-full shrink-0', stage.color || 'bg-accent')} />
                        <span className="text-xs font-semibold text-fg truncate" title={stage.name}>
                          {stage.name}
                        </span>
                      </div>
                      <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border/50">
                        {stageProjects.length}
                      </span>
                    </div>

                    {/* Column Body with internal scrolling */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overStageId !== stage.id) setOverStageId(stage.id);
                      }}
                      onDragLeave={() => setOverStageId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setOverStageId(null);
                        const pid = e.dataTransfer.getData('text/plain') || draggingProjectId;
                        if (pid) handleMoveStage(pid, stage.id);
                      }}
                      className={cn(
                        'bg-subtle p-2.5 flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar transition-colors',
                        isOver && 'bg-accent-soft/30 outline-2 outline-dashed outline-accent'
                      )}
                    >
                      {stageProjects.map((p) => (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', p.id);
                            setDraggingProjectId(p.id);
                          }}
                          onDragEnd={() => {
                            setDraggingProjectId(null);
                            setOverStageId(null);
                          }}
                          onClick={() => setSelectedProject(p)}
                          className={cn(
                            'group relative rounded-lg border border-border bg-surface p-3 transition-all cursor-grab active:cursor-grabbing select-none space-y-2 hover:border-border-strong hover:shadow-xs',
                            draggingProjectId === p.id && 'opacity-40 shadow-md'
                          )}
                        >
                          {/* Top: Initials avatar + Title + Client */}
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-md bg-subtle border border-border text-fg font-semibold text-xs flex items-center justify-center shrink-0">
                              {p.initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-semibold text-fg text-xs line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                                {p.name}
                              </h3>
                              <p className="text-micro text-fg-muted truncate mt-0.5">
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
                                className="h-full bg-accent rounded-full transition-all"
                                style={{ width: `${p.progress}%` }}
                              />
                            </div>
                          </div>

                          {/* Next milestone */}
                          <div className="text-micro text-fg-muted truncate flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-fg-faint shrink-0" />
                            <span className="truncate">{p.nextMilestone}</span>
                          </div>

                          {/* Footer: Due date + Lead avatar + Health StatusPill */}
                          <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-border/50 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div
                                className="w-5 h-5 rounded-full bg-subtle border border-border text-[9px] font-medium text-fg flex items-center justify-center shrink-0"
                                title={p.leadName}
                              >
                                {p.leadInitials}
                              </div>
                              <span
                                className={cn(
                                  'font-mono text-[10px] truncate',
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
                              className="shrink-0"
                            />
                          </div>
                        </div>
                      ))}

                      {stageProjects.length === 0 && (
                        <div className="h-28 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-fg-muted font-medium select-none">
                          Nothing in this stage
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'tasks' && (
          /* TASKS PIPELINE VIEW (Matching CRM & Content Calendar column structure) */
          <div className="flex-1 min-h-0 flex flex-col p-4 pt-3 select-none overflow-x-auto overflow-y-hidden custom-scrollbar">
            <div className="h-full flex gap-3 min-w-min pb-2 items-stretch">
              {TASK_COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter((t) => t.status === col.id);
                const isOver = overStatusId === col.id;

                return (
                  <div
                    key={col.id}
                    className="w-72 min-w-[288px] max-w-[288px] flex-shrink-0 flex flex-col bg-surface border border-border rounded-lg overflow-hidden h-full min-h-0 select-none"
                  >
                    {/* Column Header */}
                    <div className="p-3 border-b border-border flex items-center justify-between shrink-0 bg-surface">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotColor}`} />
                        <span className="text-xs font-semibold text-fg truncate">
                          {col.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-border/50">
                          {colTasks.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setNewTaskStatus(col.id);
                            setIsNewTaskOpen(true);
                          }}
                          className="p-1 rounded text-fg-muted hover:text-fg hover:bg-hover transition cursor-pointer"
                          title={`Add task to ${col.title}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Column Body with internal scrolling */}
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overStatusId !== col.id) setOverStatusId(col.id);
                      }}
                      onDragLeave={() => setOverStatusId(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setOverStatusId(null);
                        const tid = e.dataTransfer.getData('text/plain') || draggingTaskId;
                        if (tid) handleMoveTaskStatus(tid, col.id);
                      }}
                      className={cn(
                        'bg-subtle p-2.5 flex flex-col gap-2.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar transition-colors',
                        isOver && 'bg-accent-soft/30 outline-2 outline-dashed outline-accent'
                      )}
                    >
                      {colTasks.map((t) => (
                        <div
                          key={t.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', t.id);
                            setDraggingTaskId(t.id);
                          }}
                          onDragEnd={() => {
                            setDraggingTaskId(null);
                            setOverStatusId(null);
                          }}
                          onClick={() => setSelectedTask(t)}
                          className={cn(
                            'group relative rounded-lg border border-border bg-surface p-3 transition-all cursor-grab active:cursor-grabbing select-none space-y-2 hover:border-border-strong hover:shadow-xs',
                            draggingTaskId === t.id && 'opacity-40 shadow-md'
                          )}
                        >
                          {/* Top: Project pill & Kind */}
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted bg-subtle px-1.5 py-0.5 rounded border border-border truncate max-w-[170px]">
                              <Briefcase className="w-3 h-3 text-fg-faint shrink-0" />
                              <span className="truncate">{t.projectName}</span>
                            </span>

                            <span
                              className={cn(
                                'text-[10px] font-medium px-1.5 py-0.5 rounded capitalize shrink-0',
                                t.kind === 'bug'
                                  ? 'bg-danger-subtle text-danger-fg'
                                  : t.kind === 'revision'
                                  ? 'bg-accent-soft text-accent'
                                  : 'bg-subtle text-fg-muted'
                              )}
                            >
                              {t.kind === 'bug' ? 'Bug fix' : t.kind}
                            </span>
                          </div>

                          {/* Task Name */}
                          <h4 className="font-semibold text-fg text-xs line-clamp-2 leading-snug group-hover:text-accent transition-colors">
                            {t.name}
                          </h4>

                          {/* Stage subtitle */}
                          {t.stageName && (
                            <p className="text-[10px] text-fg-muted truncate">
                              {t.stageName}
                            </p>
                          )}

                          {/* Footer: Priority + Assignee & Due Date */}
                          <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-border/50 text-xs">
                            <span
                              className={cn(
                                'text-[10px] font-medium px-1.5 py-0.2 rounded uppercase tracking-wider',
                                t.priority === 'urgent'
                                  ? 'bg-danger-subtle text-danger-fg'
                                  : t.priority === 'high'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : t.priority === 'medium'
                                  ? 'bg-accent-soft text-accent'
                                  : 'bg-subtle text-fg-muted'
                              )}
                            >
                              {t.priority}
                            </span>

                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={cn(
                                  'font-mono text-[10px] truncate',
                                  t.isOverdue ? 'text-danger-fg font-semibold' : 'text-fg-muted'
                                )}
                              >
                                {t.dueDate}
                              </span>
                              <div
                                className="w-5 h-5 rounded-full bg-subtle border border-border text-[9px] font-medium text-fg flex items-center justify-center shrink-0"
                                title={t.assigneeName}
                              >
                                {t.assigneeInitials}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {colTasks.length === 0 && (
                        <div className="h-28 rounded-md border border-dashed border-border flex items-center justify-center text-xs text-fg-muted font-medium select-none">
                          No tasks
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'table' && (
          /* TABLE VIEW */
          <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden">
            <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs flex-1 flex flex-col">
              <div className="overflow-auto flex-1 custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="sticky top-0 z-10 bg-subtle text-fg-muted font-medium select-none border-b border-border">
                    <tr>
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

                            {/* Project avatar + title + client */}
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

                            {/* Stage + 9-segment indicator */}
                            <td className="py-3 px-3">
                              <div>
                                <span className="font-medium text-fg text-xs">{p.stageName}</span>
                                <div className="flex items-center gap-1 mt-1.5">
                                  {PIPELINE_STAGES.map((s) => {
                                    const isFilled = s.step <= p.stageStep;
                                    return (
                                      <div
                                        key={s.step}
                                        className={cn(
                                          'w-2.5 h-1 rounded-full transition-colors',
                                          isFilled ? 'bg-accent' : 'bg-border'
                                        )}
                                        title={s.name}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            </td>

                            {/* Progress bar + percentage */}
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

                            {/* Lead */}
                            <td className="py-3 px-3 text-center">
                              <div
                                className="w-6 h-6 rounded-full bg-subtle border border-border text-[10px] font-medium text-fg flex items-center justify-center mx-auto"
                                title={p.leadName}
                              >
                                {p.leadInitials}
                              </div>
                            </td>

                            {/* Due date */}
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

                            {/* Health pill */}
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
          </div>
        )}
      </div>

      {/* PROJECT DETAIL SHEET (Drawer) */}
      <Sheet open={!!selectedProject} onOpenChange={(open) => !open && setSelectedProject(null)}>
        {selectedProject && (
          <SheetContent side="right" size="wide" showClose={false} className="w-full sm:max-w-[560px] p-0 flex flex-col">
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
                <div className="grid grid-cols-9 gap-1">
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
                  Stage {selectedProject.stageStep} of {PIPELINE_STAGES.length}: {selectedProject.stageName}
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

      {/* TASK DETAIL SHEET (Drawer) */}
      <Sheet open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        {selectedTask && (
          <SheetContent side="right" size="wide" showClose={false} className="w-full sm:max-w-[520px] p-0 flex flex-col">
            <SheetHeader className="p-5 border-b border-border bg-subtle flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-surface border border-border text-fg font-semibold text-sm flex items-center justify-center shrink-0">
                  {selectedTask.projectInitials}
                </div>
                <div className="min-w-0">
                  <SheetTitle className="text-sm font-semibold text-fg truncate">
                    {selectedTask.name}
                  </SheetTitle>
                  <SheetDescription className="text-xs text-fg-muted truncate">
                    {selectedTask.projectName} · {selectedTask.stageName}
                  </SheetDescription>
                </div>
              </div>
              <SheetClose className="w-7 h-7 rounded-md border border-border bg-surface text-fg-muted hover:text-fg flex items-center justify-center">
                <X className="w-4 h-4" />
              </SheetClose>
            </SheetHeader>

            <div className="p-5 overflow-y-auto space-y-5 flex-1 text-xs">
              {/* Status Update Selector */}
              <div className="space-y-1.5 p-3 rounded-lg border border-border bg-surface">
                <label className="text-xs font-medium text-fg-muted">Task Status</label>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTask.status}
                    onChange={(e) => handleMoveTaskStatus(selectedTask.id, e.target.value as TaskStatus)}
                    className="flex-1 h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    {TASK_COLUMNS.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Task Attributes */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-border bg-subtle">
                <div className="space-y-1">
                  <span className="text-xs text-fg-muted flex items-center gap-1">
                    <User className="w-3 h-3 text-fg-faint" />
                    Assignee
                  </span>
                  <div className="font-medium text-fg">
                    {selectedTask.assigneeName} ({selectedTask.assigneeInitials})
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-fg-muted flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-fg-faint" />
                    Due Date
                  </span>
                  <div
                    className={cn(
                      'font-medium font-mono',
                      selectedTask.isOverdue ? 'text-danger-fg font-semibold' : 'text-fg'
                    )}
                  >
                    {selectedTask.dueDate}
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-border/50">
                  <span className="text-xs text-fg-muted">Priority</span>
                  <div>
                    <span
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded uppercase tracking-wider',
                        selectedTask.priority === 'urgent'
                          ? 'bg-danger-subtle text-danger-fg'
                          : selectedTask.priority === 'high'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : selectedTask.priority === 'medium'
                          ? 'bg-accent-soft text-accent'
                          : 'bg-subtle text-fg-muted'
                      )}
                    >
                      {selectedTask.priority}
                    </span>
                  </div>
                </div>

                <div className="space-y-1 pt-2 border-t border-border/50">
                  <span className="text-xs text-fg-muted">Kind</span>
                  <div>
                    <span
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded capitalize',
                        selectedTask.kind === 'bug'
                          ? 'bg-danger-subtle text-danger-fg'
                          : selectedTask.kind === 'revision'
                          ? 'bg-accent-soft text-accent'
                          : 'bg-subtle text-fg-muted'
                      )}
                    >
                      {selectedTask.kind === 'bug' ? 'Bug fix' : selectedTask.kind}
                    </span>
                  </div>
                </div>
              </div>

              {/* Task Description */}
              {selectedTask.description && (
                <div className="space-y-1">
                  <h4 className="font-medium text-fg">Description</h4>
                  <p className="text-fg-muted leading-relaxed">{selectedTask.description}</p>
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

      {/* NEW TASK DIALOG (Modal) */}
      <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
        <DialogContent maxWidth="md" className="p-0 overflow-hidden">
          <form onSubmit={handleCreateTask}>
            <DialogHeader className="p-5 border-b border-border bg-subtle">
              <DialogTitle className="text-sm font-semibold text-fg">New production task</DialogTitle>
              <DialogDescription className="text-xs text-fg-muted">
                Create a task or revision item in the website task pipeline.
              </DialogDescription>
            </DialogHeader>

            <div className="p-5 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-fg">Task Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mobile responsive navigation styling"
                  value={newTaskName}
                  onChange={(e) => setNewTaskName(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-fg">Project</label>
                  <select
                    value={newTaskProject}
                    onChange={(e) => setNewTaskProject(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.client})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-fg">Initial Status</label>
                  <select
                    value={newTaskStatus}
                    onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    {TASK_COLUMNS.map((col) => (
                      <option key={col.id} value={col.id}>
                        {col.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-fg">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-fg">Kind</label>
                  <select
                    value={newTaskKind}
                    onChange={(e) => setNewTaskKind(e.target.value as TaskKind)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    <option value="task">Task</option>
                    <option value="revision">Revision</option>
                    <option value="bug">Bug Fix</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-fg">Assignee</label>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg focus:outline-hidden focus:ring-1 focus:ring-accent"
                  >
                    <option value="AM">Ali Malik (AM)</option>
                    <option value="BH">Bilal Hassan (BH)</option>
                    <option value="AR">Ahmed Raza (AR)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-fg">Target Due Date</label>
                <input
                  type="text"
                  placeholder="e.g. Oct 25"
                  value={newTaskDue}
                  onChange={(e) => setNewTaskDue(e.target.value)}
                  className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-fg">Description (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="Briefly describe the task requirements..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full p-2.5 rounded-md bg-surface border border-border text-fg placeholder:text-fg-faint focus:outline-hidden focus:ring-1 focus:ring-accent resize-none"
                />
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-border bg-subtle flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewTaskOpen(false)}
                className="h-9 px-3 rounded-md border border-border bg-surface hover:bg-hover text-xs font-medium text-fg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-colors"
              >
                Create task
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
