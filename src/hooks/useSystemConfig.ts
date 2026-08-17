import { useState, useEffect, useCallback } from 'react';
import {
  systemConfigService,
  DEFAULT_DEPARTMENTS,
  DEFAULT_ROLES,
  type SystemRole,
} from '../services/systemConfigService';

export const useSystemConfig = () => {
  const [departments, setDepartments] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem('reamarc_departments');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return DEFAULT_DEPARTMENTS;
  });

  const [roles, setRoles] = useState<SystemRole[]>(() => {
    try {
      const cached = localStorage.getItem('reamarc_roles');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return DEFAULT_ROLES;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await systemConfigService.getConfig();
      if (data && data.departments) {
        setDepartments(data.departments);
        localStorage.setItem('reamarc_departments', JSON.stringify(data.departments));
      }
      if (data && data.roles) {
        setRoles(data.roles);
        localStorage.setItem('reamarc_roles', JSON.stringify(data.roles));
      }
    } catch (e) {
      console.error('Failed to fetch system config:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (newDepts: string[], newRoles: SystemRole[]) => {
    setDepartments(newDepts);
    setRoles(newRoles);
    localStorage.setItem('reamarc_departments', JSON.stringify(newDepts));
    localStorage.setItem('reamarc_roles', JSON.stringify(newRoles));

    try {
      await systemConfigService.updateConfig({
        departments: newDepts,
        roles: newRoles,
      });
    } catch (e) {
      console.error('Failed to persist system config to server:', e);
      throw e;
    }
  };

  return {
    departments,
    roles,
    isLoading,
    refetch: fetchConfig,
    saveConfig,
  };
};
