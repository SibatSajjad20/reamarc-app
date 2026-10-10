import React, { useState } from 'react';
import {
  Upload,
  Download,
  Plus,
  Settings2,
  Trash2,
  Search,
  User,
  Mail,
  Shield,
  Calendar,
  Info,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import {
  MetaIcon,
  FacebookIcon,
  InstagramIcon,
  GoogleIcon,
  GoogleAdsIcon,
  TikTokIcon,
  WhatsAppIcon,
  LinkedInIcon,
  WordPressIcon,
  ElementorIcon,
} from './brand-icons';
import { Button, IconButton } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Checkbox } from './checkbox';
import { RadioGroup, RadioCard } from './radio-group';
import { ToggleSwitch } from './ToggleSwitch';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import { CustomTimePicker } from './CustomTimePicker';
import { NumberStepper } from './NumberStepper';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
import { SegmentedControl } from './SegmentedControl';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from './tooltip';
import { Modal } from './Modal';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './sheet';
import { Badge, Tag } from './badge';
import { StatusPill } from './StatusPill';
import { HealthBadge, PriorityBadge } from './WorkspaceBadges';
import { Callout } from './Callout';
import { OffDayBanner } from './OffDayBanner';
import { Kbd } from './Kbd';
import { KpiCard } from './KpiCard';
import { PageHeader } from './PageHeader';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import {
  TableCard,
  TableToolbar,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
  TableFooter,
  SortHeader,
  RowActions,
} from './DataTable';
import {
  KanbanBoard,
  KanbanColumn,
  KanbanColumnHeader,
  KanbanColumnBody,
  KanbanCard,
  KanbanEmptyColumn,
  KanbanStatsStrip,
} from './Kanban';
import { DashboardSkeleton } from './Skeletons';
import { useConfirm, useAlert, usePrompt } from './ConfirmProvider';

