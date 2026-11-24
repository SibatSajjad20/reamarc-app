import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import css from '../index.css?raw';
import { Sidebar } from '@/components/Sidebar';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { AuthUser } from '@/types/auth';

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = MockResizeObserver;
}

let currentUserState: AuthUser = {
  id: 'cm_test_dv_admin',
  email: 'a@x',
  name: 'Admin',
  role: 'admin',
  company_id: 'cm_test_dataviz',
  company_modules: ['dashboard', 'sales', 'active_clients', 'tasks'],
  company: { id: 'cm_test_dataviz', name: 'DataViz Test' },
};

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: currentUserState,
    role: currentUserState.role,
    isAuthenticated: true,
    isLoading: false,
    switchCompany: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAccessAttendance: true,
    canAccessDailyLog: true,
    canAccessCrm: true,
    canAccessContentCalendar: true,
    canAccessWebsitePipeline: true,
    canAccessAds: true,
    canSeeWonDealApprovals: true,
    isAttendanceTracked: true,
    isDailyLogTracked: true,
  }),
}));

vi.mock('@/hooks/useTaskCounts', () => ({
  useTaskCounts: () => ({ counts: { open: 5 }, canSeeTasks: true }),
  setTaskCountsEnabled: vi.fn(),
}));

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [], saveWorkspace: vi.fn(), refetch: vi.fn() }),
}));

vi.mock('@/services/dailyLogService', () => ({
  dailyLogService: { getUnreadExceptionCount: async () => 0, getDayTarget: async () => ({ follow_ups: [] }) },
}));

vi.mock('@/utils/cacheBus', () => ({
  useCacheInvalidation: () => {},
}));

function mockMatchMedia({ reduced = false, fine = true }: { reduced?: boolean; fine?: boolean } = {}) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: q.includes('reduce') ? reduced : (q.includes('hover') || q.includes('pointer')) ? fine : false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

