import { useCallback, useEffect, useMemo, useState } from 'react';
import { attendanceService } from '../services/attendanceService';
import {
  classifyOffDay,
  nearestPastWorkdayIso,
  toIsoDate,
  type OffDayInfo,
} from '../utils/offDays';

interface MonthKey {
  year: number;
  month: number;
}

export function useOffDays(extraMonths?: MonthKey[]) {
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [workingSaturdays, setWorkingSaturdays] = useState<Set<string>>(new Set());
  const [holidayTitles, setHolidayTitles] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<number>([currentYear]);
    (extraMonths || []).forEach((m) => set.add(m.year));
    return Array.from(set);
  }, [extraMonths]);

  useEffect(() => {
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
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [years]);

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
