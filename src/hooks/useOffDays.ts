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

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

const surroundingMonths = (from = new Date()): MonthKey[] => {
  const months: MonthKey[] = [];
  for (let offset = -1; offset <= 2; offset += 1) {
    const d = new Date(from.getFullYear(), from.getMonth() + offset, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return months;
};

export function useOffDays(extraMonths?: MonthKey[]) {
  const [holidays, setHolidays] = useState<Set<string>>(new Set());
  const [workingSaturdays, setWorkingSaturdays] = useState<Set<string>>(new Set());
  const [holidayTitles, setHolidayTitles] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  const months = useMemo(() => {
    const base = surroundingMonths();
    const merged = [...base, ...(extraMonths || [])];
    const seen = new Set<string>();
    return merged.filter((m) => {
      const key = monthKey(m.year, m.month);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [extraMonths]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      months.map((m) =>
        attendanceService.getCalendarMonth(m.year, m.month).catch(() => ({
          events: [],
          holidays: [] as string[],
          working_saturdays: [] as string[],
        })),
      ),
    ).then((pages) => {
      if (cancelled) return;
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
      setHolidays(nextHolidays);
      setWorkingSaturdays(nextWorking);
      setHolidayTitles(nextTitles);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [months]);

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
