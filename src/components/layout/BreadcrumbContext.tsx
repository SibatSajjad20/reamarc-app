import React, { createContext, useContext, useState, useMemo } from 'react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface BreadcrumbContextValue {
  trail: BreadcrumbItem[] | null;
  setTrail: (trail: BreadcrumbItem[] | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  trail: null,
  setTrail: () => {},
});

export const BreadcrumbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [trail, setTrail] = useState<BreadcrumbItem[] | null>(null);

  const value = useMemo(() => ({ trail, setTrail }), [trail]);

  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumb = () => useContext(BreadcrumbContext);
