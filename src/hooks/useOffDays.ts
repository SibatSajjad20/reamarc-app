import { useCallback, useEffect, useMemo, useState } from 'react';
import { attendanceService } from '../services/attendanceService';
import {
  classifyOffDay,
  nearestPastWorkdayIso,
  toIsoDate,
  type OffDayInfo,
} from '../utils/offDays';
import { registerCacheClearer } from '../utils/cacheBus';

interface MonthKey {
  year: number;
  month: number;
}

interface OffDaysCacheValue {
  holidays: string[];
  workingSaturdays: string[];
  holidayTitles: Record<string, string>;
  fetchedAt: number;
}

const offDaysCache = new Map<string, OffDaysCacheValue>();
registerCacheClearer(() => offDaysCache.clear());

export function useOffDays(extraMonths?: MonthKey[], companyId = 'unknown') {
  const cacheKey = `${companyId}:${(extraMonths || []).map((m) => `${m.year}-${m.month}`).join(',')}`;
  const cached = offDaysCache.get(cacheKey);
  const [holidays, setHolidays] = useState<Set<string>>(() => new Set(cached?.holidays || []));
  const [workingSaturdays, setWorkingSaturdays] = useState<Set<string>>(() => new Set(cached?.workingSaturdays || []));
  const [holidayTitles, setHolidayTitles] = useState<Record<string, string>>(() => cached?.holidayTitles || {});
  const [ready, setReady] = useState(Boolean(cached));

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear]);
    (extraMonths || []).forEach((m) => set.add(m.year));
    return Array.from(set);
  }, [extraMonths]);

  useEffect(() => {
    const warm = offDaysCache.get(cacheKey);
    if (warm && Date.now() - warm.fetchedAt < 60_000) {
      setHolidays(new Set(warm.holidays));
      setWorkingSaturdays(new Set(warm.workingSaturdays));
      setHolidayTitles(warm.holidayTitles);
      setReady(true);
      return;
    }
    let cancelled = false;
    Promise.all([
      ...years.map((y) =>
        attendanceService.getCalendarMonth(y).catch(() => ({
          events: [],
          holidays: [] as string[],
          working_saturdays: [] as string[],
        })),
      ),
      attendanceService.getMyWorkingOverrides().catch(() => [] as string[]),
    ]).then((results) => {
      if (cancelled) return;
      const myWorkingOverrides = results[results.length - 1] as string[];
      const pages = results.slice(0, results.length - 1) as Array<{
        events?: any[];
        holidays?: string[];
        working_saturdays?: string[];
      }>;

      const nextHolidays = new Set<string>();
      const nextWorking = new Set<string>();
      const nextTitles: Record<string, string> = {};
      pages.forEach((page) => {
        (page.holidays || []).forEach((d) => nextHolidays.add(d));
        (page.working_saturdays || []).forEach((d) => nextWorking.add(d));
        (page.events || []).forEach((ev) => {
          if (ev.event_type === 'holiday' || ev.is_off_day) {
            nextHolidays.add(ev.date);
            if (ev.title) nextTitles[ev.date] = ev.title;
          }
          if (ev.event_type === 'working_saturday' || ev.is_workday_override) {
            nextWorking.add(ev.date);
          }
        });
      });
      // Merge approved working-day overrides (e.g. rest day converted to working day via shift change)
      if (Array.isArray(myWorkingOverrides)) {
        myWorkingOverrides.forEach((d) => nextWorking.add(d));
      }

      setHolidays(nextHolidays);
      setWorkingSaturdays(nextWorking);
      setHolidayTitles(nextTitles);
      offDaysCache.set(cacheKey, {
        holidays: Array.from(nextHolidays),
        workingSaturdays: Array.from(nextWorking),
        holidayTitles: nextTitles,
        fetchedAt: Date.now(),
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [years, cacheKey]);

  const getOffDay = useCallback(
    (iso?: string | null): OffDayInfo => {
      if (!iso) return { isOff: false, label: 'Working day' };
      return classifyOffDay(iso, holidays, workingSaturdays, holidayTitles);
    },
    [holidays, workingSaturdays, holidayTitles],
  );

  const isOffDay = useCallback((iso?: string | null) => getOffDay(iso).isOff, [getOffDay]);

  const offDayDates = useMemo(() => Array.from(holidays), [holidays]);

  const lastWorkday = useCallback(
    (fromIso?: string, minIso?: string) =>
      nearestPastWorkdayIso(fromIso || toIsoDate(new Date()), holidays, workingSaturdays, minIso),
    [holidays, workingSaturdays],
  );

  return {
    ready,
    holidays,
    workingSaturdays,
    holidayTitles,
    offDayDates,
    getOffDay,
    isOffDay,
    lastWorkday,
  };
}
