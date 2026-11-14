import { api } from './api';
import { getModuleCache, setModuleCache } from './moduleCache';

type CalendarMonth = {
  holidays?: string[];
  working_saturdays?: string[];
};

export async function loadCalendarOffDays(year: number): Promise<{
  holidays: Set<string>;
  workingSaturdays: Set<string>;
}> {
  const key = `company-calendar:${year}`;
  const cached = getModuleCache<CalendarMonth>(key, 30 * 60 * 1000);
  const page =
    cached ||
    (await api<CalendarMonth>(`/company-calendar?year=${year}`).catch(() => ({
      holidays: [],
      working_saturdays: [],
    })));
  if (!cached) setModuleCache(key, page);
  return {
    holidays: new Set(page.holidays || []),
    workingSaturdays: new Set(page.working_saturdays || []),
  };
}
