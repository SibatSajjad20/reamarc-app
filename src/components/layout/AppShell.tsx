import React from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

interface AppShellProps {
  sidebar: React.ReactNode;
  topBar: React.ReactNode;
  children: React.ReactNode;
  isMobileNavOpen?: boolean;
  onMobileNavOpenChange?: (open: boolean) => void;
  mobileSidebar?: React.ReactNode;
  moduleClicksBlocked?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({
  sidebar,
  topBar,
  children,
  isMobileNavOpen = false,
  onMobileNavOpenChange,
  mobileSidebar,
  moduleClicksBlocked = false,
}) => {
  return (
    <div className="flex h-full w-full bg-canvas text-fg overflow-hidden antialiased">
      {/* Skip link for accessibility (§14.2) */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-accent focus:text-accent-fg focus:text-sm focus:shadow-md focus-visible:focus-ring"
      >
        Skip to content
      </a>

      {/* Desktop Persistent Left Sidebar (§6.1) */}
      <div className="hidden lg:flex shrink-0 h-full">
        {sidebar}
      </div>

      {/* Mobile / Tablet Drawer Sidebar (<1024px) (§6.4) */}
      {onMobileNavOpenChange && (
        <Sheet open={isMobileNavOpen} onOpenChange={onMobileNavOpenChange}>
          <SheetContent
            side="left"
            showClose={false}
            className="p-0 w-[280px] max-w-[85vw] border-r border-border bg-surface overflow-hidden"
          >
            {mobileSidebar || sidebar}
          </SheetContent>
        </Sheet>
      )}

      {/* Main View Area with TopBar and Views (§6.1) */}
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 min-w-0 flex flex-col relative bg-canvas overflow-hidden outline-none"
      >
        {/* Module Click Blocker overlay (preserves existing gate) */}
        {moduleClicksBlocked && (
          <div
            className="absolute inset-0 z-40"
            aria-hidden="true"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        )}

        {/* TopBar (§9.1) */}
        {topBar}

        {/* Content area: each view manages its own scrolling (§6.1) */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
};
