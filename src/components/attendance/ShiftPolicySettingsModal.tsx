import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Edit2,
  Sliders,
} from 'lucide-react';
import type { ShiftTemplate } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { CustomTimePicker } from '../ui/CustomTimePicker';

interface ShiftPolicySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ShiftPolicySettingsModal: React.FC<ShiftPolicySettingsModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Shift Templates State
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [editingShift, setEditingShift] = useState<Partial<ShiftTemplate> | null>(null);

  // Fetch shifts
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        try {
          const fetchedShifts = await attendanceService.getShifts();
          if (fetchedShifts?.length) {
            setShifts(fetchedShifts);
          } else {
            // Default template initial state
            setShifts([
              {
                id: 'shift_std',
                name: 'Standard Shift (09:30 – 18:30)',
                code: 'standard',
                start_time: '09:30',
                end_time: '18:30',
                break_duration_minutes: 60,
                grace_period_minutes: 30,
                late_threshold_time: '10:00',
                is_cross_midnight: false,
                expected_work_hours: 8.0,
              },
              {
                id: 'shift_hr',
                name: 'HR Shift (09:00 – 18:00)',
                code: 'hr',
                start_time: '09:00',
                end_time: '18:00',
                break_duration_minutes: 60,
                grace_period_minutes: 30,
                late_threshold_time: '09:30',
                is_cross_midnight: false,
                expected_work_hours: 8.0,
              },
              {
                id: 'shift_aft',
                name: 'Afternoon Shift (14:00 – 20:00)',
                code: 'afternoon',
                start_time: '14:00',
                end_time: '20:00',
                break_duration_minutes: 30,
                grace_period_minutes: 30,
                late_threshold_time: '14:30',
                is_cross_midnight: false,
                expected_work_hours: 5.5,
              },
              {
                id: 'shift_ngt',
                name: 'Night Shift (22:00 – 06:00)',
                code: 'night',
                start_time: '22:00',
                end_time: '06:00',
                break_duration_minutes: 60,
                grace_period_minutes: 30,
                late_threshold_time: '22:30',
                is_cross_midnight: true,
                expected_work_hours: 7.0,
              },
            ]);
          }
        } catch (err: any) {
          // Keep defaults
        }
      };

      fetchData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Save Shift Template
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    const isTime = (t?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
    if (!isTime(editingShift.start_time) || !isTime(editingShift.end_time)) {
      addToast('Invalid Shift Time', 'Please provide start and end times in HH:MM format.', 'warning');
      return;
    }
    try {
      setIsSaving(true);
      const payload: Partial<ShiftTemplate> = {
        ...editingShift,
        name: editingShift.name?.trim(),
        code: editingShift.code?.trim().toLowerCase(),
        break_duration_minutes: Number(editingShift.break_duration_minutes) || 60,
        grace_period_minutes: Number(editingShift.grace_period_minutes) || 30,
        is_cross_midnight: Boolean(editingShift.is_cross_midnight),
      };
      if (payload.id && !payload.id.startsWith('new_')) {
        await attendanceService.updateShift(payload.id, payload);
      } else {
        delete payload.id;
        await attendanceService.createShift(payload);
      }
      addToast('Shift Template Updated', 'Shift logic applied successfully.', 'success');
      setEditingShift(null);
      const updated = await attendanceService.getShifts();
      setShifts(updated);
      onSuccess();
    } catch (err: any) {
        addToast('Error', 'Failed to save shift.', 'error');
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                Shift Profiles & Mathematical Rules
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Configure shift schedules, 30m grace buffers, and work hours
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6 text-xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-100">
                  Active Shift Schedules
                </h4>
                <p className="text-zinc-500">
                  Includes 30-minute grace buffer: arrivals &le; 30m are not late; arrivals &gt; 30m increment late strikes.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditingShift({
                    id: `new_${Date.now()}`,
                    name: 'New Custom Shift',
                    code: 'custom',
                    start_time: '10:00',
                    end_time: '19:00',
                    break_duration_minutes: 60,
                    grace_period_minutes: 30,
                    late_threshold_time: '10:30',
                    is_cross_midnight: false,
                    expected_work_hours: 8.0,
                  })
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold cursor-pointer transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Shift Template
              </button>
            </div>

            {/* Shift Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {shifts.map((shift) => (
                <div
                  key={shift.id || shift.name}
                  className="p-4 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {shift.name}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 uppercase">
                        {shift.code}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-zinc-500 font-mono text-[11px]">
                      <span>{shift.start_time} – {shift.end_time}</span>
                      <span>•</span>
                      <span>{shift.break_duration_minutes}m break</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                    <span className="text-[11px] text-zinc-400">
                      Grace: +{shift.grace_period_minutes || 30}m
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingShift(shift)}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-500 font-bold cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Inline Shift Edit Form */}
            {editingShift && (
              <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 space-y-4">
                <h4 className="font-bold text-indigo-950 dark:text-indigo-200 flex items-center justify-between">
                  <span>{editingShift.id?.startsWith('new_') ? 'Create Shift Template' : 'Edit Shift Template'}</span>
                  <button
                    type="button"
                    onClick={() => setEditingShift(null)}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </h4>

                <form onSubmit={handleSaveShift} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-600 dark:text-zinc-400 mb-1">Shift Name</label>
                      <input
                        type="text"
                        required
                        value={editingShift.name || ''}
                        onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-600 dark:text-zinc-400 mb-1">Code (slug)</label>
                      <input
                        type="text"
                        required
                        value={editingShift.code || ''}
                        onChange={(e) => setEditingShift({ ...editingShift, code: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <CustomTimePicker
                      label="Start Time"
                      required
                      value={editingShift.start_time || '09:30'}
                      onChange={(val) => setEditingShift({ ...editingShift, start_time: val })}
                    />
                    <CustomTimePicker
                      label="End Time"
                      required
                      value={editingShift.end_time || '18:30'}
                      onChange={(val) => setEditingShift({ ...editingShift, end_time: val })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-zinc-600 dark:text-zinc-400 mb-1">Break (Minutes)</label>
                      <input
                        type="number"
                        min="0"
                        max="180"
                        value={editingShift.break_duration_minutes ?? 60}
                        onChange={(e) => setEditingShift({ ...editingShift, break_duration_minutes: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-600 dark:text-zinc-400 mb-1">Grace Period (Minutes)</label>
                      <input
                        type="number"
                        min="0"
                        max="60"
                        value={editingShift.grace_period_minutes ?? 30}
                        onChange={(e) => setEditingShift({ ...editingShift, grace_period_minutes: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingShift(null)}
                      className="px-3 py-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save Shift'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
