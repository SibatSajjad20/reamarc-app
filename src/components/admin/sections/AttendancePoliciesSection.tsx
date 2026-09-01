import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  X,
  Users,
  Search,
  TreePalm,
  Loader2,
} from 'lucide-react';
import { attendanceService } from '../../../services/attendanceService';
import { adminService } from '../../../services/adminService';
import { useToast } from '../../../context/ToastContext';
import type {
  ShiftTemplate,
  CompanyCalendarEvent,
  LeaveBalance,
  ShiftAssignment,
} from '../../../types/attendance';
import type { AdminMember } from '../../../types/admin';
import { CustomSelect } from '../../ui/CustomSelect';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { CustomTimePicker } from '../../ui/CustomTimePicker';
import { NumberStepper } from '../../ui/NumberStepper';
import { ToggleSwitch } from '../../ui/ToggleSwitch';
import { getAttendanceMinDate } from '../../../constants/attendance';
import { getDeptBadgeClass, getRoleBadgeClass } from '../../../utils/badgeStyles';
import { ShiftPatternModal } from './ShiftPatternModal';
import { hasWeekPattern, resolveAssignmentForDate, todayIsoLocal } from '../../../utils/shiftAssignment';

const timeToMinutes = (value?: string | null) => {
  if (!value) return 0;
  const [h, m] = String(value).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const computeNetExpectedHours = (
  start: string,
  end: string,
  breakMins: number,
  isNight?: boolean
) => {
  let startMins = timeToMinutes(start);
  let endMins = timeToMinutes(end);
  if (isNight || endMins <= startMins) endMins += 1440;
  const net = Math.max(0, endMins - startMins - (breakMins || 0));
  return Math.round((net / 60) * 100) / 100;
};

const withDerivedHours = (shift: ShiftTemplate, patch: Partial<ShiftTemplate> = {}): ShiftTemplate => {
  const next = { ...shift, ...patch };
  const expected = computeNetExpectedHours(
    next.start_time,
    next.end_time,
    next.break_duration_minutes || 0,
    Boolean(next.is_night_shift || next.is_cross_midnight)
  );
  next.expected_hours = expected;
  next.expected_work_hours = expected;
  next.is_night_shift = Boolean(next.is_night_shift || next.is_cross_midnight);
  next.is_cross_midnight = next.is_night_shift;
  if ((next.break_duration_minutes || 0) <= 0) {
    next.break_start_time = null;
    next.break_end_time = null;
  } else if (!next.break_start_time || !next.break_end_time) {
    const overnight = Boolean(next.is_night_shift || next.is_cross_midnight);
    next.break_start_time = next.break_start_time || (overnight ? '01:00' : '13:00');
    next.break_end_time = next.break_end_time || (overnight ? '02:00' : '14:00');
  }
  return next;
};

export const AttendancePoliciesSection: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'shifts' | 'calendar' | 'leaves'>('shifts');
  const [isSaving, setIsSaving] = useState(false);

  // Shift Templates State
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<ShiftTemplate | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);

  // Member Shift Assignments State
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<Record<string, string>>({});
  const [assignmentDocs, setAssignmentDocs] = useState<Record<string, ShiftAssignment>>({});
  const [patternMember, setPatternMember] = useState<AdminMember | null>(null);
  const [searchMemberQuery, setSearchMemberQuery] = useState('');
  const [isAssigning, setIsAssigning] = useState<Record<string, boolean>>({});
  const [pendingShiftChange, setPendingShiftChange] = useState<{
    member: AdminMember;
    newShiftId: string;
    newShiftName: string;
    currentShiftName: string;
  } | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [isLoadingRoster, setIsLoadingRoster] = useState(true);
  const [isLoadingLeaveBalances, setIsLoadingLeaveBalances] = useState(true);
  const [leaveDrafts, setLeaveDrafts] = useState<
    Record<string, { annual: string; sick: string; annualQuota: string; sickQuota: string }>
  >({});
  const [savingLeaveUserId, setSavingLeaveUserId] = useState<string | null>(null);

  // Calendar & Holidays State
  const [calendarEvents, setCalendarEvents] = useState<CompanyCalendarEvent[]>([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState(getAttendanceMinDate());
  const [newEventType, setNewEventType] = useState<'holiday' | 'working_saturday'>('holiday');
  const [newEventDesc, setNewEventDesc] = useState('');

  const applyShifts = (fetchedShifts: PromiseSettledResult<ShiftTemplate[]>) => {
    if (fetchedShifts.status === 'fulfilled' && fetchedShifts.value?.length) {
      setShifts(fetchedShifts.value);
      return;
    }
    setShifts([
      {
        id: 'standard_shift',
        name: 'Standard Shift (General Team)',
        code: 'STD',
        start_time: '09:30',
        end_time: '18:30',
        grace_period_minutes: 30,
        break_duration_minutes: 60,
        break_start_time: '13:00',
        break_end_time: '14:00',
        late_threshold_time: '10:00',
        is_cross_midnight: false,
        expected_work_hours: 8.0,
        expected_hours: 8.0,
      },
      {
        id: 'hr_shift',
        name: 'HR Department Shift',
        code: 'HR',
        start_time: '09:00',
        end_time: '18:00',
        grace_period_minutes: 30,
        break_duration_minutes: 60,
        break_start_time: '13:00',
        break_end_time: '14:00',
        late_threshold_time: '09:30',
        is_cross_midnight: false,
        expected_work_hours: 8.0,
        expected_hours: 8.0,
      },
      {
        id: 'afternoon_shift',
        name: 'Afternoon Shift',
        code: 'AFT',
        start_time: '14:00',
        end_time: '20:00',
        grace_period_minutes: 30,
        break_duration_minutes: 0,
        late_threshold_time: '14:30',
        is_cross_midnight: false,
        expected_work_hours: 6.0,
        expected_hours: 6.0,
        break_start_time: null,
        break_end_time: null,
      },
      {
        id: 'night_shift',
        name: 'Night Operations Shift',
        code: 'NGT',
        start_time: '22:00',
        end_time: '06:00',
        grace_period_minutes: 30,
        break_duration_minutes: 60,
        break_start_time: '01:00',
        break_end_time: '02:00',
        late_threshold_time: '22:30',
        is_cross_midnight: true,
        expected_work_hours: 7.0,
        expected_hours: 7.0,
      },
    ]);
  };

  const fetchRoster = async (showSpinner = false) => {
    if (showSpinner) setIsLoadingRoster(true);
    try {
      const [fetchedShifts, fetchedMembers, fetchedAssignments] = await Promise.allSettled([
        attendanceService.getShifts(),
        adminService.getMembers(),
        attendanceService.getShiftAssignments(),
      ]);

      applyShifts(fetchedShifts);

      if (fetchedMembers.status === 'fulfilled' && Array.isArray(fetchedMembers.value)) {
        setMembers(fetchedMembers.value.filter((m: AdminMember) => m.role !== 'client' && m.role !== 'admin'));
      }

      if (fetchedAssignments.status === 'fulfilled' && Array.isArray(fetchedAssignments.value)) {
        const map: Record<string, string> = {};
        const docs: Record<string, ShiftAssignment> = {};
        fetchedAssignments.value.forEach((a) => {
          if (a.user_id && a.shift_id) {
            map[a.user_id] = a.shift_id;
            docs[a.user_id] = a;
          }
        });
        setShiftAssignments(map);
        setAssignmentDocs(docs);
      }
    } finally {
      setIsLoadingRoster(false);
    }
  };

  const fetchSecondary = async () => {
    const targetYear = 2026;
    const targetMonth = 8;
    try {
      const fetchedCal = await attendanceService.getCalendarMonth(targetYear, targetMonth);
      if (fetchedCal?.events) {
        setCalendarEvents(fetchedCal.events);
      }
    } catch {
      setCalendarEvents([]);
    }

    try {
      setIsLoadingLeaveBalances(true);
      const balances = await attendanceService.getLeaveBalances();
      setLeaveBalances(balances);
      const drafts: Record<string, { annual: string; sick: string; annualQuota: string; sickQuota: string }> = {};
      balances.forEach((b) => {
        drafts[b.user_id] = {
          annual: String(b.annual_used_opening),
          sick: String(b.sick_used_opening),
          annualQuota: String(b.annual_entitled),
          sickQuota: String(b.sick_entitled),
        };
      });
      setLeaveDrafts(drafts);
    } catch {
      setLeaveBalances([]);
    } finally {
      setIsLoadingLeaveBalances(false);
    }
  };

  const fetchData = async () => {
    await Promise.all([fetchRoster(), fetchSecondary()]);
  };

  useEffect(() => {
    void fetchRoster(true);
    void fetchSecondary();
  }, []);

  const handleSaveLeaveOpening = async (userId: string) => {
    const draft = leaveDrafts[userId];
    if (!draft) return;
    try {
      setSavingLeaveUserId(userId);
      const updated = await attendanceService.updateLeaveOpening(userId, {
        annual_used_opening: Number(draft.annual) || 0,
        sick_used_opening: Number(draft.sick) || 0,
        annual_entitled: Number(draft.annualQuota) || 0,
        sick_entitled: Number(draft.sickQuota) || 0,
      });
      setLeaveBalances((prev) => prev.map((row) => (row.user_id === userId ? updated : row)));
      setLeaveDrafts((prev) => ({
        ...prev,
        [userId]: {
          annual: String(updated.annual_used_opening),
          sick: String(updated.sick_used_opening),
          annualQuota: String(updated.annual_entitled),
          sickQuota: String(updated.sick_entitled),
        },
      }));
      addToast('Leave balance saved', `${updated.user_name || 'Employee'} remaining: ${updated.annual_remaining} annual / ${updated.sick_remaining} sick.`, 'success');
    } catch (err: any) {
      addToast('Save failed', err?.message || 'Could not update leave opening balance.', 'error');
    } finally {
      setSavingLeaveUserId(null);
    }
  };

  const handleAssignUserShift = async (userId: string, shiftId: string) => {
    try {
      setIsAssigning((prev) => ({ ...prev, [userId]: true }));
      setShiftAssignments((prev) => ({ ...prev, [userId]: shiftId }));

      const saved = await attendanceService.assignShift({ user_id: userId, shift_id: shiftId });
      setAssignmentDocs((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], ...saved, user_id: userId, shift_id: shiftId },
      }));
      const targetShift = shifts.find((s) => s.id === shiftId);
      addToast(
        'Shift Assigned 🕒',
        `Assigned ${targetShift?.name || 'shift'} to employee successfully.`,
        'success'
      );
    } catch (err: any) {
      addToast('Assignment Failed', err.message || 'Failed to update user shift.', 'error');
      fetchData();
    } finally {
      setIsAssigning((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const handleInitiateShiftChange = (member: AdminMember, newShiftId: string) => {
    const isHRMember = member.department?.toUpperCase() === 'HR';
    const defaultShiftId = isHRMember
      ? (shifts.find((s) => s.code === 'HR' || s.name.includes('HR'))?.id || 'hr_shift')
      : (shifts.find((s) => s.code === 'STD' || s.name.includes('Standard'))?.id || 'standard_shift');

    const currentShiftId = shiftAssignments[member.id] || defaultShiftId;
    if (currentShiftId === newShiftId) return;

    const currentShiftObj = shifts.find((s) => s.id === currentShiftId);
    const newShiftObj = shifts.find((s) => s.id === newShiftId);

    setPendingShiftChange({
      member,
      newShiftId,
      newShiftName: newShiftObj ? `${newShiftObj.name} (${newShiftObj.start_time} - ${newShiftObj.end_time})` : newShiftId,
      currentShiftName: currentShiftObj ? `${currentShiftObj.name} (${currentShiftObj.start_time} - ${currentShiftObj.end_time})` : 'Department Default',
    });
  };

  const handleConfirmShiftChange = async () => {
    if (!pendingShiftChange) return;
    const { member, newShiftId } = pendingShiftChange;
    setPendingShiftChange(null);
    await handleAssignUserShift(member.id, newShiftId);
  };

  const memberDefaultShiftId = (member: AdminMember) => {
    const isHRMember = member.department?.toUpperCase() === 'HR';
    return isHRMember
      ? (shifts.find((s) => s.code === 'HR' || s.name.includes('HR'))?.id || 'hr_shift')
      : (shifts.find((s) => s.code === 'STD' || s.name.includes('Standard'))?.id || 'standard_shift');
  };

  const handleSavePattern = async (
    member: AdminMember,
    payload: {
      shift_id: string;
      weekday_rules: ShiftAssignment['weekday_rules'];
      date_overrides: ShiftAssignment['date_overrides'];
    }
  ) => {
    try {
      setIsAssigning((prev) => ({ ...prev, [member.id]: true }));
      const saved = await attendanceService.assignShift({
        user_id: member.id,
        shift_id: payload.shift_id || memberDefaultShiftId(member),
        weekday_rules: payload.weekday_rules,
        date_overrides: payload.date_overrides,
      });
      setShiftAssignments((prev) => ({ ...prev, [member.id]: saved.shift_id || payload.shift_id }));
      setAssignmentDocs((prev) => ({ ...prev, [member.id]: { ...saved, user_id: member.id } }));
      setPatternMember(null);
      addToast('Week pattern saved', `Updated weekday shifts and WFH for ${member.full_name || 'employee'}.`, 'success');
    } catch (err: any) {
      addToast('Pattern failed', err?.message || 'Could not save week pattern.', 'error');
    } finally {
      setIsAssigning((prev) => ({ ...prev, [member.id]: false }));
    }
  };

  const handleConfirmDeleteShift = async () => {
    if (!shiftToDelete) return;
    try {
      setIsDeletingShift(true);
      await attendanceService.deleteShift(shiftToDelete.id);
      addToast('Shift Deleted', `Shift template "${shiftToDelete.name}" was removed.`, 'success');
      setShiftToDelete(null);
      fetchData();
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Failed to delete shift template.', 'error');
    } finally {
      setIsDeletingShift(false);
    }
  };

  const filteredMembers = useMemo(() => {
    if (!searchMemberQuery.trim()) return members;
    const q = searchMemberQuery.toLowerCase();
    return members.filter(
      (m) =>
        (m.full_name || (m as any).name || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.department || '').toLowerCase().includes(q)
    );
  }, [members, searchMemberQuery]);

  // ─── Shift Template Handlers ───
  const handleOpenAddShift = () => {
    setEditingShift({
      id: '',
      name: '',
      code: '',
      shift_type: 'custom',
      start_time: '09:30',
      end_time: '18:30',
      grace_period_minutes: 30,
      overtime_buffer_minutes: 10,
      undertime_buffer_minutes: 10,
      break_duration_minutes: 60,
      break_start_time: '13:00',
      break_end_time: '14:00',
      late_threshold_time: '10:00',
      is_cross_midnight: false,
      expected_hours: 8.0,
      expected_work_hours: 8.0,
    });
    setIsShiftModalOpen(true);
  };

  const handleOpenEditShift = (shift: ShiftTemplate) => {
    setEditingShift(withDerivedHours({ ...shift }));
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    if (!editingShift.name.trim()) {
      addToast('Name Required', 'Please provide a shift name.', 'warning');
      return;
    }
    const isTime = (t?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
    if (!isTime(editingShift.start_time) || !isTime(editingShift.end_time)) {
      addToast('Invalid Time', 'Start and end times must be HH:MM (24-hour), e.g. 09:30.', 'warning');
      return;
    }
    if (
      (editingShift.break_duration_minutes || 0) > 0 &&
      (!isTime(editingShift.break_start_time) || !isTime(editingShift.break_end_time))
    ) {
      addToast('Invalid Time', 'Break start and end times must be HH:MM (24-hour).', 'warning');
      return;
    }

    try {
      setIsSaving(true);
      const payload = withDerivedHours(editingShift);
      const isNew = !payload.id || payload.id.startsWith('new_');
      if (isNew) {
        payload.shift_type = 'custom';
      }
      if (!isNew) {
        await attendanceService.updateShift(payload.id, payload);
      } else {
        await attendanceService.createShift(payload);
      }
      addToast('Shift Saved', `Shift template "${payload.name}" was saved.`, 'success');
      setIsShiftModalOpen(false);
      setEditingShift(null);
      fetchData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to save shift.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Calendar / Holiday Handlers ───
  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) {
      addToast('Title Required', 'Please specify a title for the holiday.', 'warning');
      return;
    }

    try {
      setIsSaving(true);
      await attendanceService.createCalendarEvent({
        title: newEventTitle.trim(),
        date: newEventDate,
        event_type: newEventType,
        is_off_day: newEventType === 'holiday',
        is_workday_override: newEventType === 'working_saturday',
        description: newEventDesc.trim(),
      });
      addToast('Holiday Added', `"${newEventTitle}" added to official company calendar.`, 'success');
      setIsEventModalOpen(false);
      setNewEventTitle('');
      setNewEventDesc('');
      fetchData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to add calendar event.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHoliday = async (eventId: string, title: string) => {
    if (!window.confirm(`Delete calendar event "${title}"?`)) return;
    try {
      await attendanceService.deleteCalendarEvent(eventId);
      addToast('Deleted', `Event "${title}" removed.`, 'success');
      fetchData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete event.', 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-zinc-50/50 dark:bg-[#0c0d12]">
      {/* Top Section Header & Controls */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-base font-bold text-zinc-950 dark:text-zinc-50">Shift & Attendance Policies</h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              Active
            </span>
          </div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
            Configure shift schedules, 30m grace buffers, public holidays, and leave quotas
          </p>
        </div>

        {/* Action button depending on tab */}
        <div className="flex items-center gap-2">
          {activeTab === 'shifts' && (
            <button
              type="button"
              onClick={handleOpenAddShift}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 hover:shadow-indigo-600/30 cursor-pointer select-none"
            >
              <Plus className="w-4 h-4" />
              <span>Add Shift Template</span>
            </button>
          )}

          {activeTab === 'calendar' && (
            <button
              type="button"
              onClick={() => {
                setNewEventDate(getAttendanceMinDate());
                setIsEventModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-600/20 hover:shadow-indigo-600/30 cursor-pointer select-none"
            >
              <Plus className="w-4 h-4" />
              <span>Add Holiday / Rest Day</span>
            </button>
          )}
        </div>
      </div>

      {/* Policy Navigation Subtabs Bar */}
      <div className="px-5 pt-3 border-b border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#10121a] flex gap-2 overflow-x-auto shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('shifts')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'shifts'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-zinc-50 dark:bg-[#0c0d12]'
              : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Shift Templates & Rules</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'calendar'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-zinc-50 dark:bg-[#0c0d12]'
              : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Company Calendar & Holidays</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('leaves')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'leaves'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-zinc-50 dark:bg-[#0c0d12]'
              : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <TreePalm className="w-4 h-4" />
          <span>Leave Quotas</span>
        </button>
      </div>

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
        {/* ─── TAB 1: SHIFT TEMPLATES ─── */}
        {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shifts.map((shift) => (
              <div
                key={shift.id || shift.name}
                className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 uppercase">
                      {shift.code || 'SHIFT'}
                    </span>
                    {shift.is_cross_midnight && (
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Night Shift
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-2">
                    {shift.name}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100 dark:border-zinc-800/60">
                  <div>
                    <span className="text-zinc-400">Shift Timings:</span>
                    <p className="font-mono font-bold text-zinc-800 dark:text-zinc-200">
                      {shift.start_time} &mdash; {shift.end_time}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-400">Grace Period:</span>
                    <p className="font-bold text-emerald-600 dark:text-emerald-400">
                      {shift.grace_period_minutes}m buffer
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-400">Meal Break:</span>
                    <p className="font-bold text-zinc-700 dark:text-zinc-300">
                      {shift.break_duration_minutes} mins
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-400">Expected Work:</span>
                    <p className="font-bold text-indigo-600 dark:text-indigo-400">
                      {shift.expected_hours ?? shift.expected_work_hours ?? 8.0} hrs/day
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShiftToDelete(shift)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 cursor-pointer transition-colors"
                    title="Delete Shift Template"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditShift(shift)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Shift</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ─── Employee Shift Assignment Table ─── */}
          <div className="rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs overflow-hidden mt-6">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Employee Shift Assignments
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Assign a default shift, or a weekday pattern (auto WFH Mon–Fri is editable). Today’s shift is what late and Daily Log use.
                </p>
              </div>

              {/* Search */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchMemberQuery}
                    onChange={(e) => setSearchMemberQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 dark:bg-[#0c0d12] border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Default Shift</th>
                    <th className="py-3 px-4">Today</th>
                    <th className="py-3 px-4">Pattern</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {isLoadingRoster ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-zinc-400">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                        Loading team members…
                      </td>
                    </tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-zinc-400">
                        No team members found.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => {
                      const isHRMember = member.department?.toUpperCase() === 'HR';
                      const defaultShiftId = isHRMember
                        ? (shifts.find((s) => s.code === 'HR' || s.name.includes('HR'))?.id || 'hr_shift')
                        : (shifts.find((s) => s.code === 'STD' || s.name.includes('Standard'))?.id || 'standard_shift');

                      const currentShiftId = shiftAssignments[member.id] || defaultShiftId;
                      const assignment = assignmentDocs[member.id];
                      const todayResolved = resolveAssignmentForDate(
                        assignment || { user_id: member.id, shift_id: currentShiftId },
                        todayIsoLocal()
                      );
                      const todayShift = shifts.find((s) => s.id === (todayResolved.shift_id || currentShiftId));
                      const patterned = hasWeekPattern(assignment);

                      return (
                        <tr key={member.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-zinc-900 dark:text-zinc-100">
                              {member.full_name || (member as any).name || 'User'}
                            </div>
                            <div className="text-[11px] text-zinc-400 font-mono">{member.email}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${getDeptBadgeClass(member.department)}`}>
                              {member.department || 'General'}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border capitalize ${getRoleBadgeClass(member.role)}`}>
                              {member.role?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 min-w-[220px]">
                            <CustomSelect
                              value={currentShiftId}
                              disabled={isAssigning[member.id]}
                              onChange={(val) => handleInitiateShiftChange(member, val)}
                              options={shifts.map((s) => ({
                                value: s.id,
                                label: `${s.name} (${s.start_time} - ${s.end_time})`,
                              }))}
                            />
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-[11px]">
                              {todayShift
                                ? `${todayShift.start_time} — ${todayShift.end_time}`
                                : '09:30 — 18:30'}
                            </div>
                            {todayResolved.auto_wfh && (
                              <div className="text-[10px] font-bold text-sky-600 dark:text-sky-400 mt-0.5">Auto WFH</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              disabled={isAssigning[member.id]}
                              onClick={() => setPatternMember(member)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                            >
                              {patterned ? 'Edit pattern' : 'Set pattern'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: COMPANY CALENDAR & HOLIDAYS ─── */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              Official Holidays & Working Saturday Overrides
            </h3>
            <span className="text-xs font-semibold text-zinc-400">
              Tracking starts from 19 Aug 2026
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendarEvents.length === 0 ? (
              <div className="col-span-full py-12 text-center text-zinc-400">
                No holidays or calendar events configured yet for this period.
              </div>
            ) : (
              calendarEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs flex items-start justify-between"
                >
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                      {evt.event_type}
                    </span>
                    <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      {evt.title}
                    </h4>
                    <p className="text-xs font-mono text-zinc-500">{evt.date}</p>
                    {evt.description && (
                      <p className="text-xs text-zinc-400 pt-1">{evt.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(evt.id, evt.title)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: LEAVE QUOTAS ─── */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 text-xs text-indigo-900 dark:text-indigo-200">
            Set each employee&apos;s annual and sick quota (total days for the year) and days already taken. Remaining = quota − taken − approved/pending in-app requests. Casual leave and 2–4h short leave deduct from annual.
          </div>
          {isLoadingLeaveBalances ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400 dark:text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading leave quotas...</span>
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-[#11131a]">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900/70 text-zinc-500">
                  <tr>
                    <th className="text-left font-bold px-4 py-3">Employee</th>
                    <th className="text-left font-bold px-3 py-3">Annual taken</th>
                    <th className="text-left font-bold px-3 py-3">Sick taken</th>
                    <th className="text-left font-bold px-3 py-3">Annual quota</th>
                    <th className="text-left font-bold px-3 py-3">Sick quota</th>
                    <th className="text-left font-bold px-3 py-3">Annual left</th>
                    <th className="text-left font-bold px-3 py-3">Sick left</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {leaveBalances.map((row) => {
                    const draft = leaveDrafts[row.user_id];
                    const annualTaken = Number(draft?.annual ?? row.annual_used_opening) || 0;
                    const sickTaken = Number(draft?.sick ?? row.sick_used_opening) || 0;
                    const annualQuota = Number(draft?.annualQuota ?? row.annual_entitled) || 0;
                    const sickQuota = Number(draft?.sickQuota ?? row.sick_entitled) || 0;
                    const annualLeft = Math.round((annualQuota - annualTaken - row.annual_used_in_app - row.annual_pending) * 100) / 100;
                    const sickLeft = Math.round((sickQuota - sickTaken - row.sick_used_in_app - row.sick_pending) * 100) / 100;
                    const patchDraft = (patch: Partial<{ annual: string; sick: string; annualQuota: string; sickQuota: string }>) =>
                      setLeaveDrafts((prev) => ({
                        ...prev,
                        [row.user_id]: {
                          annual: prev[row.user_id]?.annual ?? String(row.annual_used_opening),
                          sick: prev[row.user_id]?.sick ?? String(row.sick_used_opening),
                          annualQuota: prev[row.user_id]?.annualQuota ?? String(row.annual_entitled),
                          sickQuota: prev[row.user_id]?.sickQuota ?? String(row.sick_entitled),
                          ...patch,
                        },
                      }));
                    return (
                    <tr key={row.user_id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-zinc-800 dark:text-zinc-100">{row.user_name}</div>
                        <div className="text-zinc-400">{row.department}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.annual ?? String(row.annual_used_opening)}
                          onChange={(e) => patchDraft({ annual: e.target.value })}
                          className="w-24 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.sick ?? String(row.sick_used_opening)}
                          onChange={(e) => patchDraft({ sick: e.target.value })}
                          className="w-24 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.annualQuota ?? String(row.annual_entitled)}
                          onChange={(e) => patchDraft({ annualQuota: e.target.value })}
                          className="w-24 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.sickQuota ?? String(row.sick_entitled)}
                          onChange={(e) => patchDraft({ sickQuota: e.target.value })}
                          className="w-24 px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
                        />
                      </td>
                      <td className={`px-3 py-2 font-bold ${annualLeft <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-100'}`}>
                        {annualLeft}
                      </td>
                      <td className={`px-3 py-2 font-bold ${sickLeft <= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-800 dark:text-zinc-100'}`}>
                        {sickLeft}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={savingLeaveUserId === row.user_id}
                          onClick={() => handleSaveLeaveOpening(row.user_id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50"
                        >
                          {savingLeaveUserId === row.user_id ? 'Saving...' : 'Save'}
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* ─── DEDICATED SHIFT MODAL ─── */}
      {isShiftModalOpen && editingShift && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg shadow-2xl overflow-visible relative animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                {editingShift.id ? 'Edit Shift Template' : 'New Shift Template'}
              </h3>
              <button
                type="button"
                onClick={() => setIsShiftModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shift Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Standard 09:30-18:30"
                    value={editingShift.name}
                    onChange={(e) => setEditingShift({ ...editingShift, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                    Shift Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. STD or HR"
                    value={editingShift.code}
                    onChange={(e) => setEditingShift({ ...editingShift, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CustomTimePicker
                    label="Start Time"
                    required
                    value={editingShift.start_time}
                    onChange={(val) => setEditingShift(withDerivedHours(editingShift, { start_time: val }))}
                  />
                </div>
                <div>
                  <CustomTimePicker
                    label="End Time"
                    required
                    value={editingShift.end_time}
                    onChange={(val) => setEditingShift(withDerivedHours(editingShift, { end_time: val }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberStepper
                  label="OT buffer"
                  min={0}
                  max={60}
                  step={5}
                  unit="mins"
                  value={editingShift.overtime_buffer_minutes ?? 10}
                  onChange={(val) =>
                    setEditingShift({
                      ...editingShift,
                      overtime_buffer_minutes: val,
                    })
                  }
                />
                <NumberStepper
                  label="Early-out buffer"
                  min={0}
                  max={60}
                  step={5}
                  unit="mins"
                  value={editingShift.undertime_buffer_minutes ?? 10}
                  onChange={(val) =>
                    setEditingShift({
                      ...editingShift,
                      undertime_buffer_minutes: val,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <NumberStepper
                    label="Grace Buffer"
                    min={0}
                    max={120}
                    step={5}
                    unit="mins"
                    value={editingShift.grace_period_minutes}
                    onChange={(val) =>
                      setEditingShift({
                        ...editingShift,
                        grace_period_minutes: val,
                      })
                    }
                  />
                </div>

                <div>
                  <NumberStepper
                    label="Meal Break"
                    min={0}
                    max={180}
                    step={15}
                    unit="mins"
                    value={editingShift.break_duration_minutes}
                    onChange={(val) =>
                      setEditingShift(withDerivedHours(editingShift, { break_duration_minutes: val }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">
                    Expected Work
                  </label>
                  <div className="h-10 px-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {(editingShift.expected_hours ?? editingShift.expected_work_hours ?? 8).toFixed(2)} hrs
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1">
                    Shift span minus unpaid break
                  </p>
                </div>
              </div>

              {(editingShift.break_duration_minutes || 0) > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <CustomTimePicker
                    label="Break Starts"
                    required
                    value={editingShift.break_start_time || '13:00'}
                    onChange={(val) =>
                      setEditingShift({ ...editingShift, break_start_time: val })
                    }
                  />
                  <CustomTimePicker
                    label="Break Ends"
                    required
                    value={editingShift.break_end_time || '14:00'}
                    onChange={(val) =>
                      setEditingShift({ ...editingShift, break_end_time: val })
                    }
                  />
                </div>
              )}

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                <ToggleSwitch
                  checked={Boolean(editingShift.is_cross_midnight)}
                  onChange={(checked) =>
                    setEditingShift(
                      withDerivedHours(editingShift, {
                        is_cross_midnight: checked,
                        is_night_shift: checked,
                      })
                    )
                  }
                  label="Crosses midnight (Night Shift)"
                  description="Calculates positive duration across midnight (e.g. 22:00 to 06:00)"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DEDICATED HOLIDAY MODAL ─── */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md shadow-2xl overflow-visible relative animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 rounded-t-2xl flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Add Official Holiday / Event
              </h3>
              <button
                type="button"
                onClick={() => setIsEventModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateHoliday} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Holiday / Event Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day or Eid Holiday"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <CustomDatePicker
                    label="Date"
                    minDate={getAttendanceMinDate()}
                    value={newEventDate}
                    onChange={setNewEventDate}
                  />
                </div>

                <div>
                  <CustomSelect
                    label="Event Type"
                    value={newEventType}
                    onChange={(val) => setNewEventType(val as any)}
                    options={[
                      { value: 'holiday', label: 'Public Holiday (Off)' },
                      { value: 'working_saturday', label: 'Working Saturday' },
                    ]}
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional company notes..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsEventModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Adding...' : 'Add Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Shift Confirmation Modal ─── */}
      {shiftToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete Shift Template
              </h3>
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Are you sure you want to delete shift template <strong className="text-zinc-950 dark:text-zinc-100">"{shiftToDelete.name}"</strong>? This will remove this schedule from the system.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingShift}
                onClick={handleConfirmDeleteShift}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
              >
                {isDeletingShift ? 'Deleting...' : 'Delete Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {patternMember && (
        <ShiftPatternModal
          member={patternMember}
          assignment={assignmentDocs[patternMember.id]}
          defaultShiftId={memberDefaultShiftId(patternMember)}
          shifts={shifts}
          saving={Boolean(isAssigning[patternMember.id])}
          onClose={() => setPatternMember(null)}
          onSave={(payload) => handleSavePattern(patternMember, payload)}
        />
      )}

      {/* ─── Shift Change Confirmation Modal ─── */}
      {pendingShiftChange && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Confirm Shift Change
              </h3>
              <button
                type="button"
                onClick={() => setPendingShiftChange(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Are you sure you want to change designated shift for <strong className="text-zinc-950 dark:text-zinc-100">{pendingShiftChange.member.full_name || (pendingShiftChange.member as any).name}</strong>?
            </p>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200/70 dark:border-zinc-800 text-xs space-y-1">
              <div className="text-zinc-500">
                Current Shift: <span className="font-semibold text-zinc-800 dark:text-zinc-200">{pendingShiftChange.currentShiftName}</span>
              </div>
              <div className="text-indigo-600 dark:text-indigo-400 font-bold">
                New Shift: <span>{pendingShiftChange.newShiftName}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setPendingShiftChange(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShiftChange}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                Confirm Change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};