export const PrimitivesGallery: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectVal, setSelectVal] = useState('active');
  const [dateVal, setDateVal] = useState('2026-10-12');
  const [timeVal, setTimeVal] = useState('09:30');
  const [stepperVal, setStepperVal] = useState(3);
  const [switchChecked, setSwitchChecked] = useState(true);
  const [radioVal, setRadioVal] = useState('member');
  const [segVal, setSegVal] = useState('pipeline');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const confirm = useConfirm();
  const alert = useAlert();
  const prompt = usePrompt();

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const handleTestConfirm = async () => {
    const res = await confirm({
      title: 'Delete this member?',
      description: "Their access will be immediately revoked. This action can't be undone.",
      tone: 'danger',
      confirmLabel: 'Delete member',
    });
    if (res) {
      await alert({ title: 'Member deleted', description: 'The member was successfully removed.' });
    }
  };

  const handleTestPrompt = async () => {
    const val = await prompt({
      title: 'Rename stage',
      label: 'Enter the new name for this pipeline stage',
      defaultValue: 'Qualified Lead',
    });
    if (val) {
      await alert({ title: 'Stage renamed', description: `Stage renamed to "${val}"` });
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-fg p-6 lg:p-10 space-y-12 max-w-[1440px] mx-auto font-sans">
      {/* Gallery Header */}
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div className="flex items-center gap-3">
          <BrandMark size={32} />
          <div>
            <h1 className="text-h1 font-semibold text-fg">Reamarc UI Primitives Gallery</h1>
            <p className="text-ui text-fg-muted">
              Phase 2 Verification · Design tokens, shared primitives, and Reamarc compositions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={toggleTheme}>
            Toggle Theme: {theme.toUpperCase()}
          </Button>
          <a
            href="/"
            className="text-ui font-medium text-accent hover:underline"
          >
            ← Back to App
          </a>
        </div>
      </div>

      {/* 0. Page Header Anatomy (§6.2) */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          0. Page Header Composition (§6.2)
        </h2>
        <div className="bg-surface p-6 rounded-lg border border-border">
          <PageHeader
            title="Content calendar"
            description="Plan, produce and approve client content across channels."
            actions={
              <>
                <Button variant="secondary" icon={Upload}>Import Excel</Button>
                <Button variant="secondary" icon={Download}>Export</Button>
                <IconButton label="Calendar settings" icon={Settings2} />
                <Button icon={Plus}>Add content</Button>
              </>
            }
          />
        </div>
      </section>

      {/* 1. Brand Mark & Platform Logos */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          1. Brand Mark & Monochrome Platform Icons (§7.4, §7.5)
        </h2>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <BrandMark size={24} />
            <BrandMark size={28} />
            <BrandMark size={32} />
            <BrandMark size={40} />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-caption text-fg-muted font-medium">Brand Colors</span>
            <div className="flex items-center gap-4 bg-surface p-3 rounded-lg border border-border">
              <MetaIcon size={16} variant="brand" />
              <FacebookIcon size={16} variant="brand" />
              <InstagramIcon size={16} variant="brand" />
              <GoogleIcon size={16} variant="brand" />
              <GoogleAdsIcon size={16} variant="brand" />
              <TikTokIcon size={16} variant="brand" />
              <WhatsAppIcon size={16} variant="brand" />
              <LinkedInIcon size={16} variant="brand" />
              <WordPressIcon size={16} variant="brand" />
              <ElementorIcon size={16} variant="brand" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-caption text-fg-muted font-medium">Monochrome</span>
            <div className="flex items-center gap-4 text-fg-muted bg-surface p-3 rounded-lg border border-border">
              <MetaIcon size={16} variant="mono" />
              <FacebookIcon size={16} variant="mono" />
              <InstagramIcon size={16} variant="mono" />
              <GoogleIcon size={16} variant="mono" />
              <GoogleAdsIcon size={16} variant="mono" />
              <TikTokIcon size={16} variant="mono" />
              <WhatsAppIcon size={16} variant="mono" />
              <LinkedInIcon size={16} variant="mono" />
              <WordPressIcon size={16} variant="mono" />
              <ElementorIcon size={16} variant="mono" />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Buttons & Icon Buttons */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          2. Buttons & Icon Buttons (§10.2, §10.3)
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary" icon={Upload}>Secondary with Icon</Button>
          <Button variant="ghost">Ghost Button</Button>
          <Button variant="soft">Soft Button</Button>
          <Button variant="destructive" icon={Trash2}>Destructive Button</Button>
          <Button variant="destructive-outline">Destructive Outline</Button>
          <Button variant="outline">Outline Button</Button>
          <Button variant="link">Link Button</Button>
          <Button loading>Loading State</Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <IconButton icon={Settings2} label="Settings" variant="secondary" />
          <IconButton icon={Download} label="Download" variant="ghost" />
          <IconButton icon={Trash2} label="Delete" variant="destructive" />
          <IconButton icon={Plus} label="Add item" variant="primary" />
        </div>
      </section>

      {/* 3. Form Controls & Inputs */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          3. Form Controls & Stepper (§10.4, §10.5, §10.10, §10.11)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <Input label="Text Input" placeholder="Search team members..." icon={Search} clearable />
            <Input label="Password Input" type="password" defaultValue="secret123" />
            <Textarea label="Notes / Description" placeholder="Enter activity details..." maxLength={200} showCount />
          </div>

          <div className="space-y-4">
            <CustomSelect
              label="Custom Select"
              value={selectVal}
              onChange={setSelectVal}
              options={[
                { value: 'active', label: 'Active Member', description: 'Full access' },
                { value: 'pending', label: 'Pending Invite', description: 'Invitation sent' },
                { value: 'suspended', label: 'Suspended', description: 'Access locked' },
              ]}
            />
            <CustomDatePicker
              label="Custom Date Picker"
              value={dateVal}
              onChange={setDateVal}
            />
            <CustomTimePicker
              label="Custom Time Picker"
              value={timeVal}
              onChange={setTimeVal}
              allowClear
            />
            <NumberStepper
              label="Number Stepper"
              value={stepperVal}
              onChange={setStepperVal}
              unit="hours"
            />
          </div>

          <div className="space-y-4 bg-surface p-4 rounded-lg border border-border">
            <h3 className="text-h3 font-semibold text-fg">Toggles & Checks</h3>
            <ToggleSwitch
              label="Automatic sync"
              description="Sync leads every 15 minutes"
              checked={switchChecked}
              onChange={setSwitchChecked}
            />
            <div className="pt-2 flex items-center gap-3">
              <Checkbox id="c1" defaultChecked />
              <label htmlFor="c1" className="text-ui text-fg cursor-pointer">
                Notify employee via WhatsApp
              </label>
            </div>
            <div className="pt-2">
              <RadioGroup value={radioVal} onValueChange={setRadioVal}>
                <RadioCard
                  value="member"
                  title="Team Member"
                  description="Standard daily logging and timesheet access"
                />
                <RadioCard
                  value="lead"
                  title="Team Lead"
                  description="Approvals and exception queue reviews"
                />
              </RadioGroup>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Navigation, Tabs & Segmented Control */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          4. Tabs & Segmented Control (§10.12, §10.13)
        </h2>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <SegmentedControl
              value={segVal}
              onValueChange={setSegVal}
              options={[
                { value: 'sheet', label: 'Sheet view' },
                { value: 'pipeline', label: 'Pipeline view', count: 24 },
                { value: 'calendar', label: 'Calendar view' },
              ]}
            />
            <SegmentedControl
              size="sm"
              defaultValue="7D"
              options={[
                { value: '7D', label: '7D' },
                { value: '14D', label: '14D' },
                { value: '30D', label: '30D' },
              ]}
            />
          </div>

          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all" count={42}>All exceptions</TabsTrigger>
              <TabsTrigger value="missing" count={5}>Missing logs</TabsTrigger>
              <TabsTrigger value="discrepancy" count={2}>Discrepancies</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
            </TabsList>
            <TabsContent value="all" className="p-4 bg-surface rounded-lg border border-border">
              All exceptions content pane
            </TabsContent>
            <TabsContent value="missing" className="p-4 bg-surface rounded-lg border border-border">
              Missing logs content pane
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* 5. Badges, Tags & Status Pills */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          5. Badges, Tags & Status Pills (§10.14)
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <StatusPill status="present" />
          <StatusPill status="late" />
          <StatusPill status="wfh" />
          <StatusPill status="absent" />
          <StatusPill status="approved" />
          <StatusPill status="pending" />
          <StatusPill status="rejected" />
          <StatusPill status="won" />
          <StatusPill status="lost" />
          <Tag>Engineering</Tag>
          <Tag>Operations</Tag>
          <Badge variant="attention">New update</Badge>
          <HealthBadge health="Emergency" />
          <HealthBadge health="Excellent" />
          <PriorityBadge priority="High" showSuffix />
          <Kbd>⌘K</Kbd>
          <Kbd>Esc</Kbd>
        </div>
      </section>

      {/* 6. Callouts & Banners */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          6. Callouts & Banners (§10.42)
        </h2>
        <div className="space-y-3">
          <Callout variant="info" title="Scheduled Maintenance">
            The platform will undergo brief maintenance on Sunday at 02:00 AM.
          </Callout>
          <Callout variant="warning" title="Missing Attendance Log">
            You have not checked in for today yet. Please record your punch before shift cutoff.
          </Callout>
          <Callout variant="danger" title="Unresolved Discrepancy">
            Shift discrepancy of 2h 15m requires manager explanation.
          </Callout>
          <OffDayBanner info={{ isOff: true, label: 'Pakistan Day Holiday' }} date="March 23" />
        </div>
      </section>

      {/* 7. Dialogs, Popovers, Confirm & Tooltips */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          7. Dialogs, Sheets, Popovers & Confirm Dialog (§10.26–§10.32)
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            Open Radix Modal
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Open Side Sheet</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Member Details</SheetTitle>
                <SheetDescription>Inspect and adjust team permissions.</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <p className="text-ui text-fg-2">Drawer content with key-value pairs.</p>
                <div className="grid grid-cols-[120px_1fr] gap-2 text-ui">
                  <span className="text-fg-muted">Role:</span>
                  <span className="font-medium text-fg">Operations Specialist</span>
                  <span className="text-fg-muted">Department:</span>
                  <span className="font-medium text-fg">Client Delivery</span>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Button variant="destructive-outline" onClick={handleTestConfirm}>
            Test Confirm Dialog
          </Button>

          <Button variant="secondary" onClick={handleTestPrompt}>
            Test Prompt Dialog
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">Dropdown Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>
                <User size={16} />
                <span>View Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Mail size={16} />
                <span>Send Email</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2 size={16} />
                <span>Delete Entry</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Hover for Tooltip</Button>
            </TooltipTrigger>
            <TooltipContent>Standard 12px neutral tooltip</TooltipContent>
          </Tooltip>
        </div>

        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Add Team Member"
          description="Create credentials and assign initial workspace role."
          maxWidth="md"
        >
          <div className="space-y-4">
            <Input label="Full Name" placeholder="e.g. Sarah Jenkins" />
            <Input label="Work Email" placeholder="sarah@reamarc.com" />
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setModalOpen(false)}>
                Create member
              </Button>
            </div>
          </div>
        </Modal>
      </section>

      {/* 8. KPI Cards with Sparkline */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          8. KPI Cards & Sparkline (§10.17, §10.18)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Active clients"
            value="38"
            icon={Shield}
            sparklineData={[30, 32, 33, 35, 36, 38]}
            delta="+2"
            deltaType="success"
            deltaContext="vs last month"
          />
          <KpiCard
            label="Punctuality score"
            value="94.2"
            unit="%"
            icon={Calendar}
            sparklineData={[88, 91, 89, 93, 92, 94.2]}
            delta="+1.4%"
            deltaType="success"
            deltaContext="vs 30-day average"
          />
          <KpiCard
            label="Pending reviews"
            value="7"
            icon={Mail}
            sparklineData={[12, 10, 9, 8, 7]}
            delta="-3"
            deltaType="success"
            deltaContext="queue reduced"
          />
          <KpiCard
            label="Hour discrepancies"
            value="2"
            icon={Info}
            sparklineData={[1, 0, 3, 2]}
            delta="+1"
            deltaType="danger"
            deltaContext="requires attention"
          />
        </div>
      </section>

      {/* 9. Data Table Presentational Compositions */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          9. DataTable (§10.21)
        </h2>
        <TableCard>
          <TableToolbar>
            <div className="flex items-center gap-2">
              <Input placeholder="Search records..." icon={Search} className="w-60" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" icon={Download}>Export</Button>
              <Button size="sm" icon={Plus}>Add row</Button>
            </div>
          </TableToolbar>

          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>
                  <SortHeader
                    label="Department"
                    direction={sortDir}
                    onSort={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
                  />
                </TH>
                <TH>Status</TH>
                <TH align="right">Logged Hours</TH>
                <TH align="right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              <TR clickable>
                <TD>
                  <div>
                    <div className="font-medium text-fg">Zainab Tariq</div>
                    <div className="text-small text-fg-muted">zainab@reamarc.com</div>
                  </div>
                </TD>
                <TD><Tag>Content Production</Tag></TD>
                <TD><StatusPill status="present" /></TD>
                <TD numeric>38.5 h</TD>
                <RowActions />
              </TR>
              <TR clickable>
                <TD>
                  <div>
                    <div className="font-medium text-fg">Hamza Sheikh</div>
                    <div className="text-small text-fg-muted">hamza@reamarc.com</div>
                  </div>
                </TD>
                <TD><Tag>Performance Marketing</Tag></TD>
                <TD><StatusPill status="wfh" /></TD>
                <TD numeric>40.0 h</TD>
                <RowActions />
              </TR>
              <TR clickable>
                <TD>
                  <div>
                    <div className="font-medium text-fg">Bilal Ahmed</div>
                    <div className="text-small text-fg-muted">bilal@reamarc.com</div>
                  </div>
                </TD>
                <TD><Tag>Creative Strategy</Tag></TD>
                <TD><StatusPill status="late" /></TD>
                <TD numeric>34.2 h</TD>
                <RowActions />
              </TR>
            </TBody>
          </Table>

          <TableFooter
            totalItems={42}
            page={1}
            pageSize={10}
            totalPages={5}
            onPageChange={() => {}}
          />
        </TableCard>
      </section>

      {/* 10. Kanban Board Presentational Parts */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          10. Kanban Board (§10.23)
        </h2>
        <KanbanStatsStrip
          items={[
            '31 open leads',
            '22% win rate',
            '3 uncontacted',
            '1 follow-up overdue',
          ]}
        />
        <KanbanBoard>
          <KanbanColumn width="leads">
            <KanbanColumnHeader label="New" count={8} totalValue="PKR 450K" />
            <KanbanColumnBody>
              <KanbanCard>
                <div className="font-medium text-fg text-ui">Nexus Digital</div>
                <div className="text-small text-fg-muted">Retail & eCommerce</div>
                <div className="mt-2 flex items-center justify-between">
                  <Tag>Google Ads</Tag>
                  <span className="text-small font-numeric text-fg">PKR 120K</span>
                </div>
              </KanbanCard>
              <KanbanCard>
                <div className="font-medium text-fg text-ui">Aura Apparel</div>
                <div className="text-small text-fg-muted">Fashion</div>
                <div className="mt-2 flex items-center justify-between">
                  <Tag>Meta Ads</Tag>
                  <span className="text-small font-numeric text-fg">PKR 85K</span>
                </div>
              </KanbanCard>
            </KanbanColumnBody>
          </KanbanColumn>

          <KanbanColumn width="leads">
            <KanbanColumnHeader label="Meeting booked" count={3} totalValue="PKR 280K" />
            <KanbanColumnBody>
              <KanbanCard>
                <div className="font-medium text-fg text-ui">Vertex Health</div>
                <div className="text-small text-fg-muted">Diagnostics</div>
                <div className="mt-2 flex items-center justify-between">
                  <StatusPill status="pending" />
                  <span className="text-small font-numeric text-fg">PKR 280K</span>
                </div>
              </KanbanCard>
            </KanbanColumnBody>
          </KanbanColumn>

          <KanbanColumn width="leads">
            <KanbanColumnHeader label="Negotiation" count={0} />
            <KanbanColumnBody>
              <KanbanEmptyColumn label="No leads in negotiation" />
            </KanbanColumnBody>
          </KanbanColumn>
        </KanbanBoard>
      </section>

      {/* 11. Empty & Error States */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          11. Empty States & Error States (§10.34, §10.35)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface border border-border rounded-lg shadow-xs">
            <EmptyState
              title="No exceptions to review"
              description="All attendance discrepancy and missing log records have been processed."
              action={<Button variant="secondary" size="sm">Refresh list</Button>}
            />
          </div>
          <ErrorState
            title="Couldn't load client pipeline"
            message="Database query timed out. Check your network connection and retry."
            onRetry={() => {}}
          />
        </div>
      </section>

      {/* 12. Skeletons Compositions */}
      <section className="space-y-4">
        <h2 className="text-h2 font-semibold text-fg border-b border-border pb-2">
          12. Loading Skeleton Compositions (§10.33, Mock 17)
        </h2>
        <DashboardSkeleton />
      </section>
    </div>
  );
};
