import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { ActiveClientsView, VISIBLE_SERVICE_CHIPS } from '../ActiveClientsView';
import type { Workspace } from '../../../types';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
  if (!window.PointerEvent) {
    (window as any).PointerEvent = class extends MouseEvent {};
  }
}

let mockCurrentUser: any = {
  id: 'admin_1',
  name: 'Admin User',
  email: 'admin@acme.com',
  role: 'admin',
};

let mockWorkspacesHook = {
  workspaces: [] as Workspace[],
  isLoading: false,
};

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    role: mockCurrentUser?.role,
    isAuthenticated: true,
  }),
}));

vi.mock('../../../hooks/useWorkspaces', () => ({
  useWorkspaces: () => mockWorkspacesHook,
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

const baseWorkspace: Workspace = {
  id: 'ws_1',
  name: 'Acme Corp',
  industry: 'Technology',
  project_cycle: 'Retainer',
  status: 'active',
  health: 'Good',
  priority: 'High',
  contract_start_date: '2026-01-15',
  contract_end_date: '2026-12-31',
  services: ['SEO', 'Branding', 'Website Dev'],
  poc_name: 'John Doe',
  poc_email: 'john@acme.com',
  poc_phone: '+1234567890',
  brandColor: '#000000',
  initials: 'AC',
};

describe('ActiveClientsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = {
      id: 'admin_1',
      name: 'Admin User',
      email: 'admin@acme.com',
      role: 'admin',
    };
    mockWorkspacesHook = {
      workspaces: [baseWorkspace],
      isLoading: false,
    };
  });

  it('declares and exports VISIBLE_SERVICE_CHIPS = 3', () => {
    expect(VISIBLE_SERVICE_CHIPS).toBe(3);
  });

  // 1. Headers
  it('renders correct headers and does not have POC or Health headers', () => {
    mockWorkspacesHook = {
      workspaces: [baseWorkspace],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'Client',
      'Engagement',
      'Services',
      'Priority',
      'Contract start',
      'Contract end',
      '',
    ]);
    expect(screen.queryByRole('columnheader', { name: /POC/i })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: /Health/i })).toBeNull();
  });

  // 2. POC / Health are gone from row, still in Sheet
  it('omits POC and Health from row but displays them in the detail Sheet', async () => {
    const ws: Workspace = {
      ...baseWorkspace,
      id: 'ws_ayesha',
      name: 'Alpha Brand',
      poc_name: 'Ayesha Khan',
      poc_email: 'ayesha@client.com',
      health: 'Emergency',
    };
    mockWorkspacesHook = {
      workspaces: [ws],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    const row = screen.getByText('Alpha Brand').closest('tr')!;
    const rowUtils = within(row);
    expect(rowUtils.queryByText('Ayesha Khan')).toBeNull();
    expect(rowUtils.queryByText('ayesha@client.com')).toBeNull();
    expect(rowUtils.queryByText('Emergency')).toBeNull();

    // Click row to open detail sheet
    fireEvent.click(row);

    // Detail Sheet should display POC and Health
    expect(await screen.findByRole('heading', { name: 'Alpha Brand' })).toBeDefined();
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Ayesha Khan')).toBeDefined();
    expect(within(sheet).getByText('ayesha@client.com')).toBeDefined();
    expect(within(sheet).getByText('Emergency')).toBeDefined();
  });

  // 3. Search by contact still works & Emergency filter
  it('still searches by POC contact info and filters by Emergency health', () => {
    const ws1: Workspace = {
      ...baseWorkspace,
      id: 'ws_1',
      name: 'Alpha Ltd',
      poc_name: 'Ayesha Khan',
      poc_email: 'contact@alpha.com',
      health: 'Emergency',
    };
    const ws2: Workspace = {
      ...baseWorkspace,
      id: 'ws_2',
      name: 'Beta Ltd',
      poc_name: 'Bob Smith',
      poc_email: 'bob@client.com',
      health: 'Good',
    };
    mockWorkspacesHook = {
      workspaces: [ws1, ws2],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    const searchInput = screen.getByPlaceholderText('Search by name, service or contact');

    // Search by POC name
    fireEvent.change(searchInput, { target: { value: 'Ayesha' } });
    expect(screen.getByText('Alpha Ltd')).toBeDefined();
    expect(screen.queryByText('Beta Ltd')).toBeNull();

    // Search by POC email
    fireEvent.change(searchInput, { target: { value: 'contact@alpha.com' } });
    expect(screen.getByText('Alpha Ltd')).toBeDefined();
    expect(screen.queryByText('Beta Ltd')).toBeNull();

    fireEvent.change(searchInput, { target: { value: 'bob@client.com' } });
    expect(screen.getByText('Beta Ltd')).toBeDefined();
    expect(screen.queryByText('Alpha Ltd')).toBeNull();

    // Reset search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getByText('Alpha Ltd')).toBeDefined();
    expect(screen.getByText('Beta Ltd')).toBeDefined();

    // Emergency filter
    const emergencyOption = screen.getByRole('radio', { name: 'Emergency' });
    fireEvent.click(emergencyOption);
    expect(screen.getByText('Alpha Ltd')).toBeDefined();
    expect(screen.queryByText('Beta Ltd')).toBeNull();
  });

  // 4. Services counts
  it('renders correct services count chips', () => {
    const ws0: Workspace = {
      ...baseWorkspace,
      id: 'ws_0',
      name: 'Zero Services Co',
      services: [],
    };
    const ws3: Workspace = {
      ...baseWorkspace,
      id: 'ws_3',
      name: 'Three Services Co',
      services: ['Branding', 'SEO', 'Website Dev'],
    };
    const ws4: Workspace = {
      ...baseWorkspace,
      id: 'ws_4',
      name: 'Four Services Co',
      services: ['Branding', 'SEO', 'Website Dev', 'Social Media Management'],
    };
    const ws6: Workspace = {
      ...baseWorkspace,
      id: 'ws_6',
      name: 'Six Services Co',
      services: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'],
    };
    mockWorkspacesHook = {
      workspaces: [ws0, ws3, ws4, ws6],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    // ws0: 0 services -> '—', no +N
    const row0 = screen.getByText('Zero Services Co').closest('tr')!;
    expect(within(row0).getByText('—')).toBeDefined();
    expect(within(row0).queryByText(/^\+/)).toBeNull();

    // ws3: 3 services -> all 3 visible, no +N
    const row3 = screen.getByText('Three Services Co').closest('tr')!;
    expect(within(row3).getByText('Branding')).toBeDefined();
    expect(within(row3).getByText('SEO')).toBeDefined();
    expect(within(row3).getByText('Website Dev')).toBeDefined();
    expect(within(row3).queryByText(/^\+/)).toBeNull();

    // ws4: 4 services -> first 3 chips visible + '+1'. Fourth name not visible chip.
    const row4 = screen.getByText('Four Services Co').closest('tr')!;
    expect(within(row4).getByText('Branding')).toBeDefined();
    expect(within(row4).getByText('SEO')).toBeDefined();
    expect(within(row4).getByText('Website Dev')).toBeDefined();
    expect(within(row4).getByText('+1')).toBeDefined();
    expect(within(row4).queryByText('Social Media Management')).toBeNull();

    // ws6: 6 services -> first 3 chips visible + '+3'
    const row6 = screen.getByText('Six Services Co').closest('tr')!;
    expect(within(row6).getByText('S1')).toBeDefined();
    expect(within(row6).getByText('S2')).toBeDefined();
    expect(within(row6).getByText('S3')).toBeDefined();
    expect(within(row6).getByText('+3')).toBeDefined();
    expect(within(row6).queryByText('S4')).toBeNull();
    expect(within(row6).queryByText('S5')).toBeNull();
    expect(within(row6).queryByText('S6')).toBeNull();
  });

  // 5. Services tooltip
  it('opens tooltip listing all services when +N chip is hovered/focused', async () => {
    const ws: Workspace = {
      ...baseWorkspace,
      id: 'ws_tooltip',
      name: 'Tooltip Co',
      services: ['Branding', 'SEO', 'Website Dev', 'Social Media Management'],
    };
    mockWorkspacesHook = {
      workspaces: [ws],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    const trigger = screen.getByText('+1');
    fireEvent.pointerMove(trigger);
    fireEvent.focus(trigger);

    await waitFor(() => {
      expect(screen.getByText('Services', { selector: 'span' })).toBeDefined();
    });
    expect(screen.queryByText(/Additional Services/i)).toBeNull();
    expect(screen.getByText('• Branding')).toBeDefined();
    expect(screen.getByText('• SEO')).toBeDefined();
    expect(screen.getByText('• Website Dev')).toBeDefined();
    expect(screen.getByText('• Social Media Management')).toBeDefined();
  });

  // 6. Contract start formatting
  it('formats Contract start as Jan 15, 2026 and renders — when empty', () => {
    const wsWithStart: Workspace = {
      ...baseWorkspace,
      id: 'ws_start_1',
      name: 'Start Date Co',
      contract_start_date: '2026-01-15',
    };
    const wsWithoutStart: Workspace = {
      ...baseWorkspace,
      id: 'ws_start_2',
      name: 'No Start Co',
      contract_start_date: undefined,
    };
    mockWorkspacesHook = {
      workspaces: [wsWithStart, wsWithoutStart],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    const row1 = screen.getByText('Start Date Co').closest('tr')!;
    expect(within(row1).getByText('Jan 15, 2026')).toBeDefined();

    const row2 = screen.getByText('No Start Co').closest('tr')!;
    expect(within(row2).getByText('—')).toBeDefined();
  });

  // 7. Contract end formatting
  it('formats Contract end with formatContractDate and shows Ongoing when empty', () => {
    const wsWithEnd: Workspace = {
      ...baseWorkspace,
      id: 'ws_end_1',
      name: 'End Date Co',
      contract_end_date: '2026-12-31',
    };
    const wsWithoutEnd: Workspace = {
      ...baseWorkspace,
      id: 'ws_end_2',
      name: 'Ongoing Co',
      contract_end_date: undefined,
    };
    mockWorkspacesHook = {
      workspaces: [wsWithEnd, wsWithoutEnd],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    const row1 = screen.getByText('End Date Co').closest('tr')!;
    expect(within(row1).getByText('Dec 31, 2026')).toBeDefined();
    expect(within(row1).queryByText('2026-12-31')).toBeNull();

    const row2 = screen.getByText('Ongoing Co').closest('tr')!;
    expect(within(row2).getByText('Ongoing')).toBeDefined();
  });

  // 8. Empty / loading states
  it('handles loading state with 7 columns and empty state with colSpan=7 and clearable filters', () => {
    // Loading state
    mockWorkspacesHook = {
      workspaces: [],
      isLoading: true,
    };
    const { unmount } = renderWithProviders(<ActiveClientsView />);
    const firstSkeletonRow = document.querySelector('tbody tr')!;
    expect(firstSkeletonRow.children.length).toBe(7);
    unmount();

    // Empty state when no workspaces
    mockWorkspacesHook = {
      workspaces: [],
      isLoading: false,
    };
    const { unmount: unmount2 } = renderWithProviders(<ActiveClientsView />);
    expect(screen.getByText('No active clients found')).toBeDefined();
    const emptyTd = screen.getByText('No active clients found').closest('td')!;
    expect(emptyTd.getAttribute('colspan')).toBe('7');
    unmount2();

    // Search that matches nothing and clear filters
    mockWorkspacesHook = {
      workspaces: [baseWorkspace],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);
    const searchInput = screen.getByPlaceholderText('Search by name, service or contact');
    fireEvent.change(searchInput, { target: { value: 'NonExistentClientXYZ' } });

    expect(screen.getByText('No active clients found')).toBeDefined();
    const emptyTdFiltered = screen.getByText('No active clients found').closest('td')!;
    expect(emptyTdFiltered.getAttribute('colspan')).toBe('7');

    const clearButton = screen.getByRole('button', { name: /Clear filters/i });
    fireEvent.click(clearButton);

    expect(screen.getByText('Acme Corp')).toBeDefined();
  });

  // 9. Inactive clients stay hidden
  it('hides inactive clients', () => {
    const activeWs: Workspace = {
      ...baseWorkspace,
      id: 'ws_act',
      name: 'Active Corp',
      status: 'active',
    };
    const inactiveWs: Workspace = {
      ...baseWorkspace,
      id: 'ws_inact',
      name: 'Inactive Corp',
      status: 'inactive',
    };
    mockWorkspacesHook = {
      workspaces: [activeWs, inactiveWs],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    expect(screen.getByText('Active Corp')).toBeDefined();
    expect(screen.queryByText('Inactive Corp')).toBeNull();
  });

  // Permissions check
  it('does not display Add workspace or row Edit button for non-admin/operations users', () => {
    mockCurrentUser = {
      id: 'member_1',
      name: 'Team Member',
      email: 'member@acme.com',
      role: 'team_member',
    };
    mockWorkspacesHook = {
      workspaces: [baseWorkspace],
      isLoading: false,
    };
    renderWithProviders(
      <ActiveClientsView
        onAddWorkspace={vi.fn()}
        onEditWorkspace={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /Add workspace/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Edit Acme Corp/i })).toBeNull();

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(headers).toEqual([
      'Client',
      'Engagement',
      'Services',
      'Priority',
      'Contract start',
      'Contract end',
      '',
    ]);
  });

  it('displays Add workspace and row Edit button for admin and operations users', () => {
    mockWorkspacesHook = {
      workspaces: [baseWorkspace],
      isLoading: false,
    };

    // Admin user
    mockCurrentUser = {
      id: 'admin_1',
      name: 'Admin User',
      email: 'admin@acme.com',
      role: 'admin',
    };
    const onAddAdmin = vi.fn();
    const onEditAdmin = vi.fn();
    const { unmount } = renderWithProviders(
      <ActiveClientsView
        onAddWorkspace={onAddAdmin}
        onEditWorkspace={onEditAdmin}
      />
    );
    expect(screen.getByRole('button', { name: /Add workspace/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Edit Acme Corp/i })).toBeDefined();
    unmount();

    // Operations user
    mockCurrentUser = {
      id: 'ops_1',
      name: 'Ops User',
      email: 'ops@acme.com',
      role: 'operations',
    };
    const onAddOps = vi.fn();
    const onEditOps = vi.fn();
    renderWithProviders(
      <ActiveClientsView
        onAddWorkspace={onAddOps}
        onEditWorkspace={onEditOps}
      />
    );
    expect(screen.getByRole('button', { name: /Add workspace/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Edit Acme Corp/i })).toBeDefined();
  });

  // Services chip row layout & truncate
  it('renders services cell with flex-nowrap container and chips with title and inner truncate span', () => {
    const ws: Workspace = {
      ...baseWorkspace,
      id: 'ws_chips_layout',
      name: 'Chip Layout Co',
      services: ['Social Media Management', 'SEO', 'Branding'],
    };
    mockWorkspacesHook = {
      workspaces: [ws],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    const row = screen.getByText('Chip Layout Co').closest('tr')!;
    const servicesCell = row.querySelectorAll('td')[2];
    const chipContainer = servicesCell.querySelector('div')!;

    expect(chipContainer.classList.contains('flex-nowrap')).toBe(true);
    expect(chipContainer.classList.contains('flex-wrap')).toBe(false);

    (ws.services ?? []).forEach((service) => {
      const chip = servicesCell.querySelector(`span[title="${service}"]`);
      expect(chip).not.toBeNull();
      expect(chip!.getAttribute('title')).toBe(service);
      expect(chip!.classList.contains('max-w-[10rem]')).toBe(true);
      expect(chip!.classList.contains('min-w-0')).toBe(true);
      expect(chip!.classList.contains('truncate')).toBe(false);

      const innerTruncate = chip!.querySelector('.truncate');
      expect(innerTruncate).not.toBeNull();
      expect(innerTruncate!.textContent).toBe(service);
    });
  });

  // +N click stopPropagation
  it('does not open detail Sheet when clicking +N chip, but opens Sheet when clicking row', () => {
    const ws: Workspace = {
      ...baseWorkspace,
      id: 'ws_plus_click',
      name: 'Plus Click Co',
      services: ['Branding', 'SEO', 'Website Dev', 'Social Media Management'],
    };
    mockWorkspacesHook = {
      workspaces: [ws],
      isLoading: false,
    };
    renderWithProviders(<ActiveClientsView />);

    expect(screen.queryByRole('dialog')).toBeNull();

    const plusChip = screen.getByText('+1');
    fireEvent.click(plusChip);

    expect(screen.queryByRole('dialog')).toBeNull();

    const row = screen.getByText('Plus Click Co').closest('tr')!;
    fireEvent.click(row);

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Plus Click Co' })).toBeDefined();
  });
});
