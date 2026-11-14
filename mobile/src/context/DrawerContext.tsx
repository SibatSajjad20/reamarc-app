import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type DrawerContextValue = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const DrawerContext = createContext<DrawerContextValue | undefined>(undefined);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((value) => !value), []);
  const value = useMemo(
    () => ({ open, openDrawer, closeDrawer, toggleDrawer }),
    [open, openDrawer, closeDrawer, toggleDrawer],
  );
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    return {
      open: false,
      openDrawer: () => undefined,
      closeDrawer: () => undefined,
      toggleDrawer: () => undefined,
    };
  }
  return ctx;
}
