import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  Calendar,
  Plus,
  Edit2,
  Trash2,
  X,
  Users,
  Search,
  TreePalm,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { PageHeader } from '../../ui/PageHeader';
import { Button, IconButton } from '../../ui/button';
import { focusFirstError } from '../../../utils/formFocus';
import { FormErrorSummaryButton } from '../../../hooks/useFormValidation';
import {
  TableCard,
  Table,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from '../../ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../ui/dialog';
import { cn } from '../../../lib/utils';
import { attendanceService } from '../../../services/attendanceService';
import { adminService } from '../../../services/adminService';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../ui/ConfirmProvider';
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
import { hasWeekPattern, resolveAssignmentForDate, todayIsoLocal, weekdayKeyFromIso } from '../../../utils/shiftAssignment';
import { formatHours } from '../../../utils/logTimeChecks';

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

interface AttendancePoliciesSectionProps {
  fixedTab?: 'shifts' | 'calendar' | 'leaves';
}

export const AttendancePoliciesSection: React.FC<AttendancePoliciesSectionProps> = ({ fixedTab }) => {
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<'shifts' | 'calendar' | 'leaves'>(fixedTab || 'shifts');
  const [isSaving, setIsSaving] = useState(false);

  // Shift Templates State
  const [shifts, setShifts] = useState<ShiftTemplate[]>([]);
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftToDelete, setShiftToDelete] = useState<ShiftTemplate | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);
  const shiftFormRef = useRef<HTMLFormElement>(null);
  const [shiftErrors, setShiftErrors] = useState<Record<string, string>>({});
  const [shiftServerError, setShiftServerError] = useState<string | null>(null);

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
  const eventFormRef = useRef<HTMLFormElement>(null);
  const [holidayErrors, setHolidayErrors] = useState<Record<string, string>>({});
  const [holidayServerError, setHolidayServerError] = useState<string | null>(null);

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
          if (a.user_id) {
            if (a.shift_id) map[a.user_id] = a.shift_id;
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
    const currentYear = new Date().getFullYear();
    try {
      const fetchedCal = await attendanceService.getCalendarMonth(currentYear);
      if (fetchedCal?.events) {
        setCalendarEvents(fetchedCal.events);
      }
    } catch {
      setCalendarEvents([]);
    }

    try {
      setIsLoadingLeaveBalances(true);
      const balances = await attendanceService.getLeaveBalances();
      if (Array.isArray(balances) && balances.length > 0) {
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
      }
    } catch (err) {
      console.error('[AttendancePolicies] Failed to load leave balances:', err);
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
        'Shift assigned',
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
    let list = members;
    if (searchMemberQuery.trim()) {
      const q = searchMemberQuery.toLowerCase();
      list = members.filter(
        (m) =>
          (m.full_name || (m as any).name || '').toLowerCase().includes(q) ||
          (m.email || '').toLowerCase().includes(q) ||
          (m.department || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      const deptA = (a.department || '').trim().toLowerCase();
      const deptB = (b.department || '').trim().toLowerCase();
      if (deptA !== deptB) {
        if (!deptA) return 1;
        if (!deptB) return -1;
        return deptA.localeCompare(deptB);
      }
      const nameA = (a.full_name || (a as any).name || '').trim().toLowerCase();
      const nameB = (b.full_name || (b as any).name || '').trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [members, searchMemberQuery]);

  const shiftUserMap = useMemo(() => {
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const assignedMap: Record<string, { memberName: string; scheduleLabel: string }[]> = {};
    const todayMap: Record<string, string[]> = {};

    shifts.forEach((s) => {
      assignedMap[s.id] = [];
      todayMap[s.id] = [];
    });

    members.forEach((member) => {
      const defaultShiftId = memberDefaultShiftId(member);
      const currentShiftId = shiftAssignments[member.id] || defaultShiftId;
      const assignment = assignmentDocs[member.id];
      const weekdayRules = assignment?.weekday_rules || {};

      const memberName = member.full_name || (member as any).name || member.email || 'User';

      // Check which shifts this member is scheduled for across the 7 days of the week (0=Mon ... 6=Sun)
      const dayMatchesPerShift: Record<string, number[]> = {};
      shifts.forEach((s) => {
        dayMatchesPerShift[s.id] = [];
      });

      for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
        const key = String(dayIndex);
        const rule = weekdayRules[key];
        const assignedDayShiftId =
          rule?.shift_id && rule.shift_id.trim() ? rule.shift_id.trim() : currentShiftId;

        shifts.forEach((s) => {
          if (assignedDayShiftId === s.id || (s.code && assignedDayShiftId === s.code)) {
            dayMatchesPerShift[s.id].push(dayIndex);
          }
        });
      }

      // Register member to all shifts they regularly work in weekly pattern / default (no one-off date overrides)
      shifts.forEach((s) => {
        const matchedDays = dayMatchesPerShift[s.id] || [];

        if (matchedDays.length > 0) {
          let scheduleLabel = '';
          if (matchedDays.length === 7) {
            scheduleLabel = 'Full week';
          } else if (matchedDays.length === 1 && matchedDays[0] === 5) {
            scheduleLabel = 'Saturdays';
          } else if (matchedDays.length === 5 && matchedDays.every((d, i) => d === i)) {
            scheduleLabel = 'Mon–Fri';
          } else {
            scheduleLabel = matchedDays.map((d) => DAY_NAMES[d]).join(', ');
          }

          if (!assignedMap[s.id]) assignedMap[s.id] = [];
          assignedMap[s.id].push({
            memberName,
            scheduleLabel,
          });
        }
      });

      // Today's recurring shift resolution (no one-off date overrides)
      const todayWeekday = weekdayKeyFromIso(todayIsoLocal());
      const todayRule = weekdayRules[todayWeekday];
      const todayShiftId =
        todayRule?.shift_id && todayRule.shift_id.trim() ? todayRule.shift_id.trim() : currentShiftId;

      shifts.forEach((s) => {
        if (todayShiftId === s.id || (s.code && todayShiftId === s.code)) {
          if (!todayMap[s.id]) todayMap[s.id] = [];
          todayMap[s.id].push(memberName);
        }
      });
    });

    return { assignedMap, todayMap };
  }, [shifts, members, shiftAssignments, assignmentDocs]);

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
      overtime_buffer_minutes: 5,
      undertime_buffer_minutes: 5,
      break_duration_minutes: 60,
      break_start_time: '13:00',
      break_end_time: '14:00',
      late_threshold_time: '10:00',
      is_cross_midnight: false,
      expected_hours: 8.0,
      expected_work_hours: 8.0,
    });
    setShiftErrors({});
    setShiftServerError(null);
    setIsShiftModalOpen(true);
  };

  const handleOpenEditShift = (shift: ShiftTemplate) => {
    setShiftErrors({});
    setShiftServerError(null);
    setEditingShift(withDerivedHours({ ...shift }));
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    setShiftServerError(null);

    const errs: Record<string, string> = {};
    if (!editingShift.name.trim()) {
      errs.name = 'Please provide a shift name.';
    }
    const isTime = (t?: string | null) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
    if (!isTime(editingShift.start_time) || !isTime(editingShift.end_time)) {
      errs.time = 'Start and end times must be HH:MM (24-hour), e.g. 09:30.';
    }
    if (
      (editingShift.break_duration_minutes || 0) > 0 &&
      (!isTime(editingShift.break_start_time) || !isTime(editingShift.break_end_time))
    ) {
      errs.break = 'Break start and end times must be HH:MM (24-hour).';
    }

    setShiftErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (shiftFormRef.current) focusFirstError(shiftFormRef.current);
      }, 50);
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
      setShiftServerError(err.message || 'Failed to save shift.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Calendar / Holiday Handlers ───
  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setHolidayServerError(null);

    const errs: Record<string, string> = {};
    if (!newEventTitle.trim()) {
      errs.title = 'Please specify a title for the holiday.';
    }

    setHolidayErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (eventFormRef.current) focusFirstError(eventFormRef.current);
      }, 50);
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
      setHolidayServerError(err.message || 'Failed to add calendar event.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteHoliday = async (eventId: string, title: string) => {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      confirmLabel: 'Delete event',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await attendanceService.deleteCalendarEvent(eventId);
      addToast('Deleted', `Event "${title}" removed.`, 'success');
      fetchData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to delete event.', 'error');
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden space-y-6">
      {/* Top Section Header */}
      <PageHeader
        title="Attendance policies"
        description="Shift schedules, working hours, employee assignments, and overtime/grace thresholds."
        actions={
          <div className="flex items-center gap-2">
            {activeTab === 'shifts' && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenAddShift}
                icon={Plus}
              >
                Add shift template
              </Button>
            )}

            {activeTab === 'calendar' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setNewEventDate(getAttendanceMinDate());
                  setIsEventModalOpen(true);
                }}
                icon={Plus}
              >
                Add holiday / event
              </Button>
            )}
          </div>
        }
      />

      {/* Policy Navigation Subtabs Bar */}
      {!fixedTab && (
        <div className="flex items-center gap-1 border-b border-border pb-px overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('shifts')}
            className={cn(
              'px-3.5 py-2 text-xs font-semibold rounded-t-md transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'shifts'
                ? 'border-accent text-accent-text bg-accent-soft-2'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-hover'
            )}
          >
            <Clock className="w-4 h-4" />
            <span>Shift patterns & rules</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={cn(
              'px-3.5 py-2 text-xs font-semibold rounded-t-md transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'calendar'
                ? 'border-accent text-accent-text bg-accent-soft-2'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-hover'
            )}
          >
            <Calendar className="w-4 h-4" />
            <span>Company calendar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('leaves');
              if (leaveBalances.length === 0 && !isLoadingLeaveBalances) {
                void fetchSecondary();
              }
            }}
            className={cn(
              'px-3.5 py-2 text-xs font-semibold rounded-t-md transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap cursor-pointer',
              activeTab === 'leaves'
                ? 'border-accent text-accent-text bg-accent-soft-2'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-hover'
            )}
          >
            <TreePalm className="w-4 h-4" />
            <span>Leave quotas</span>
          </button>
        </div>
      )}

      {/* Scrollable Content Container */}
      <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
        {/* ─── TAB 1: SHIFT TEMPLATES ─── */}
        {activeTab === 'shifts' && (
        <div className="space-y-4">
          {/* Card 1: Shift patterns table per §13.15.4 */}
          <TableCard>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-fg">Shift patterns</h3>
                <p className="text-caption text-fg-muted">
                  Configured shifts with working days, operating span and grace windows.
                </p>
              </div>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Shift name</TH>
                  <TH>Working days</TH>
                  <TH>Hours</TH>
                  <TH>Grace</TH>
                  <TH>Meal break</TH>
                  <TH>Members</TH>
                  <TH align="right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {shifts.map((shift) => {
                  const assignedUsers = shiftUserMap.assignedMap[shift.id] || [];
                  const assignedCount = assignedUsers.length;
                  return (
                    <TR key={shift.id || shift.name} className="hover:bg-hover transition-colors">
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{shift.name}</span>
                          {shift.code && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-fg-muted font-semibold">
                              {shift.code}
                            </span>
                          )}
                          {shift.is_cross_midnight && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                              Night shift
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-1">
                          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => {
                            const isWorkingDay = i < 5 || (i === 5 && shift.code !== 'STD');
                            return (
                              <span
                                key={i}
                                className={cn(
                                  'w-5 h-5 rounded text-[10px] flex items-center justify-center border select-none',
                                  isWorkingDay
                                    ? 'bg-accent-soft text-accent-text border-accent-200 font-semibold'
                                    : 'bg-canvas text-fg-faint border-border font-medium'
                                )}
                              >
                                {d}
                              </span>
                            );
                          })}
                        </div>
                      </TD>
                      <TD className="font-numeric text-ui tabular-nums text-fg">
                        {shift.start_time} — {shift.end_time}
                      </TD>
                      <TD className="font-numeric text-caption tabular-nums text-fg-muted">
                        {shift.grace_period_minutes}m
                      </TD>
                      <TD className="font-numeric text-caption tabular-nums text-fg-muted">
                        {(shift.break_duration_minutes || 0) > 0 ? `${shift.break_duration_minutes}m` : '—'}
                      </TD>
                      <TD className="text-caption text-fg-muted tabular-nums">
                        {assignedCount} {assignedCount === 1 ? 'member' : 'members'}
                      </TD>
                      <TD align="right">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label={`Edit ${shift.name}`}
                            icon={Edit2}
                            onClick={() => handleOpenEditShift(shift)}
                          />
                          <IconButton
                            variant="ghost"
                            size="sm"
                            label={`Delete ${shift.name}`}
                            icon={Trash2}
                            onClick={() => setShiftToDelete(shift)}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableCard>

          {/* ─── Employee Shift Assignment Table ─── */}
          <div className="rounded-xl bg-surface border border-border shadow-xs overflow-hidden mt-6">
            <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-border">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" />
                  Employee Shift Assignments
                </h3>

                {/* Search */}
                <div className="relative w-56 sm:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
                  <input
                    type="text"
                    placeholder="Search employee..."
                    value={searchMemberQuery}
                    onChange={(e) => setSearchMemberQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-md text-xs bg-surface border border-border-strong text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                  />
                </div>
              </div>
              <p className="text-xs text-fg-muted mt-1">
                Assign a default shift, or a weekday pattern (auto WFH Mon–Fri is editable). Today’s shift is what late and Daily Log use.
              </p>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-subtle border-b border-border text-fg-muted font-medium">
                  <tr>
                    <th className="py-2 px-4">Employee</th>
                    <th className="py-2 px-4">Department</th>
                    <th className="py-2 px-4">Role</th>
                    <th className="py-2 px-4">Default Shift</th>
                    <th className="py-2 px-4">Today</th>
                    <th className="py-2 px-4">Pattern</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {isLoadingRoster ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-fg-muted">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
                        Loading team members…
                      </td>
                    </tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-fg-muted">
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
                        <tr key={member.id} className="hover:bg-hover transition-colors">
                          <td className="py-2 px-4">
                            <div
                              className="font-medium text-fg truncate"
                              title={member.email || undefined}
                            >
                              {member.full_name || (member as any).name || 'User'}
                            </div>
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            <span className={getDeptBadgeClass(member.department)}>
                              {member.department || 'General'}
                            </span>
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            <span className={`${getRoleBadgeClass(member.role)} capitalize`}>
                              {member.role?.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-2 px-4 min-w-[220px]">
                            <CustomSelect
                              size="sm"
                              value={currentShiftId}
                              disabled={isAssigning[member.id]}
                              onChange={(val) => handleInitiateShiftChange(member, val)}
                              options={shifts.map((s) => ({
                                value: s.id,
                                label: `${s.name} (${s.start_time} - ${s.end_time})`,
                              }))}
                            />
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            <div className="font-numeric font-medium text-accent text-xs">
                              {todayShift
                                ? `${todayShift.start_time} — ${todayShift.end_time}`
                                : '09:30 — 18:30'}
                            </div>
                            {todayResolved.auto_wfh && (
                              <div className="text-[10px] font-medium text-info-fg">Auto WFH</div>
                            )}
                          </td>
                          <td className="py-2 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={isAssigning[member.id]}
                              onClick={() => setPatternMember(member)}
                              className="px-2.5 py-1 rounded-md text-xs font-medium border border-border text-fg-2 hover:bg-hover disabled:opacity-50 cursor-pointer transition-colors"
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

          {/* Card 3: Attendance rules per §13.15.4 */}
          <div className="border border-border rounded-xl bg-surface p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-fg">Attendance rules</h3>
              <p className="text-caption text-fg-muted">
                Grace tolerances, arrival thresholds, and policy cut triggers applied across all shifts.
              </p>
            </div>

            <div className="divide-y divide-border rounded-lg border border-border bg-canvas/40">
              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-ui font-medium text-fg">Standard grace buffer</div>
                  <div className="text-caption text-fg-muted">
                    Allowed arrival window after scheduled shift start before employee is marked late.
                  </div>
                </div>
                <span className="font-numeric text-ui font-semibold text-fg">30 minutes</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-ui font-medium text-fg">Late threshold</div>
                  <div className="text-caption text-fg-muted">
                    Arrival beyond grace period is automatically flagged as late punch on timesheets.
                  </div>
                </div>
                <span className="font-numeric text-ui font-semibold text-fg">Shift start + 30m</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-ui font-medium text-fg">Half-day threshold</div>
                  <div className="text-caption text-fg-muted">
                    Shifts under 4.0 worked hours or short leaves exceeding 2.0 hours deduct 0.5 day quota.
                  </div>
                </div>
                <span className="font-numeric text-ui font-semibold text-fg">4.0 hours</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-ui font-medium text-fg">Undertime deficit cut</div>
                  <div className="text-caption text-fg-muted">
                    Every 8.0 hours of cumulative monthly undertime triggers 1 full day quota deduction.
                  </div>
                </div>
                <span className="font-numeric text-ui font-semibold text-fg">8.0 hours</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: COMPANY CALENDAR & HOLIDAYS ─── */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-surface border border-border shadow-xs flex items-center justify-between">
            <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
              <Calendar className="w-4 h-4 text-accent" />
              Official Holidays & Working Saturday Overrides
            </h3>
            <span className="text-xs font-medium text-fg-muted">
              Tracking starts from <span className="font-numeric">19 Aug 2026</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {calendarEvents.length === 0 ? (
              <div className="col-span-full py-12 text-center text-fg-muted">
                No holidays or calendar events configured yet for this period.
              </div>
            ) : (
              calendarEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-4 rounded-xl bg-surface border border-border shadow-xs flex items-start justify-between"
                >
                  <div className="space-y-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium uppercase bg-warning-bg text-warning-fg border border-warning-bd">
                      {evt.event_type}
                    </span>
                    <h4 className="text-sm font-semibold text-fg">
                      {evt.title}
                    </h4>
                    <p className="text-xs font-numeric text-fg-muted">{evt.date}</p>
                    {evt.description && (
                      <p className="text-xs text-fg-muted pt-1">{evt.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteHoliday(evt.id, evt.title)}
                    className="p-1.5 rounded-md text-fg-muted hover:text-danger-fg hover:bg-hover transition-colors cursor-pointer"
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
          {isLoadingLeaveBalances ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-fg-muted">
              <Loader2 className="w-8 h-8 animate-spin text-accent" />
              <span className="text-sm font-medium text-fg-muted">Loading leave quotas...</span>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-subtle border-b border-border text-fg-muted font-medium">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Employee</th>
                    <th className="text-left font-medium px-3 py-3" title="Opening baseline taken before system go-live">Annual taken</th>
                    <th className="text-left font-medium px-3 py-3" title="Opening baseline taken before system go-live">Sick taken</th>
                    <th className="text-left font-medium px-3 py-3">Annual quota</th>
                    <th className="text-left font-medium px-3 py-3">Sick quota</th>
                    <th className="text-left font-medium px-3 py-3" title="Approved in-app requests plus HR leave overrides that have no matching leave request">In-app used</th>
                    <th className="text-left font-medium px-3 py-3" title="Days deducted from 8h cumulative undertime deficit">UT deducted</th>
                    <th className="text-left font-medium px-3 py-3" title="Carried undertime deficit towards next 8h cut">Carried deficit</th>
                    <th className="text-left font-medium px-3 py-3">Annual left</th>
                    <th className="text-left font-medium px-3 py-3">Sick left</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveBalances.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-fg-muted">
                        No employee leave quota records found.
                      </td>
                    </tr>
                  ) : (
                    leaveBalances.map((row) => {
                    const draft = leaveDrafts[row.user_id];
                    const annualTaken = Number(draft?.annual ?? row.annual_used_opening) || 0;
                    const sickTaken = Number(draft?.sick ?? row.sick_used_opening) || 0;
                    const annualQuota = Number(draft?.annualQuota ?? row.annual_entitled) || 0;
                    const sickQuota = Number(draft?.sickQuota ?? row.sick_entitled) || 0;
                    const inAppAnnual = Number(row.annual_used_in_app) || 0;
                    const inAppSick = Number(row.sick_used_in_app) || 0;
                    const utDeducted = Number(row.undertime_days_deducted) || 0;
                    const carriedHours = Number(row.carried_undertime_hours) || 0;
                    const annualLeft = Math.round((annualQuota - annualTaken - inAppAnnual - utDeducted - (row.annual_pending || 0)) * 100) / 100;
                    const sickLeft = Math.round((sickQuota - sickTaken - inAppSick - (row.sick_pending || 0)) * 100) / 100;
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
                    <tr key={row.user_id} className="border-t border-border hover:bg-hover transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-fg">{row.user_name}</div>
                        <div className="text-fg-muted">{row.department}</div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.annual ?? String(row.annual_used_opening)}
                          onChange={(e) => patchDraft({ annual: e.target.value })}
                          className="w-20 px-2 py-1.5 rounded-md bg-surface border border-border-strong text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.sick ?? String(row.sick_used_opening)}
                          onChange={(e) => patchDraft({ sick: e.target.value })}
                          className="w-20 px-2 py-1.5 rounded-md bg-surface border border-border-strong text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.annualQuota ?? String(row.annual_entitled)}
                          onChange={(e) => patchDraft({ annualQuota: e.target.value })}
                          className="w-20 px-2 py-1.5 rounded-md bg-surface border border-border-strong text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={draft?.sickQuota ?? String(row.sick_entitled)}
                          onChange={(e) => patchDraft({ sickQuota: e.target.value })}
                          className="w-20 px-2 py-1.5 rounded-md bg-surface border border-border-strong text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                      </td>
                      <td className="px-3 py-2 text-fg-2">
                        <div className="font-medium">{inAppAnnual}a / {inAppSick}s</div>
                        {(row.annual_pending > 0 || row.sick_pending > 0) && (
                          <div className="text-[10px] text-warning-fg font-medium">
                            +{row.annual_pending}a / +{row.sick_pending}s pend
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className={`font-semibold ${utDeducted > 0 ? 'text-warning-fg' : 'text-fg-muted'}`}>
                          {utDeducted > 0 ? `${utDeducted}d` : '0d'}
                        </div>
                        {utDeducted > 0 && (
                          <div className="text-[10px] text-warning-fg font-medium">
                            -{formatHours(utDeducted * 8)} settled
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className={`font-medium ${carriedHours > 0 ? 'text-fg' : 'text-fg-muted'}`}>
                          {formatHours(carriedHours)}
                        </div>
                        <div className="text-[10px] text-fg-muted">
                          {carriedHours > 0 ? `${formatHours(8 - carriedHours)} to next 1d cut` : 'Clean'}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-semibold ${annualLeft < 0 ? 'text-danger-fg' : annualLeft === 0 ? 'text-fg-muted' : 'text-success-fg'}`}>
                            {annualLeft}
                          </span>
                          {annualLeft < 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-bg text-danger-fg border border-danger-bd whitespace-nowrap">
                              Exceeded {Math.abs(annualLeft)}d
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`px-3 py-2 font-semibold ${sickLeft <= 0 ? 'text-danger-fg' : 'text-fg'}`}>
                        {sickLeft}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          disabled={savingLeaveUserId === row.user_id}
                          onClick={() => handleSaveLeaveOpening(row.user_id)}
                          className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white font-medium disabled:opacity-50 transition-colors"
                        >
                          {savingLeaveUserId === row.user_id ? 'Saving...' : 'Save'}
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
          )}
        </div>
      )}

      </div>

      {/* ─── DEDICATED SHIFT MODAL ─── */}
      {/* ─── DEDICATED SHIFT MODAL (Dialog 560) ─── */}
      <Dialog open={isShiftModalOpen && Boolean(editingShift)} onOpenChange={(open) => !open && setIsShiftModalOpen(false)}>
        {editingShift && (
          <DialogContent className="max-w-[560px] p-0 overflow-hidden">
            <DialogHeader className="p-6 pb-4 border-b border-border bg-canvas/40">
              <DialogTitle className="text-base font-semibold text-fg flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent-text" />
                <span>{editingShift.id ? 'Edit shift template' : 'New shift template'}</span>
              </DialogTitle>
              <DialogDescription className="text-caption text-fg-muted">
                Define timing bounds, grace period, meal break duration and night shift status.
              </DialogDescription>
            </DialogHeader>

            <form ref={shiftFormRef} noValidate onSubmit={handleSaveShift}>
              <div className="p-6 space-y-4 text-xs max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-ui font-medium text-fg mb-1">
                      Shift Name *
                    </label>
                    <input
                      type="text"
                      required
                      aria-invalid={!!shiftErrors.name}
                      placeholder="e.g. Standard 09:30-18:30"
                      value={editingShift.name}
                      onChange={(e) => {
                        setEditingShift({ ...editingShift, name: e.target.value });
                        if (shiftErrors.name) setShiftErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
                      }}
                      className={cn(
                        'w-full h-9 px-3 rounded-md bg-surface border text-fg text-ui focus:outline-none focus:border-accent',
                        shiftErrors.name ? 'border-danger-bd ring-1 ring-danger-bd' : 'border-border'
                      )}
                    />
                    {shiftErrors.name && (
                      <p className="mt-1 text-xs text-danger-fg flex items-center gap-1" role="alert">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>{shiftErrors.name}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-ui font-medium text-fg mb-1">
                      Shift Code
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. STD or HR"
                      value={editingShift.code}
                      onChange={(e) => setEditingShift({ ...editingShift, code: e.target.value })}
                      className="w-full h-9 px-3 rounded-md bg-surface border border-border text-fg text-ui font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <CustomTimePicker
                      label="Start Time"
                      required
                      error={shiftErrors.time}
                      value={editingShift.start_time}
                      onChange={(val) => {
                        setEditingShift(withDerivedHours(editingShift, { start_time: val }));
                        if (shiftErrors.time) setShiftErrors((prev) => { const n = { ...prev }; delete n.time; return n; });
                      }}
                    />
                  </div>
                  <div>
                    <CustomTimePicker
                      label="End Time"
                      required
                      error={shiftErrors.time}
                      value={editingShift.end_time}
                      onChange={(val) => {
                        setEditingShift(withDerivedHours(editingShift, { end_time: val }));
                        if (shiftErrors.time) setShiftErrors((prev) => { const n = { ...prev }; delete n.time; return n; });
                      }}
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
                    value={editingShift.overtime_buffer_minutes ?? 5}
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
                    value={editingShift.undertime_buffer_minutes ?? 5}
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
                    <label className="block text-xs font-medium text-fg-muted uppercase mb-1">
                      Expected Work
                    </label>
                    <div className="h-9 px-3 rounded-md bg-canvas border border-border flex items-center text-sm font-semibold font-numeric text-fg">
                      {formatHours(editingShift.expected_hours ?? editingShift.expected_work_hours ?? 8)}
                    </div>
                  </div>
                </div>

                {(editingShift.break_duration_minutes || 0) > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <CustomTimePicker
                      label="Break Starts"
                      required
                      error={shiftErrors.break}
                      value={editingShift.break_start_time || '13:00'}
                      onChange={(val) => {
                        setEditingShift({ ...editingShift, break_start_time: val });
                        if (shiftErrors.break) setShiftErrors((prev) => { const n = { ...prev }; delete n.break; return n; });
                      }}
                    />
                    <CustomTimePicker
                      label="Break Ends"
                      required
                      error={shiftErrors.break}
                      value={editingShift.break_end_time || '14:00'}
                      onChange={(val) => {
                        setEditingShift({ ...editingShift, break_end_time: val });
                        if (shiftErrors.break) setShiftErrors((prev) => { const n = { ...prev }; delete n.break; return n; });
                      }}
                    />
                  </div>
                )}

                <div className="p-3 rounded-lg bg-canvas border border-border">
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
              </div>

              <DialogFooter className="px-6 py-3.5 border-t border-border bg-canvas flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {Object.keys(shiftErrors).length > 1 && (
                    <FormErrorSummaryButton
                      count={Object.keys(shiftErrors).length}
                      onClick={() => shiftFormRef.current && focusFirstError(shiftFormRef.current)}
                    />
                  )}
                  {shiftServerError && (
                    <p className="text-xs text-danger-fg flex items-center gap-1.5" role="alert">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{shiftServerError}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsShiftModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={isSaving}
                    disabled={isSaving}
                  >
                    Save shift
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>

      {/* ─── DEDICATED HOLIDAY MODAL ─── */}
      {isEventModalOpen && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border w-full max-w-md shadow-lg overflow-visible relative animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-border rounded-t-xl flex items-center justify-between">
              <h3 className="text-base font-semibold text-fg flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" />
                Add Official Holiday / Event
              </h3>
              <button
                type="button"
                onClick={() => setIsEventModalOpen(false)}
                className="text-fg-muted hover:text-fg p-1.5 rounded-md hover:bg-hover cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form ref={eventFormRef} noValidate onSubmit={handleCreateHoliday} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-fg mb-1">
                  Holiday / Event Name *
                </label>
                <input
                  type="text"
                  required
                  aria-invalid={!!holidayErrors.title}
                  placeholder="e.g. Independence Day or Eid Holiday"
                  value={newEventTitle}
                  onChange={(e) => {
                    setNewEventTitle(e.target.value);
                    if (holidayErrors.title) setHolidayErrors((prev) => { const n = { ...prev }; delete n.title; return n; });
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-md bg-surface border text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent',
                    holidayErrors.title ? 'border-danger-bd ring-1 ring-danger-bd' : 'border-border-strong'
                  )}
                />
                {holidayErrors.title && (
                  <p className="mt-1 text-xs text-danger-fg flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{holidayErrors.title}</span>
                  </p>
                )}
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
                <label className="block font-medium text-fg mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional company notes..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-surface border border-border-strong text-fg placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-border">
                <div>
                  {holidayServerError && (
                    <p className="text-xs text-danger-fg flex items-center gap-1.5" role="alert">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{holidayServerError}</span>
                    </p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEventModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-md text-fg-2 hover:bg-hover border border-border font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-white font-medium cursor-pointer disabled:opacity-50"
                  >
                    {isSaving ? 'Adding...' : 'Add Event'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Shift Confirmation Modal ─── */}
      {shiftToDelete && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border w-full max-w-sm p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-danger-fg flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                Delete Shift Template
              </h3>
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fg-2 leading-relaxed">
              Are you sure you want to delete shift template <strong className="text-fg font-semibold">"{shiftToDelete.name}"</strong>? This will remove this schedule from the system.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShiftToDelete(null)}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium text-fg-2 hover:bg-hover border border-border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingShift}
                onClick={handleConfirmDeleteShift}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-danger-solid hover:opacity-90 text-white cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border w-full max-w-sm p-6 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-accent flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Confirm Shift Change
              </h3>
              <button
                type="button"
                onClick={() => setPendingShiftChange(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fg-2 leading-relaxed">
              Are you sure you want to change designated shift for <strong className="text-fg font-semibold">{pendingShiftChange.member.full_name || (pendingShiftChange.member as any).name}</strong>?
            </p>

            <div className="p-3 rounded-lg bg-subtle border border-border text-xs space-y-1">
              <div className="text-fg-muted">
                Current Shift: <span className="font-medium text-fg">{pendingShiftChange.currentShiftName}</span>
              </div>
              <div className="text-accent font-medium">
                New Shift: <span>{pendingShiftChange.newShiftName}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setPendingShiftChange(null)}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium text-fg-2 hover:bg-hover border border-border cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmShiftChange}
                className="px-3.5 py-1.5 rounded-md text-xs font-medium bg-accent hover:bg-accent-hover text-white cursor-pointer"
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
