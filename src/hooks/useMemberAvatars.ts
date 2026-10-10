import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/adminService';
import { crmService } from '../services/crmService';
import { useAuth } from '../context/AuthContext';
import type { AdminMember } from '../types/admin';
import type { CrmAssignee } from '../types/crm';

let inFlightAdminFetch: Promise<AdminMember[]> | null = null;
let inFlightAssigneeFetch: Promise<CrmAssignee[]> | null = null;

export function useMemberAvatars() {
  const { user } = useAuth();
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';

  const [members, setMembers] = useState<AdminMember[]>(() => {
    return isAdminOrHr ? adminService.getCachedMembers()?.data || [] : [];
  });
  const [assignees, setAssignees] = useState<CrmAssignee[]>(() => {
    return crmService.getCachedAssignees()?.data || [];
  });

  useEffect(() => {
    if (isAdminOrHr) {
      const cached = adminService.getCachedMembers()?.data;
      if (cached && cached.length > 0) {
        setMembers(cached);
        return;
      }

      if (!inFlightAdminFetch) {
        inFlightAdminFetch = adminService.getMembers({ is_active: true });
      }

      inFlightAdminFetch
        .then((data) => {
          if (Array.isArray(data)) {
            adminService.setCachedMembers(data);
            setMembers(data);
          }
        })
        .catch((err) => {
          console.error('Failed to load member avatars:', err);
        })
        .finally(() => {
          inFlightAdminFetch = null;
        });
    } else {
      const cached = crmService.getCachedAssignees()?.data;
      if (cached && cached.length > 0) {
        setAssignees(cached);
        return;
      }

      if (!inFlightAssigneeFetch) {
        inFlightAssigneeFetch = crmService.getAssignees();
      }

      inFlightAssigneeFetch
        .then((data) => {
          if (Array.isArray(data)) {
            setAssignees(data);
          }
        })
        .catch(() => {
          // Ignore non-critical assignee avatar failures
        })
        .finally(() => {
          inFlightAssigneeFetch = null;
        });
    }
  }, [isAdminOrHr]);

  const getAvatarUrl = useCallback(
    (userId?: string | null, name?: string | null): string | null => {
      // 1. Current user instant resolution
      if (userId && user?.id === userId && user?.avatar_url) {
        return user.avatar_url;
      }
      if (
        name &&
        user &&
        (user.full_name?.trim().toLowerCase() === name.trim().toLowerCase() ||
          user.name?.trim().toLowerCase() === name.trim().toLowerCase()) &&
        user.avatar_url
      ) {
        return user.avatar_url;
      }

      // 2. Lookup in loaded members list (admin / HR)
      if (isAdminOrHr) {
        const source = members.length > 0 ? members : adminService.getCachedMembers()?.data || [];
        if (userId) {
          const match = source.find((m) => m.id === userId);
          if (match?.avatar_url) return match.avatar_url;
        }
        if (name) {
          const clean = name.trim().toLowerCase();
          const match = source.find((m) => m.full_name?.trim().toLowerCase() === clean);
          if (match?.avatar_url) return match.avatar_url;
        }
      } else {
        // 3. Lookup in assignees list (non-admin)
        const source = assignees.length > 0 ? assignees : crmService.getCachedAssignees()?.data || [];
        if (userId) {
          const match = source.find((a) => a.id === userId);
          if (match?.avatar_url) return match.avatar_url;
        }
        if (name) {
          const clean = name.trim().toLowerCase();
          const match = source.find((a) => a.full_name?.trim().toLowerCase() === clean);
          if (match?.avatar_url) return match.avatar_url;
        }
      }

      return null;
    },
    [user, members, assignees, isAdminOrHr]
  );

  return { getAvatarUrl, members };
}
