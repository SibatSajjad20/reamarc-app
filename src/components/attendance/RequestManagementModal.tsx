import React, { useState, useEffect } from 'react';
import {
  X,
  FilePlus,
  Clock,
  Home,
  Sparkles,
  Calendar,
  Info,
  AlertTriangle,
} from 'lucide-react';
import type {
  RequestType,
  LeaveCategory,
  CreateLeavePayload,
  AttendanceRecord,
  ShiftTemplate,
  LeaveBalance,
} from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';
import { CustomDatePicker } from '../ui/CustomDatePicker';
import { CustomTimePicker } from '../ui/CustomTimePicker';
import { getAttendanceMinDate, isFuturePktClockTime } from '../../constants/attendance';
import { useOffDays } from '../../hooks/useOffDays';
import { parseTimeToMinutes, formatHours } from '../../utils/logTimeChecks';

interface RequestManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultTab?: RequestType;
  initialRecord?: AttendanceRecord | null;
}

export const RequestManagementModal: React.FC<RequestManagementModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultTab = 'leave',
  initialRecord,
}) => {
  const { addToast } = useToast();
  const { isOffDay, getOffDay, lastWorkday } = useOffDays();
  const [activeTab, setActiveTab] = useState<RequestType>(defaultTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [minDate, setMinDate] = useState(getAttendanceMinDate());
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);

  // Today ISO string
  const getTodayIso = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getInitialWorkday = () => {
    const today = getTodayIso();
    return lastWorkday(today, minDate) || today;
  };

  // Current PKT time helper
  const getCurrentTimePkt = () => {
    const now = new Date();
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  };

  // Form State: Full Leave
  const [leaveCategory, setLeaveCategory] = useState<LeaveCategory>('annual');
  const [leaveStartDate, setLeaveStartDate] = useState(getTodayIso());
  const [leaveEndDate, setLeaveEndDate] = useState(getTodayIso());
  const [leaveReason, setLeaveReason] = useState('');

  // Form State: Short Leave
  const [shortLeaveDate, setShortLeaveDate] = useState(getTodayIso());
  const [shortLeaveStartTime, setShortLeaveStartTime] = useState(getCurrentTimePkt());
  const [shortLeaveDuration, setShortLeaveDuration] = useState(2.0);
  const [shortLeaveReason, setShortLeaveReason] = useState('');
  const [isLeavingEarly, setIsLeavingEarly] = useState(true);
  const [userShift, setUserShift] = useState<ShiftTemplate | null>(null);

  // Form State: WFH
  const [wfhStartDate, setWfhStartDate] = useState(getTodayIso());
  const [wfhEndDate, setWfhEndDate] = useState(getTodayIso());
  const [wfhReason, setWfhReason] = useState('');

  // Form State: Missed Punch Regularization
  const [regularizeDate, setRegularizeDate] = useState(getTodayIso());
  const [correctionTarget, setCorrectionTarget] = useState<'time_in' | 'time_out' | 'both'>('time_in');
  const [regularizeIn, setRegularizeIn] = useState('09:30');
  const [regularizeOut, setRegularizeOut] = useState('18:30');
  const [regularizeReason, setRegularizeReason] = useState('');

  // Sync tab & initial record on open
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(defaultTab);
    setCorrectionTarget('time_in');
    const initDate = getInitialWorkday();
    if (initialRecord?.date) {
      setRegularizeDate(initialRecord.date);
      setShortLeaveDate(initialRecord.date);
      const existingIn = initialRecord.punch_in || initialRecord.check_in;
      const existingOut = initialRecord.punch_out || initialRecord.check_out;
      if (existingIn) {
        setRegularizeIn(existingIn.substring(0, 5));
      }
      if (existingOut) {
        setRegularizeOut(existingOut.substring(0, 5));
        setShortLeaveStartTime(existingOut.substring(0, 5));
      }
      // Already checked in with no checkout: only fix time in so the day stays open.
      if (existingIn && !existingOut) {
        setCorrectionTarget('time_in');
      }
    } else {
      setLeaveStartDate(initDate);
      setLeaveEndDate(initDate);
      setShortLeaveDate(initDate);
      setWfhStartDate(initDate);
      setWfhEndDate(initDate);
      setRegularizeDate(initDate);
    }
    attendanceService
      .getAttendanceConfig()
      .then((c) => setMinDate(c.effective_start_date))
      .catch(() => setMinDate(getAttendanceMinDate()));
    attendanceService
      .getMyLeaveBalance()
      .then(setLeaveBalance)
      .catch(() => setLeaveBalance(null));
    attendanceService
      .getTodayStatus()
      .then((res) => {
        if (res?.shift) {
          setUserShift(res.shift);
        }
      })
      .catch(() => {});
  }, [isOpen, defaultTab, initialRecord]);

  // Derived shift and duration calculations for Short Leave
  const shiftEndTime = userShift?.end_time?.substring(0, 5) || '18:30';
  const departureMinutes = parseTimeToMinutes(shortLeaveStartTime);
  const shiftEndMinutes = parseTimeToMinutes(shiftEndTime) ?? (18 * 60 + 30);
  const earlyDepartureDiffMinutes =
    departureMinutes !== null && shiftEndMinutes !== null
      ? Math.max(0, shiftEndMinutes - departureMinutes)
      : 0;
  const autoCalculatedHours = Math.round((earlyDepartureDiffMinutes / 60) * 100) / 100;
  const autoDurationFormatted = formatHours(autoCalculatedHours);

  const midShiftStartMinutes = parseTimeToMinutes(shortLeaveStartTime) ?? (14 * 60);
  const midShiftReturnMinutes = (midShiftStartMinutes + Math.round(Number(shortLeaveDuration) * 60)) % (24 * 60);
  const midShiftReturnTime = `${String(Math.floor(midShiftReturnMinutes / 60)).padStart(2, '0')}:${String(
    midShiftReturnMinutes % 60
  ).padStart(2, '0')}`;

  if (!isOpen) return null;

  const countWorkingDays = (start: string, end: string): number => {
    if (!start) return 0;
    const endStr = end || start;
    const a = new Date(`${start}T00:00:00`);
    const b = new Date(`${endStr}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
    let count = 0;
    const cur = new Date(a);
    while (cur <= b) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${d}`;
      if (!isOffDay(iso)) {
        count += 1;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  };

  const leaveQuotaError = (): string | null => {
    if (activeTab === 'leave') {
      const workdays = countWorkingDays(leaveStartDate, leaveEndDate);
      if (workdays === 0) {
        return 'Selected leave date range contains no working days (all selected days are rest days or public holidays).';
      }
      if (leaveBalance) {
        if (leaveCategory === 'sick') {
          if (leaveBalance.sick_remaining < workdays) {
            return `Not enough sick leave remaining (${leaveBalance.sick_remaining} left, ${workdays} working day${workdays > 1 ? 's' : ''} requested).`;
          }
        }
        // Annual leaves allow exceeding quota; excess days result in negative quota settled at year-end.
      }
    } else if (activeTab === 'short_leave') {
      if (isOffDay(shortLeaveDate)) {
        return `Cannot request short leave on a non-working day (${getOffDay(shortLeaveDate).label}).`;
      }
      const dur = isLeavingEarly ? autoCalculatedHours : Number(shortLeaveDuration);
      if (dur < 0.5) {
        return isLeavingEarly
          ? `Departure time must be at least 30 minutes before your shift ends (${shiftEndTime}).`
          : 'Short leave duration must be at least 30 minutes (0.5 hours).';
      }
      if (dur > 4.0) {
        return `Short leave cannot exceed 4.0 hours (${dur}h requested). Please apply for a Full Leave.`;
      }
    } else if (activeTab === 'wfh') {
      const workdays = countWorkingDays(wfhStartDate, wfhEndDate);
      if (workdays === 0) {
        return 'Selected WFH date range contains no working days.';
      }
    } else if (activeTab === 'regularization') {
      if (isOffDay(regularizeDate)) {
        return `Cannot regularize punch on a non-working day (${getOffDay(regularizeDate).label}).`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      let payload: CreateLeavePayload;

      if (activeTab === 'leave') {
        if (!leaveReason.trim()) {
          addToast('Reason Required', 'Please provide a reason for the leave application.', 'warning');
          setIsSubmitting(false);
          return;
        }
        payload = {
          leave_type: leaveCategory,
          request_type: 'leave',
          leave_category: leaveCategory,
          start_date: leaveStartDate,
          end_date: leaveEndDate,
          reason: leaveReason.trim(),
        };
      } else if (activeTab === 'short_leave') {
        if (!shortLeaveReason.trim()) {
          addToast('Reason Required', 'Please provide a reason for short leave.', 'warning');
          setIsSubmitting(false);
          return;
        }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shortLeaveStartTime)) {
          addToast('Invalid Time', 'Departure / Start time must be HH:MM (24-hour), e.g. 16:00.', 'warning');
          setIsSubmitting(false);
          return;
        }
        const finalDuration = isLeavingEarly ? autoCalculatedHours : Number(shortLeaveDuration);
        if (finalDuration < 0.5) {
          addToast(
            'Invalid Duration',
            isLeavingEarly
              ? `Departure time must be at least 30 minutes before shift end (${shiftEndTime}).`
              : 'Short leave duration must be at least 30 minutes (0.5h).',
            'warning'
          );
          setIsSubmitting(false);
          return;
        }
        if (finalDuration > 4.0) {
          addToast('Duration Exceeded', 'Short leave cannot exceed 4.0 hours. Please apply for Full Leave.', 'warning');
          setIsSubmitting(false);
          return;
        }
        const finalEndTime = isLeavingEarly ? shiftEndTime : midShiftReturnTime;

        payload = {
          leave_type: 'short_leave',
          request_type: 'short_leave',
          start_date: shortLeaveDate,
          end_date: shortLeaveDate,
          short_leave_start_time: shortLeaveStartTime,
          short_leave_end_time: finalEndTime,
          short_leave_hours: finalDuration,
          short_leave_duration_hours: finalDuration,
          reason: shortLeaveReason.trim(),
        };
      } else if (activeTab === 'wfh') {
        if (!wfhReason.trim()) {
          addToast('Work Plan Required', 'Please specify your deliverables and reason for WFH.', 'warning');
          setIsSubmitting(false);
          return;
        }
        payload = {
          leave_type: 'wfh',
          request_type: 'wfh',
          start_date: wfhStartDate,
          end_date: wfhEndDate,
          reason: wfhReason.trim(),
        };
      } else {
        // regularization
        if (!regularizeReason.trim()) {
          addToast('Justification Required', 'Please describe why the punch was missed/incorrect.', 'warning');
          setIsSubmitting(false);
          return;
        }
        const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
        if ((correctionTarget === 'time_in' || correctionTarget === 'both') && !isTime(regularizeIn)) {
          addToast('Invalid Time', 'Time In must be HH:MM (24-hour), e.g. 09:30.', 'warning');
          setIsSubmitting(false);
          return;
        }
        if ((correctionTarget === 'time_out' || correctionTarget === 'both') && !isTime(regularizeOut)) {
          addToast('Invalid Time', 'Time Out must be HH:MM (24-hour), e.g. 18:30.', 'warning');
          setIsSubmitting(false);
          return;
        }
        if (
          (correctionTarget === 'time_out' || correctionTarget === 'both') &&
          isFuturePktClockTime(regularizeDate, regularizeOut)
        ) {
          addToast(
            'Time Out is still in the future',
            'That would check you out before you leave and hide overtime. Use Time In Only while you are still working.',
            'warning'
          );
          setIsSubmitting(false);
          return;
        }
        payload = {
          leave_type: 'missed_punch_regularization',
          request_type: 'regularization',
          start_date: regularizeDate,
          end_date: regularizeDate,
          regularization_date: regularizeDate,
          correction_target: correctionTarget,
          regularization_check_in: (correctionTarget === 'time_in' || correctionTarget === 'both') ? regularizeIn : undefined,
          regularization_check_out: (correctionTarget === 'time_out' || correctionTarget === 'both') ? regularizeOut : undefined,
          regularization_punch_in: (correctionTarget === 'time_in' || correctionTarget === 'both') ? regularizeIn : undefined,
          regularization_punch_out: (correctionTarget === 'time_out' || correctionTarget === 'both') ? regularizeOut : undefined,
          original_check_in: (initialRecord?.punch_in || initialRecord?.check_in || '').substring(0, 5) || undefined,
          original_check_out: (initialRecord?.punch_out || initialRecord?.check_out || '').substring(0, 5) || undefined,
          original_punch_in: (initialRecord?.punch_in || initialRecord?.check_in || '').substring(0, 5) || undefined,
          original_punch_out: (initialRecord?.punch_out || initialRecord?.check_out || '').substring(0, 5) || undefined,
          reason: regularizeReason.trim(),
        };
      }

      const blocked = leaveQuotaError();
      if (blocked) {
        addToast('Leave quota exceeded', blocked, 'error');
        setIsSubmitting(false);
        return;
      }

      await attendanceService.createRequest(payload);
      addToast('Request Submitted 🎉', 'Your request has been routed to HR / Team Lead for approval.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      addToast('Submission Failed', err.message || 'Could not submit attendance request.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCorrectionMode = defaultTab === 'regularization';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg shadow-2xl overflow-visible relative animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-xl ${
                isCorrectionMode
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
              }`}
            >
              {isCorrectionMode ? <Sparkles className="w-5 h-5" /> : <FilePlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isCorrectionMode ? 'Attendance Punch Correction' : 'Apply for Leave / WFH'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isCorrectionMode
                  ? 'Submit time in / time out corrections for HR, Operations, or Admin approval'
                  : 'Submit self-service requests for leaves, short leaves or remote work'}
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

        {/* Tab Navigation (Only displayed for Leave/WFH window) */}
        {!isCorrectionMode && (
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-[#161822] px-3 pt-2 gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('leave')}
              className={`px-3.5 py-2.5 rounded-t-xl transition-all cursor-pointer border-b-2 flex items-center gap-1.5 ${
                activeTab === 'leave'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#11131a]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Full Leave
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('short_leave')}
              className={`px-3.5 py-2.5 rounded-t-xl transition-all cursor-pointer border-b-2 flex items-center gap-1.5 ${
                activeTab === 'short_leave'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#11131a]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Short Leave (1-3h)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('wfh')}
              className={`px-3.5 py-2.5 rounded-t-xl transition-all cursor-pointer border-b-2 flex items-center gap-1.5 ${
                activeTab === 'wfh'
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-[#11131a]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              WFH Exemption
            </button>
          </div>
        )}

        {/* Tab Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* TAB 1: FULL LEAVE */}
          {activeTab === 'leave' && (
            <div className="space-y-4">
              {leaveBalance && (
                <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                  Remaining {leaveBalance.year}: <strong>{leaveBalance.annual_remaining}</strong> annual / <strong>{leaveBalance.sick_remaining}</strong> sick
                  <span className="block mt-1 text-zinc-500">Rest days & public holidays are not deducted. If annual leaves exceed quota, negative balance is settled at year-end (deducted from salary or reducing next year&apos;s quota).</span>
                </div>
              )}
              {leaveCategory === 'annual' && leaveBalance && leaveBalance.annual_remaining < countWorkingDays(leaveStartDate, leaveEndDate) && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs">
                  ⚠️ <strong>Quota Notice:</strong> This request requires {countWorkingDays(leaveStartDate, leaveEndDate)} day(s), which exceeds your remaining {leaveBalance.annual_remaining} annual days. Your balance will become negative ({Math.round((leaveBalance.annual_remaining - countWorkingDays(leaveStartDate, leaveEndDate)) * 100) / 100}d) and will be settled at year-end.
                </div>
              )}
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1.5">
                  Leave Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['annual', 'sick'] as LeaveCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLeaveCategory(cat)}
                      className={`py-2 px-3 rounded-xl font-bold capitalize transition-all border cursor-pointer ${
                        leaveCategory === cat
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-600 dark:text-blue-400 shadow-xs'
                          : 'bg-zinc-50 dark:bg-zinc-800/80 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {cat === 'annual' ? 'Annual Leave (14 allowed)' : 'Sick Leave (8 allowed)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CustomDatePicker
                    offDayMode="disable"
                    label="Start Date"
                    minDate={minDate}
                    value={leaveStartDate}
                    onChange={setLeaveStartDate}
                  />
                </div>
                <div>
                  <CustomDatePicker
                    offDayMode="disable"
                    label="End Date"
                    minDate={leaveStartDate || minDate}
                    value={leaveEndDate}
                    onChange={setLeaveEndDate}
                  />
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 flex items-center justify-between font-medium">
                <span>
                  Requested duration:{' '}
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {countWorkingDays(leaveStartDate, leaveEndDate)} working day(s)
                  </strong>
                </span>
                <span className="text-[10px] text-zinc-400">
                  (Sundays, 1st Saturdays & public holidays are free/excluded)
                </span>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason & Handover Notes
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain reason for leave and any task handovers or coverage..."
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                />
              </div>
            </div>
          )}

          {/* TAB 2: SHORT LEAVE */}
          {activeTab === 'short_leave' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-300 flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <p className="leading-tight">
                  Short leaves are approved for up to 4 hours. Hours not worked count as undertime. Every 8 hours of cumulative undertime deducts 1 day from your annual leave quota.
                </p>
              </div>

              {/* Leave Mode Selector: Leaving Early vs Mid-Shift */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsLeavingEarly(true)}
                  className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isLeavingEarly
                      ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Leaving Early (End of Day)
                </button>
                <button
                  type="button"
                  onClick={() => setIsLeavingEarly(false)}
                  className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    !isLeavingEarly
                      ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Mid-Shift (Returning)
                </button>
              </div>

              {isLeavingEarly ? (
                /* Mode 1: Leaving Early - Auto-calculated duration to shift end */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <CustomDatePicker
                        offDayMode="disable"
                        label="Date"
                        minDate={minDate}
                        value={shortLeaveDate}
                        onChange={setShortLeaveDate}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          Departure Time
                        </label>
                        {shortLeaveDate === getTodayIso() && (
                          <button
                            type="button"
                            onClick={() => setShortLeaveStartTime(getCurrentTimePkt())}
                            className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-0.5"
                          >
                            <Clock className="w-2.5 h-2.5" />
                            Leave Now ({getCurrentTimePkt()})
                          </button>
                        )}
                      </div>
                      <CustomTimePicker
                        required
                        value={shortLeaveStartTime}
                        onChange={setShortLeaveStartTime}
                      />
                    </div>
                  </div>

                  {/* Auto-Calculated Duration Card */}
                  <div className="p-3.5 rounded-xl bg-linear-to-br from-amber-50/70 to-orange-50/70 dark:from-amber-950/20 dark:to-orange-950/20 border border-amber-200/80 dark:border-amber-900/40">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          Undertime Added (until shift end {shiftEndTime})
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-extrabold font-numeric text-amber-700 dark:text-amber-400">
                            {earlyDepartureDiffMinutes > 0 ? autoDurationFormatted : '0h 00m'}
                          </span>
                          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 font-numeric">
                            ({autoCalculatedHours}h)
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/40">
                          +{earlyDepartureDiffMinutes > 0 ? autoDurationFormatted : '0m'} Undertime
                        </span>
                        <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-1">
                          8h total undertime = 1 annual leave
                        </p>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400 leading-tight">
                      Short leave authorizes your departure. The shortfall of <strong>{autoDurationFormatted}</strong> will be counted as undertime toward the 8h threshold.
                    </p>

                    {departureMinutes !== null && shiftEndMinutes !== null && departureMinutes >= shiftEndMinutes && (
                      <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Departure time ({shortLeaveStartTime}) is at or after shift end ({shiftEndTime}).
                      </p>
                    )}

                    {autoCalculatedHours > 4.0 && (
                      <p className="mt-2 text-[11px] text-rose-700 dark:text-rose-400 flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Short leave cannot exceed 4.0h. For absences over 4 hours, please submit a Full Leave request.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Mode 2: Mid-Shift - Discrete Duration Dropdown with return time estimate */
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <CustomDatePicker
                        offDayMode="disable"
                        label="Date"
                        minDate={minDate}
                        value={shortLeaveDate}
                        onChange={setShortLeaveDate}
                      />
                    </div>
                    <div>
                      <CustomTimePicker
                        label="Departure Time"
                        required
                        value={shortLeaveStartTime}
                        onChange={setShortLeaveStartTime}
                      />
                    </div>
                    <div>
                      <CustomSelect
                        label="Duration"
                        value={String(shortLeaveDuration)}
                        onChange={(e) => setShortLeaveDuration(Number(e))}
                        options={[
                          { value: '1', label: '1.0 Hour' },
                          { value: '1.5', label: '1.5 Hours' },
                          { value: '2', label: '2.0 Hours' },
                          { value: '2.5', label: '2.5 Hours' },
                          { value: '3', label: '3.0 Hours' },
                          { value: '4', label: '4.0 Hours (half day)' },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-between text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Expected Return to Desk: <strong className="text-zinc-800 dark:text-zinc-200 font-numeric">{midShiftReturnTime}</strong>
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">
                      Adds {shortLeaveDuration}h to undertime if not made up
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason for Short Leave
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder={
                    isLeavingEarly
                      ? 'Reason for leaving early today (e.g. medical appointment, urgent personal matter)...'
                      : 'Reason for temporary absence and return plan...'
                  }
                  value={shortLeaveReason}
                  onChange={(e) => setShortLeaveReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                />
              </div>
            </div>
          )}

          {/* TAB 3: WORK FROM HOME (WFH) */}
          {activeTab === 'wfh' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 text-blue-900 dark:text-blue-300 flex items-start gap-2">
                <Home className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
                <p className="leading-tight">
                  Approved WFH automatically grants security exemptions, enabling check-in from non-office IPs and GPS locations.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <CustomDatePicker
                    offDayMode="disable"
                    label="Start Date"
                    minDate={minDate}
                    value={wfhStartDate}
                    onChange={setWfhStartDate}
                  />
                </div>
                <div>
                  <CustomDatePicker
                    offDayMode="disable"
                    label="End Date"
                    minDate={wfhStartDate || minDate}
                    value={wfhEndDate}
                    onChange={setWfhEndDate}
                  />
                </div>
              </div>

              <div className="text-[11px] text-zinc-500 font-medium">
                <span>
                  WFH duration:{' '}
                  <strong className="text-zinc-800 dark:text-zinc-200">
                    {countWorkingDays(wfhStartDate, wfhEndDate)} working day(s)
                  </strong>
                </span>
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Deliverables & Work Plan
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Outline key tasks, deliverables, and communication availability for the remote day..."
                  value={wfhReason}
                  onChange={(e) => setWfhReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                />
              </div>
            </div>
          )}

          {/* TAB 4: MISSED PUNCH CORRECTION */}
          {activeTab === 'regularization' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <p className="leading-tight">
                  Punch time corrections recalculate your working hours, undertime, and punctuality record once approved.
                </p>
              </div>

              <div>
                <CustomDatePicker
                  offDayMode="disable"
                  label="Date of Missed / Incorrect Punch"
                  minDate={minDate}
                  value={regularizeDate}
                  onChange={setRegularizeDate}
                />
              </div>

              {/* Correction Scope Selector */}
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1.5 text-xs">
                  Correction Scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionTarget('time_in')}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all border text-center cursor-pointer ${
                      correctionTarget === 'time_in'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Time In Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrectionTarget('time_out')}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all border text-center cursor-pointer ${
                      correctionTarget === 'time_out'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Time Out Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setCorrectionTarget('both')}
                    className={`py-2 px-2.5 rounded-xl font-bold text-xs transition-all border text-center cursor-pointer ${
                      correctionTarget === 'both'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                        : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                    }`}
                  >
                    Both In & Out
                  </button>
                </div>
              </div>

              {(correctionTarget === 'both' || correctionTarget === 'time_out') && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-tight">
                    Including Time Out will check you out at that time. If your shift has not ended, HR will see you as already gone and overtime will be lost. Use <strong>Time In Only</strong> unless you have already left.
                  </p>
                </div>
              )}

              {/* Dynamic Time Pickers */}
              <div className={`grid ${correctionTarget === 'both' ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                {(correctionTarget === 'time_in' || correctionTarget === 'both') && (
                  <div>
                    <CustomTimePicker
                      label="Correct Time In (Check-In)"
                      required
                      value={regularizeIn}
                      onChange={setRegularizeIn}
                    />
                  </div>
                )}
                {(correctionTarget === 'time_out' || correctionTarget === 'both') && (
                  <div>
                    <CustomTimePicker
                      label="Correct Time Out (Check-Out)"
                      required
                      value={regularizeOut}
                      onChange={setRegularizeOut}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason / Justification for Correction
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why punch was missed or needs adjustment (e.g. power outage, client call, field meeting)..."
                  value={regularizeReason}
                  onChange={(e) => setRegularizeReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
                />
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 rounded-xl text-white font-bold shadow-md cursor-pointer disabled:opacity-50 transition-all ${
                isCorrectionMode
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
              }`}
            >
              {isSubmitting ? 'Submitting...' : isCorrectionMode ? 'Submit Correction' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

