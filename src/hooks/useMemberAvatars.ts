import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import type { AdminMember } from '../types/admin';

let inFlightFetch: Promise<AdminMember[]> | null = null;

export function useMemberAvatars() {
  const { user } = useAuth();
  const [members, setMembers] = useState<AdminMember[]>(() => adminService.getCachedMembers()?.data || []);

  useEffect(() => {
    const cached = adminService.getCachedMembers()?.data;
    if (cached && cached.length > 0) {
      setMembers(cached);
      return;
    }

    if (!inFlightFetch) {
      inFlightFetch = adminService.getMembers({ is_active: true });
    }

    inFlightFetch
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
        inFlightFetch = null;
      });
  }, []);

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

      // 2. Lookup in loaded members list
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

      return null;
    },
    [user, members]
  );

  return { getAvatarUrl, members };
}
