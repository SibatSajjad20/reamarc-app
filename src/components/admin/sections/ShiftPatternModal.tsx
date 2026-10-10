import React, { useMemo, useState } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';
import type { AdminMember } from '../../../types/admin';
import type { DateShiftOverride, ShiftAssignment, ShiftTemplate, WeekdayShiftRule } from '../../../types/attendance';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import { Button } from '../../ui/button';
import { CustomSelect } from '../../ui/CustomSelect';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { cn } from '../../../lib/utils';
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

const DAY_ABBR = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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

  const toggleDayWfh = (key: string) => {
    const current = Boolean(weekdayRules[key]?.auto_wfh);
    setDay(key, { auto_wfh: !current });
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px] p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-canvas/40">
          <DialogTitle className="text-base font-semibold text-fg flex items-center gap-2">
            <Calendar size={18} className="text-accent-text" />
            <span>Week pattern — {memberName}</span>
          </DialogTitle>
          <DialogDescription className="text-caption text-fg-muted">
            Configure default weekly WFH schedule, custom shifts, and one-day overrides.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Day of Week Toggle Group (7 x 32px square toggles per §13.15.4) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-ui font-medium text-fg">
                Auto WFH Schedule (Toggle active days)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWeekdayRules(hybridWeekdayPreset(shifts))}
                  className="text-caption font-medium text-accent-text hover:underline cursor-pointer"
                >
                  Mon–Fri WFH
                </button>
                <span className="text-fg-faint">·</span>
                <button
                  type="button"
                  onClick={() => {
                    setWeekdayRules(emptyWeekdayRules());
                    setOverrides([]);
                  }}
                  className="text-caption text-fg-muted hover:text-fg cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {WEEKDAY_ROWS.map((day, idx) => {
                const rule = weekdayRules[day.key] || {};
                const isSelected = Boolean(rule.auto_wfh);

                return (
                  <button
                    key={day.key}
                    type="button"
                    title={`${day.label}: ${isSelected ? 'Auto WFH' : 'Office'}`}
                    onClick={() => toggleDayWfh(day.key)}
                    className={cn(
                      'w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold transition-colors border cursor-pointer select-none',
                      isSelected
                        ? 'bg-accent-soft text-accent-text border-accent-200'
                        : 'bg-surface text-fg-muted border-border hover:bg-hover hover:text-fg'
                    )}
                  >
                    {DAY_ABBR[idx]}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-fg-faint">
              Highlighted days automatically classify as WFH unless punched in at the office.
            </p>
          </div>

          {/* Weekday Shift Customization */}
          <div className="space-y-2">
            <label className="text-ui font-medium text-fg block">
              Day-by-Day Shift Assignments
            </label>
            <div className="space-y-1.5 border border-border rounded-lg p-2.5 bg-canvas/40">
              {WEEKDAY_ROWS.map((day) => {
                const rule = weekdayRules[day.key] || {};
                return (
                  <div
                    key={day.key}
                    className="grid grid-cols-[80px_1fr] gap-2 items-center text-xs py-1 px-1 rounded-md hover:bg-surface transition-colors"
                  >
                    <span className="font-medium text-fg">{day.label}</span>
                    <CustomSelect
                      size="sm"
                      value={rule.shift_id || ''}
                      onChange={(val) => setDay(day.key, { shift_id: val })}
                      options={options}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* One-Day Overrides */}
          <div className="space-y-2">
            <label className="text-ui font-medium text-fg block">
              One-Day Specific Overrides
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
              <CustomDatePicker value={overrideDate} onChange={setOverrideDate} placeholder="Date" />
              <CustomSelect value={overrideShiftId} onChange={setOverrideShiftId} options={options} placeholder="Shift" />
              <CustomSelect
                value={overrideWfh}
                onChange={(v) => setOverrideWfh(v as 'inherit' | 'on' | 'off')}
                options={[
                  { value: 'inherit', label: 'Inherit week pattern' },
                  { value: 'on', label: 'Force WFH' },
                  { value: 'off', label: 'Force office' },
                ]}
              />
              <Button
                type="button"
                variant="secondary"
                size="md"
                onClick={addOverride}
                disabled={!overrideDate}
                icon={Plus}
              >
                Add
              </Button>
            </div>

            {overrides.length > 0 && (
              <div className="space-y-1 pt-1">
                {overrides.map((row) => {
                  const shift = shifts.find((s) => s.id === row.shift_id);
                  return (
                    <div
                      key={row.date}
                      className="flex items-center justify-between rounded-md bg-surface border border-border px-3 py-1.5 text-caption font-numeric"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-fg font-medium">
                          {row.date} · {shift?.name || 'Default shift'}
                        </span>
                        {row.auto_wfh === true && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-soft text-accent-text border border-accent-pill-bd">
                            WFH
                          </span>
                        )}
                        {row.auto_wfh === false && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-subtle text-fg-muted border border-border">
                            Office
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOverrides((prev) => prev.filter((item) => item.date !== row.date))}
                        className="text-fg-muted hover:text-danger-fg transition-colors p-1"
                        aria-label="Remove override"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3.5 border-t border-border bg-canvas">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={saving}
            onClick={() =>
              onSave({
                shift_id: assignment?.shift_id || defaultShiftId,
                weekday_rules: weekdayRules,
                date_overrides: normalizeDateOverrides(overrides),
              })
            }
          >
            Save pattern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
