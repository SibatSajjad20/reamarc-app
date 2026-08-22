import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface ModuleLoadGateContextType {
  blocked: boolean;
  acquire: () => void;
  release: () => void;
}

const ModuleLoadGateContext = createContext<ModuleLoadGateContextType>({
  blocked: false,
  acquire: () => {},
  release: () => {},
});

export const ModuleLoadGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locks = useRef(0);
  const [blocked, setBlocked] = useState(false);

  const acquire = useCallback(() => {
    locks.current += 1;
    setBlocked(true);
  }, []);

  const release = useCallback(() => {
    locks.current = Math.max(0, locks.current - 1);
    setBlocked(locks.current > 0);
  }, []);

  return (
    <ModuleLoadGateContext.Provider value={{ blocked, acquire, release }}>
      {children}
    </ModuleLoadGateContext.Provider>
  );
};

export function useModuleLoadBlocked() {
  return useContext(ModuleLoadGateContext).blocked;
}

/** Blocks clicks on the open module until it has finished its first load. Later refreshes stay clickable. */
export function useModuleLoadGate(isLoading: boolean) {
  const { acquire, release } = useContext(ModuleLoadGateContext);
  const finishedOnce = useRef(!isLoading);
  const holding = useRef(false);

  if (!isLoading) {
    finishedOnce.current = true;
  }

  useEffect(() => {
    if (finishedOnce.current) {
      if (holding.current) {
        holding.current = false;
        release();
      }
      return;
    }
    if (!holding.current) {
      holding.current = true;
      acquire();
    }
    return () => {
      if (holding.current) {
        holding.current = false;
        release();
      }
    };
  }, [isLoading, acquire, release]);
}
