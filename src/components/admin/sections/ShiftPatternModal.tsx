import React, { useMemo, useState } from 'react';
import { Calendar, Clock, Plus, Trash2, X } from 'lucide-react';
import type { AdminMember } from '../../../types/admin';
import type { DateShiftOverride, ShiftAssignment, ShiftTemplate, WeekdayShiftRule } from '../../../types/attendance';
import { CustomSelect } from '../../ui/CustomSelect';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import {
  WEEKDAY_ROWS,
  emptyWeekdayRules,
  hybridWeekdayPreset,
  normalizeDateOverrides,
} from '../../../utils/shiftAssignment';

interface ShiftPatternModalProps {
  member: AdminMember;
  assignment?: ShiftAssignment;
  defaultShiftId: string;
  shifts: ShiftTemplate[];
  saving?: boolean;
  onClose: () => void;
  onSave: (payload: {
    shift_id: string;
    weekday_rules: Record<string, WeekdayShiftRule>;
    date_overrides: DateShiftOverride[];
  }) => void;
}

const shiftOptions = (shifts: ShiftTemplate[]) => [
  { value: '', label: 'Use default shift' },
  ...shifts.map((s) => ({
    value: s.id,
    label: `${s.name} (${s.start_time} – ${s.end_time})`,
  })),
];

export const ShiftPatternModal: React.FC<ShiftPatternModalProps> = ({
  member,
  assignment,
  defaultShiftId,
  shifts,
  saving,
  onClose,
  onSave,
}) => {
  const [weekdayRules, setWeekdayRules] = useState<Record<string, WeekdayShiftRule>>(() => ({
    ...emptyWeekdayRules(),
    ...(assignment?.weekday_rules || {}),
  }));
  const [overrides, setOverrides] = useState<DateShiftOverride[]>(assignment?.date_overrides || []);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideShiftId, setOverrideShiftId] = useState('');
  const [overrideWfh, setOverrideWfh] = useState<'inherit' | 'on' | 'off'>('inherit');

  const options = useMemo(() => shiftOptions(shifts), [shifts]);
  const memberName = member.full_name || (member as { name?: string }).name || 'Employee';

  const setDay = (key: string, patch: Partial<WeekdayShiftRule>) => {
    setWeekdayRules((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }));
  };

  const addOverride = () => {
    if (!overrideDate) return;
    setOverrides((prev) =>
      normalizeDateOverrides([
        ...prev.filter((row) => row.date !== overrideDate),
        {
          date: overrideDate,
          shift_id: overrideShiftId || null,
          auto_wfh: overrideWfh === 'inherit' ? null : overrideWfh === 'on',
        },
      ])
    );
    setOverrideDate('');
    setOverrideShiftId('');
    setOverrideWfh('inherit');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Week pattern — {memberName}
            </h3>
            <p className="text-[11px] text-zinc-500 mt-1">
              Weekdays default to auto WFH. Change any day, or add a one-day override. Punching in still records as office.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWeekdayRules(hybridWeekdayPreset(shifts))}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800"
          >
            Hybrid: WFH Mon–Fri
          </button>
          <button
            type="button"
            onClick={() => {
              setWeekdayRules(emptyWeekdayRules());
              setOverrides([]);
            }}
            className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
          >
            Clear pattern
          </button>
        </div>

        <div className="space-y-2">
          {WEEKDAY_ROWS.map((day) => {
            const rule = weekdayRules[day.key] || {};
            return (
              <div
                key={day.key}
                className="grid grid-cols-[72px_1fr_auto] gap-2 items-center rounded-xl border border-zinc-200/80 dark:border-zinc-800 px-3 py-2"
              >
                <div className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{day.label}</div>
                <CustomSelect
                  value={rule.shift_id || ''}
                  onChange={(val) => setDay(day.key, { shift_id: val })}
                  options={options}
                />
                <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.auto_wfh)}
                    onChange={(e) => setDay(day.key, { auto_wfh: e.target.checked })}
                    className="rounded border-zinc-300"
                  />
                  Auto WFH
                </label>
              </div>
            );
          })}
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            One-day overrides
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-end">
            <CustomDatePicker value={overrideDate} onChange={setOverrideDate} placeholder="Date" />
            <CustomSelect value={overrideShiftId} onChange={setOverrideShiftId} options={options} />
            <CustomSelect
              value={overrideWfh}
              onChange={(val) => setOverrideWfh(val as 'inherit' | 'on' | 'off')}
              options={[
                { value: 'inherit', label: 'WFH: keep weekday' },
                { value: 'on', label: 'Force WFH' },
                { value: 'off', label: 'Force office' },
              ]}
            />
            <button
              type="button"
              onClick={addOverride}
              disabled={!overrideDate}
              className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-[11px] font-bold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          </div>
          {overrides.length === 0 ? (
            <p className="text-[11px] text-zinc-400">No date overrides. Use this for “come in this Monday” or a one-off office Saturday.</p>
          ) : (
            <div className="space-y-1">
              {overrides.map((row) => {
                const shift = shifts.find((s) => s.id === row.shift_id);
                const wfhLabel = row.auto_wfh == null ? 'weekday WFH' : row.auto_wfh ? 'WFH' : 'office';
                return (
                  <div
                    key={row.date}
                    className="flex items-center justify-between rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 px-3 py-2 text-[11px]"
                  >
                    <span className="font-semibold font-numeric text-zinc-700 dark:text-zinc-200">
                      {row.date} · {shift?.name || 'Default shift'} · {wfhLabel}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOverrides((prev) => prev.filter((item) => item.date !== row.date))}
                      className="text-rose-500 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({
                shift_id: assignment?.shift_id || defaultShiftId,
                weekday_rules: weekdayRules,
                date_overrides: normalizeDateOverrides(overrides),
              })
            }
            className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save pattern'}
          </button>
        </div>
      </div>
    </div>
  );
};

