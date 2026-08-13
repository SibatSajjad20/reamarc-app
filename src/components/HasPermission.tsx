import React from 'react';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/auth';

interface HasPermissionProps {
  allowedRoles?: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
  disableOnly?: boolean;
}

export const HasPermission: React.FC<HasPermissionProps> = ({
  allowedRoles = ['admin', 'editor'],
  children,
  fallback = null,
  disableOnly = false,
}) => {
  const { role } = useAuth();

  const isAuthorized = allowedRoles.includes(role);

  if (isAuthorized) {
    return <>{children}</>;
  }

  if (disableOnly && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      disabled: true,
      className: `${(children.props as any).className || ''} opacity-50 cursor-not-allowed pointer-events-none`,
      title: 'Read-only mode (Viewer access)',
    });
  }

  return <>{fallback}</>;
};