describe('Sidebar.hoverExpand', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMatchMedia({ reduced: false, fine: true });
    currentUserState = {
      id: 'cm_test_dv_admin',
      email: 'a@x',
      name: 'Admin',
      role: 'admin',
      company_id: 'cm_test_dataviz',
      company_modules: ['dashboard', 'sales', 'active_clients', 'tasks'],
      company: { id: 'cm_test_dataviz', name: 'DataViz Test' },
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('behavior undefined: same as main (labels visible, no data-sidebar-rail)', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(container.querySelector('[data-sidebar-rail]')).toBeNull();
    const aside = container.querySelector('#app-sidebar');
    expect(aside).toBeTruthy();
    expect(aside?.getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('behavior="hover": collapsed tree at rest, expands after mouse enter + 120ms with labels, badge counts and aria-current="page"', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(container.querySelector('[data-sidebar-rail]')).toBeTruthy();
    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.getAttribute('data-collapsed')).toBe('true');
    expect(aside.getAttribute('data-labels')).toBe('hidden');
    // At rest, labels are always mounted but styled hidden
    expect(screen.getByText('Dashboard')).toBeTruthy();

    // Mouse enter + advance 120ms + 200ms
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
    });
    act(() => {
      vi.advanceTimersByTime(120 + 200);
    });

    expect(aside.getAttribute('data-peek')).toBe('open');
    expect(aside.getAttribute('data-collapsed')).toBe('false');
    expect(aside.getAttribute('data-labels')).toBe('shown');
    expect(screen.getByText('Dashboard')).toBeTruthy();

    const activeItem = container.querySelector('[aria-current="page"]');
    expect(activeItem).toBeTruthy();
    expect(activeItem?.textContent).toContain('Dashboard');

    // Badge counts render (Tasks has badge count 5 from mock)
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('behavior="collapsed": a mouse enter never expands it', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="collapsed"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.getAttribute('data-collapsed')).toBe('true');

    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(500);
    });

    expect(aside.getAttribute('data-collapsed')).toBe('true');
    expect(aside.getAttribute('data-labels')).toBe('hidden');
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('behavior="expanded": the expanded tree, aside not absolute', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="expanded"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.getAttribute('data-collapsed')).toBe('false');
    expect(aside.classList.contains('absolute')).toBe(false);
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('user menu: opening the user DropdownMenu while peeking, then firing pointerleave on the aside → still expanded', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;

    // Hover to peek
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120 + 200);
    });
    expect(aside.getAttribute('data-peek')).toBe('open');

    // Click user menu button in peeked expanded tree
    const userMenuBtn = container.querySelector('[data-nav-key="user-menu"]') as HTMLElement;
    expect(userMenuBtn).toBeTruthy();

    act(() => {
      fireEvent.pointerDown(userMenuBtn, { button: 0 });
      fireEvent.click(userMenuBtn);
    });

    // Fire pointerleave
    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(2000);
    });

    // Overlay is open, so peek stays open
    expect(aside.getAttribute('data-collapsed')).toBe('false');
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('keyboard: Tab into the sidebar in hover mode expands it, and focus stays on the same data-nav-key after the swap', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    const initialButton = container.querySelector('[data-nav-key="dashboard"]') as HTMLElement;
    expect(initialButton).toBeTruthy();

    // Stub :focus-visible on initialButton
    vi.spyOn(initialButton, 'matches').mockImplementation((sel: string) => sel === ':focus-visible');

    act(() => {
      fireEvent.focus(initialButton);
    });

    expect(aside.getAttribute('data-collapsed')).toBe('false');

    const activeElement = document.activeElement as HTMLElement;
    expect(activeElement?.getAttribute('data-nav-key')).toBe('dashboard');
  });

  it('pin button: the "Keep sidebar expanded" button calls onBehaviorChange("expanded")', () => {
    const onBehaviorChange = vi.fn();
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={onBehaviorChange}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;

    // Hover to peek
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120 + 200);
    });

    const pinBtn = screen.getByRole('button', { name: 'Keep sidebar expanded' });
    expect(pinBtn).toBeTruthy();

    act(() => {
      fireEvent.click(pinBtn);
    });

    expect(onBehaviorChange).toHaveBeenCalledWith('expanded');
  });

  it('user-menu "Sidebar" submenu: lists 3 options with a check on the current one, and is absent when isMobile', () => {
    const onBehaviorChange = vi.fn();
    const { container, unmount } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={onBehaviorChange}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120 + 200);
    });

    const userMenuBtn = container.querySelector('[data-nav-key="user-menu"]') as HTMLElement;
    act(() => {
      fireEvent.pointerDown(userMenuBtn, { button: 0 });
      fireEvent.click(userMenuBtn);
    });

    // Check that "Sidebar" menu item is present
    expect(screen.getByText('Sidebar')).toBeTruthy();

    unmount();

    // Now render with isMobile = true
    const { container: mobileContainer } = render(
      <TooltipProvider>
        <Sidebar
          isMobile={true}
          behavior="hover"
          onBehaviorChange={onBehaviorChange}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const mobileUserBtn = mobileContainer.querySelector('[data-nav-key="user-menu"]') as HTMLElement;
    act(() => {
      fireEvent.pointerDown(mobileUserBtn, { button: 0 });
      fireEvent.click(mobileUserBtn);
    });

    expect(screen.queryByText('Sidebar')).toBeNull();
  });

  it('isMobile: never absolute, never hover (the drawer is unchanged)', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          isMobile={true}
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    expect(container.querySelector('[data-sidebar-rail]')).toBeNull();
    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.classList.contains('absolute')).toBe(false);

    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(500);
    });

    expect(aside.getAttribute('data-peek')).toBeNull();
  });

  it('no class changes and no remounting across hover states', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.getAttribute('data-peek')).toBe('closed');

    // Gather elements at rest (closed)
    const navRows = Array.from(container.querySelectorAll('[data-nav-key]')) as HTMLElement[];
    const icons = Array.from(container.querySelectorAll('[data-nav-key] svg')) as SVGElement[];
    const groupHeaders = Array.from(container.querySelectorAll('[data-group-header]')) as HTMLElement[];

    expect(navRows.length).toBeGreaterThan(0);
    expect(icons.length).toBeGreaterThan(0);
    expect(groupHeaders.length).toBeGreaterThan(0);

    const initialSnapshots = {
      navRows: navRows.map((el) => ({ el, key: el.getAttribute('data-nav-key'), className: el.className })),
      icons: icons.map((el) => ({ el, className: el.getAttribute('class') })),
      groupHeaders: groupHeaders.map((el) => ({ el, className: el.className })),
    };

    const verifyState = (expectedPeek: string) => {
      expect(aside.getAttribute('data-peek')).toBe(expectedPeek);

      // Verify nav rows: same DOM element, isConnected, same className
      initialSnapshots.navRows.forEach(({ el, key, className }) => {
        expect(el.isConnected).toBe(true);
        expect(container.querySelector(`[data-nav-key="${key}"]`)).toBe(el);
        expect(el.className).toBe(className);
      });

      // Verify icons
      initialSnapshots.icons.forEach(({ el, className }) => {
        expect(el.isConnected).toBe(true);
        expect(el.getAttribute('class')).toBe(className);
      });

      // Verify group headers
      initialSnapshots.groupHeaders.forEach(({ el, className }) => {
        expect(el.isConnected).toBe(true);
        expect(el.className).toBe(className);
      });
    };

    // 1. Enter + 120ms -> opening
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120);
    });
    verifyState('opening');

    // 2. Advance to open (+ 200ms)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    verifyState('open');

    // 3. Leave + 250ms -> closing
    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(250);
    });
    verifyState('closing');

    // 4. Advance transition/fallback (+ 240ms) -> closed
    act(() => {
      vi.advanceTimersByTime(240);
    });
    verifyState('closed');
  });

  it('labels always mounted in hover and collapsed modes with data-labels driving visibility', () => {
    const { container, unmount } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.getAttribute('data-labels')).toBe('hidden');
    expect(screen.getByText('Dashboard')).toBeTruthy();

    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120);
    });
    expect(aside.getAttribute('data-labels')).toBe('shown');
    expect(screen.getByText('Dashboard')).toBeTruthy();

    unmount();

    const { container: collapsedContainer } = render(
      <TooltipProvider>
        <Sidebar
          behavior="collapsed"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );
    const collapsedAside = collapsedContainer.querySelector('#app-sidebar') as HTMLElement;
    expect(collapsedAside.getAttribute('data-labels')).toBe('hidden');
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('scrollbar class only when expanded: both navs always have sidebar-scroll, sidebar-scroll-visible only when data-labels="shown"', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    const mainNav = container.querySelector('nav[aria-label="Main"]') as HTMLElement;
    const settingsNav = container.querySelector('nav[aria-label="Settings"]') as HTMLElement;

    expect(mainNav.classList.contains('sidebar-scroll')).toBe(true);
    expect(settingsNav.classList.contains('sidebar-scroll')).toBe(true);
    expect(mainNav.classList.contains('sidebar-scroll-visible')).toBe(false);
    expect(settingsNav.classList.contains('sidebar-scroll-visible')).toBe(false);

    // Enter + 120ms -> opening (data-labels="shown")
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120);
    });
    expect(aside.getAttribute('data-labels')).toBe('shown');
    expect(mainNav.classList.contains('sidebar-scroll-visible')).toBe(true);
    expect(settingsNav.classList.contains('sidebar-scroll-visible')).toBe(true);

    // Open
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(aside.getAttribute('data-labels')).toBe('shown');
    expect(mainNav.classList.contains('sidebar-scroll-visible')).toBe(true);
    expect(settingsNav.classList.contains('sidebar-scroll-visible')).toBe(true);

    // Leave + 250ms -> closing (data-labels="hidden")
    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(250);
    });
    expect(aside.getAttribute('data-labels')).toBe('hidden');
    expect(mainNav.classList.contains('sidebar-scroll-visible')).toBe(false);
    expect(settingsNav.classList.contains('sidebar-scroll-visible')).toBe(false);

    // Closed
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(mainNav.classList.contains('sidebar-scroll-visible')).toBe(false);
    expect(settingsNav.classList.contains('sidebar-scroll-visible')).toBe(false);
  });

  it('group header slots: every role=group renders exactly one header slot with same class in all states, and divider is always mounted for groups after first', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    const groups = Array.from(container.querySelectorAll('nav[aria-label="Main"] div[role="group"]'));
    expect(groups.length).toBeGreaterThan(1);

    groups.forEach((group, index) => {
      const headerSlots = group.querySelectorAll('[data-group-header]');
      expect(headerSlots.length).toBe(1);
      const slot = headerSlots[0] as HTMLElement;
      expect(slot.className).toContain('relative');

      const divider = slot.querySelector('.sidebar-rail-only');
      if (index > 0) {
        expect(divider).toBeTruthy();
      } else {
        expect(divider).toBeNull();
      }
    });

    // Hover open
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120 + 200);
    });

    // Check again when open: exactly one header slot and divider still mounted
    groups.forEach((group, index) => {
      const headerSlots = group.querySelectorAll('[data-group-header]');
      expect(headerSlots.length).toBe(1);
      const slot = headerSlots[0] as HTMLElement;
      const divider = slot.querySelector('.sidebar-rail-only');
      if (index > 0) {
        expect(divider).toBeTruthy();
      }
    });
  });

  it('rail sub-items: in hover mode while open, no inline sub-item list is rendered for Tasks and DropdownMenu is used; in expanded mode inline list and chevron work', () => {
    // 1. Hover mode
    const { container, unmount } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="tasks"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120 + 200);
    });
    expect(aside.getAttribute('data-peek')).toBe('open');

    // In hover mode, Tasks row is a DropdownMenu trigger, no inline sub-item list is rendered
    expect(container.querySelector('.border-l.border-border')).toBeNull();

    unmount();

    // 2. Expanded mode
    const { container: expandedContainer } = render(
      <TooltipProvider>
        <Sidebar
          behavior="expanded"
          onBehaviorChange={vi.fn()}
          currentView="tasks"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    // In expanded mode, inline chevron button is present
    const chevronBtn = expandedContainer.querySelector('[aria-label="Toggle Tasks sub-items"]');
    expect(chevronBtn).toBeTruthy();
  });

  it('reduced motion: with prefers-reduced-motion: reduce, goes straight from closed to open with data-labels="shown" (no opening)', () => {
    mockMatchMedia({ reduced: true, fine: true });

    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    expect(aside.getAttribute('data-peek')).toBe('closed');
    expect(aside.getAttribute('data-labels')).toBe('hidden');

    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120);
    });

    // Under reduced motion, skips 'opening' and transitions straight to 'open'
    expect(aside.getAttribute('data-peek')).toBe('open');
    expect(aside.getAttribute('data-labels')).toBe('shown');

    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(250);
    });

    // Skips 'closing' and transitions straight to 'closed'
    expect(aside.getAttribute('data-peek')).toBe('closed');
    expect(aside.getAttribute('data-labels')).toBe('hidden');
  });

  // ─────────────────────────────────────────────────────────────
  // FIX 2 SPEC TESTS
  // ─────────────────────────────────────────────────────────────

  it('inactive nav is inert: with currentView="dashboard" Settings nav is inert/aria-hidden, with currentView="settings" Main nav is inert/aria-hidden', () => {
    const checkNavInertness = (container: HTMLElement, currentView: string) => {
      const mainNav = container.querySelector('nav[aria-label="Main"]');
      const settingsNav = container.querySelector('nav[aria-label="Settings"]');
      expect(mainNav).toBeTruthy();
      expect(settingsNav).toBeTruthy();

      if (currentView === 'dashboard') {
        expect(settingsNav?.hasAttribute('inert')).toBe(true);
        expect(settingsNav?.getAttribute('aria-hidden')).toBe('true');
        expect(mainNav?.hasAttribute('inert')).toBe(false);
        expect(mainNav?.hasAttribute('aria-hidden')).toBe(false);
      } else {
        expect(mainNav?.hasAttribute('inert')).toBe(true);
        expect(mainNav?.getAttribute('aria-hidden')).toBe('true');
        expect(settingsNav?.hasAttribute('inert')).toBe(false);
        expect(settingsNav?.hasAttribute('aria-hidden')).toBe(false);
      }
    };

    // Scenarios: hover (at rest), hover (after opening), collapsed, expanded, isMobile
    for (const view of ['dashboard', 'settings'] as const) {
      // 1. hover at rest
      const { container: hoverRest, unmount: u1 } = render(
        <TooltipProvider>
          <Sidebar
            behavior="hover"
            onBehaviorChange={vi.fn()}
            currentView={view}
            onSelectView={vi.fn()}
            onSignOut={vi.fn()}
            theme="light"
            onToggleTheme={vi.fn()}
          />
        </TooltipProvider>
      );
      checkNavInertness(hoverRest, view);
      u1();

      // 2. hover after opening
      const { container: hoverOpen, unmount: u2 } = render(
        <TooltipProvider>
          <Sidebar
            behavior="hover"
            onBehaviorChange={vi.fn()}
            currentView={view}
            onSelectView={vi.fn()}
            onSignOut={vi.fn()}
            theme="light"
            onToggleTheme={vi.fn()}
          />
        </TooltipProvider>
      );
      const aside = hoverOpen.querySelector('#app-sidebar') as HTMLElement;
      act(() => {
        fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
        vi.advanceTimersByTime(120 + 200);
      });
      checkNavInertness(hoverOpen, view);
      u2();

      // 3. collapsed
      const { container: collapsedC, unmount: u3 } = render(
        <TooltipProvider>
          <Sidebar
            behavior="collapsed"
            onBehaviorChange={vi.fn()}
            currentView={view}
            onSelectView={vi.fn()}
            onSignOut={vi.fn()}
            theme="light"
            onToggleTheme={vi.fn()}
          />
        </TooltipProvider>
      );
      checkNavInertness(collapsedC, view);
      u3();

      // 4. expanded
      const { container: expandedC, unmount: u4 } = render(
        <TooltipProvider>
          <Sidebar
            behavior="expanded"
            onBehaviorChange={vi.fn()}
            currentView={view}
            onSelectView={vi.fn()}
            onSignOut={vi.fn()}
            theme="light"
            onToggleTheme={vi.fn()}
          />
        </TooltipProvider>
      );
      checkNavInertness(expandedC, view);
      u4();

      // 5. isMobile
      const { container: mobileC, unmount: u5 } = render(
        <TooltipProvider>
          <Sidebar
            isMobile={true}
            currentView={view}
            onSelectView={vi.fn()}
            onSignOut={vi.fn()}
            theme="light"
            onToggleTheme={vi.fn()}
          />
        </TooltipProvider>
      );
      checkNavInertness(mobileC, view);
      u5();
    }
  });

  it('brand tab stops: hover rest (switcher/pin 0, expand -1), collapsed rest (switcher/pin -1, expand 0), expanded (switcher/pin 0, expand -1)', () => {
    currentUserState = {
      ...currentUserState,
      companies: [
        { id: 'cm_test_dataviz', name: 'DataViz Test' },
        { id: 'cm_test_other', name: 'Other Company' },
      ],
    };

    // 1. hover at rest
    const { container: hoverContainer, unmount: u1 } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const hoverCompanySwitcher = hoverContainer.querySelector('.sidebar-brand-expanded button') as HTMLButtonElement;
    const hoverPinBtn = hoverContainer.querySelector('button[aria-label="Collapse sidebar"], button[aria-label="Keep sidebar expanded"]') as HTMLButtonElement;
    const hoverExpandBtn = hoverContainer.querySelector('button[aria-label="Expand sidebar"]') as HTMLButtonElement;

    expect(hoverCompanySwitcher.tabIndex).toBe(0);
    expect(hoverPinBtn.tabIndex).toBe(0);
    expect(hoverExpandBtn.tabIndex).toBe(-1);
    u1();

    // 2. collapsed at rest
    const { container: collapsedContainer, unmount: u2 } = render(
      <TooltipProvider>
        <Sidebar
          behavior="collapsed"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const collapsedCompanySwitcher = collapsedContainer.querySelector('.sidebar-brand-expanded button') as HTMLButtonElement;
    const collapsedPinBtn = collapsedContainer.querySelector('button[aria-label="Collapse sidebar"], button[aria-label="Keep sidebar expanded"]') as HTMLButtonElement;
    const collapsedExpandBtn = collapsedContainer.querySelector('button[aria-label="Expand sidebar"]') as HTMLButtonElement;

    expect(collapsedCompanySwitcher.tabIndex).toBe(-1);
    expect(collapsedPinBtn.tabIndex).toBe(-1);
    expect(collapsedExpandBtn.tabIndex).toBe(0);
    u2();

    // 3. expanded
    const { container: expandedContainer, unmount: u3 } = render(
      <TooltipProvider>
        <Sidebar
          behavior="expanded"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const expandedCompanySwitcher = expandedContainer.querySelector('.sidebar-brand-expanded button') as HTMLButtonElement;
    const expandedPinBtn = expandedContainer.querySelector('button[aria-label="Collapse sidebar"], button[aria-label="Keep sidebar expanded"]') as HTMLButtonElement;
    const expandedExpandBtn = expandedContainer.querySelector('button[aria-label="Expand sidebar"]') as HTMLButtonElement;

    expect(expandedCompanySwitcher.tabIndex).toBe(0);
    expect(expandedPinBtn.tabIndex).toBe(0);
    expect(expandedExpandBtn.tabIndex).toBe(-1);
    u3();
  });

  it('CSS guard: validates short-viewport heights, scrollbar, reduced-motion, and pointer-events rules', () => {
    const marker = '/* ─── Sidebar hover-expand and short-viewport styling';
    const idx = css.indexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const sidebarCss = css.slice(idx);

    // Contains short-viewport media query
    expect(sidebarCss).toContain('@media (min-width: 1024px) and (max-height: 800px)');

    // Tight block sets --sb-row-h: 30px and --sb-group-h: 20px
    const mediaMatch = sidebarCss.match(/@media\s*\(min-width:\s*1024px\)\s*and\s*\(max-height:\s*800px\)\s*\{([\s\S]*?\}[\s\S]*?)\}/);
    expect(mediaMatch).toBeTruthy();
    const tightBlock = mediaMatch![1];
    expect(tightBlock).toMatch(/--sb-row-h:\s*30px;/);
    expect(tightBlock).toMatch(/--sb-group-h:\s*20px;/);

    // #app-sidebar .sidebar-scroll has scrollbar-width: none
    const scrollMatch = sidebarCss.match(/#app-sidebar\s+\.sidebar-scroll\s*\{([\s\S]*?)\}/);
    expect(scrollMatch).toBeTruthy();
    expect(scrollMatch![1]).toContain('scrollbar-width: none');

    // prefers-reduced-motion: reduce block sets transition: none !important
    const motionMatch = sidebarCss.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}/);
    expect(motionMatch).toBeTruthy();
    expect(motionMatch![1]).toContain('transition: none !important');

    // No rule whose selector contains .sidebar-label or .sidebar-rail-only contains pointer-events: auto
    const ruleRegex = /([^{}]+)\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRegex.exec(sidebarCss)) !== null) {
      const selector = match[1].trim();
      const declarations = match[2];
      if (selector.includes('.sidebar-label') || selector.includes('.sidebar-rail-only')) {
        expect(declarations).not.toMatch(/pointer-events:\s*auto/);
      }
    }

    // [data-labels="shown"] .sidebar-label rule contains pointer-events: inherit
    const labelsShownLabelMatch = sidebarCss.match(/#app-sidebar\[data-labels="shown"\]\s+\.sidebar-label\s*\{([\s\S]*?)\}/);
    expect(labelsShownLabelMatch).toBeTruthy();
    expect(labelsShownLabelMatch![1]).toMatch(/pointer-events:\s*inherit;/);
  });

  it('group header slot height: identical style.height across at rest, opening, open, closing, and closed states', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;
    const getHeights = () =>
      Array.from(container.querySelectorAll('[data-group-header]')).map(
        (el) => (el as HTMLElement).style.height
      );

    // 1. At rest (closed)
    expect(aside.getAttribute('data-peek')).toBe('closed');
    const atRestHeights = getHeights();
    expect(atRestHeights.length).toBeGreaterThan(0);

    // 2. Opening (after pointerEnter and 120ms)
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120);
    });
    expect(aside.getAttribute('data-peek')).toBe('opening');
    const openingHeights = getHeights();

    // 3. Open (after 200ms)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(aside.getAttribute('data-peek')).toBe('open');
    const openHeights = getHeights();

    // 4. Closing (after pointerLeave and 250ms)
    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(250);
    });
    expect(aside.getAttribute('data-peek')).toBe('closing');
    const closingHeights = getHeights();

    // 5. Closed (after 240ms)
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(aside.getAttribute('data-peek')).toBe('closed');
    const closedHeights = getHeights();

    expect(openingHeights).toEqual(atRestHeights);
    expect(openHeights).toEqual(atRestHeights);
    expect(closingHeights).toEqual(atRestHeights);
    expect(closedHeights).toEqual(atRestHeights);
  });

  it('aside padding: contains px-2 and no other px-/pl-/pr- class in every peek state', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;

    const assertPadding = () => {
      const classes = aside.className.split(/\s+/);
      expect(classes).toContain('px-2');
      const horizontalPaddingClasses = classes.filter((c) => /^(px|pl|pr)-/.test(c));
      expect(horizontalPaddingClasses).toEqual(['px-2']);
    };

    // 1. At rest (closed)
    expect(aside.getAttribute('data-peek')).toBe('closed');
    assertPadding();

    // 2. Opening
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120);
    });
    expect(aside.getAttribute('data-peek')).toBe('opening');
    assertPadding();

    // 3. Open
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(aside.getAttribute('data-peek')).toBe('open');
    assertPadding();

    // 4. Closing
    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(250);
    });
    expect(aside.getAttribute('data-peek')).toBe('closing');
    assertPadding();

    // 5. Closed
    act(() => {
      vi.advanceTimersByTime(240);
    });
    expect(aside.getAttribute('data-peek')).toBe('closed');
    assertPadding();
  });

  it('rail flyout keeps the panel open: Tasks DropdownMenu open prevents closing on pointerleave past close delay', () => {
    const { container } = render(
      <TooltipProvider>
        <Sidebar
          behavior="hover"
          onBehaviorChange={vi.fn()}
          currentView="dashboard"
          onSelectView={vi.fn()}
          onSignOut={vi.fn()}
          theme="light"
          onToggleTheme={vi.fn()}
        />
      </TooltipProvider>
    );

    const aside = container.querySelector('#app-sidebar') as HTMLElement;

    // Open the panel
    act(() => {
      fireEvent.pointerEnter(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(120 + 200);
    });
    expect(aside.getAttribute('data-peek')).toBe('open');

    // Open the Tasks DropdownMenu
    const tasksRow = container.querySelector('[data-nav-key="tasks"]') as HTMLElement;
    expect(tasksRow).toBeTruthy();

    act(() => {
      fireEvent.pointerDown(tasksRow, { button: 0 });
      fireEvent.click(tasksRow);
    });

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByText('All tasks')).toBeTruthy();

    // Fire pointerleave on aside and advance past the close delay (250ms)
    act(() => {
      fireEvent.pointerLeave(aside, { pointerType: 'mouse' });
      vi.advanceTimersByTime(250 + 100);
    });

    // data-peek must still be open
    expect(aside.getAttribute('data-peek')).toBe('open');
  });
});
