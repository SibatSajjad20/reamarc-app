import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  FilePlus,
  Clock,
  Home,
  Calendar,
  AlertTriangle,
  AlertCircle,
  FileEdit,
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
import { Button } from '../ui/button';
import { Callout } from '../ui/Callout';
import { cn } from '../../lib/utils';
import { getAttendanceMinDate, isFuturePktClockTime } from '../../constants/attendance';
import { useOffDays } from '../../hooks/useOffDays';
import { parseTimeToMinutes, formatHours } from '../../utils/logTimeChecks';
import { focusFirstError } from '../../utils/formFocus';
import { FormErrorSummaryButton } from '../../hooks/useFormValidation';

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

  const getInitialWorkday = useCallback(() => {
    const today = getTodayIso();
    return lastWorkday(today, minDate) || today;
  }, [minDate, lastWorkday]);

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

  const formRef = useRef<HTMLFormElement>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Sync tab & initial record on open
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(defaultTab);
    setCorrectionTarget('time_in');
    setFieldErrors({});
    setServerError(null);
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
  }, [isOpen, defaultTab, initialRecord, getInitialWorkday]);

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
        return `Short leave cannot exceed 4 hours (${formatHours(dur)} requested). Please apply for a full leave.`;
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

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (activeTab === 'leave') {
      if (!leaveReason.trim()) {
        errs.leaveReason = 'Please provide a reason for the leave application.';
      }
      const quotaErr = leaveQuotaError();
      if (quotaErr) {
        errs.leaveReason = quotaErr;
      }
    } else if (activeTab === 'short_leave') {
      if (!shortLeaveReason.trim()) {
        errs.shortLeaveReason = 'Please provide a reason for short leave.';
      }
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shortLeaveStartTime)) {
        errs.shortLeaveStartTime = 'Departure / Start time must be HH:MM (24-hour), e.g. 16:00.';
      } else {
        const finalDuration = isLeavingEarly ? autoCalculatedHours : Number(shortLeaveDuration);
        if (finalDuration < 0.5) {
          errs.shortLeaveStartTime = isLeavingEarly
            ? `Departure time must be at least 30 minutes before shift end (${shiftEndTime}).`
            : 'Short leave duration must be at least 30 minutes (0.5h).';
        } else if (finalDuration > 4.0) {
          errs.shortLeaveStartTime = 'Short leave cannot exceed 4.0 hours. Please apply for a full leave.';
        }
      }
      if (isOffDay(shortLeaveDate)) {
        errs.shortLeaveDate = `Cannot request short leave on a non-working day (${getOffDay(shortLeaveDate).label}).`;
      }
    } else if (activeTab === 'wfh') {
      if (!wfhReason.trim()) {
        errs.wfhReason = 'Please specify your deliverables and reason for WFH.';
      }
      const workdays = countWorkingDays(wfhStartDate, wfhEndDate);
      if (workdays === 0) {
        errs.wfhReason = 'Selected WFH date range contains no working days.';
      }
    } else if (activeTab === 'regularization') {
      if (!regularizeReason.trim()) {
        errs.regularizeReason = 'Please describe why the punch was missed/incorrect.';
      }
      const isTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
      if ((correctionTarget === 'time_in' || correctionTarget === 'both') && !isTime(regularizeIn)) {
        errs.regularizeIn = 'Time in must be HH:MM (24-hour), e.g. 09:30.';
      }
      if (correctionTarget === 'time_out' || correctionTarget === 'both') {
        if (!isTime(regularizeOut)) {
          errs.regularizeOut = 'Time out must be HH:MM (24-hour), e.g. 18:30.';
        } else if (isFuturePktClockTime(regularizeDate, regularizeOut)) {
          errs.regularizeOut = 'That would check you out before you leave. Use Time in only while you are still working.';
        }
      }
      if (isOffDay(regularizeDate)) {
        errs.regularizeDate = `Cannot regularize punch on a non-working day (${getOffDay(regularizeDate).label}).`;
      }
    }

    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const errs = validate();
    setFieldErrors(errs);

    if (Object.keys(errs).length > 0) {
      setTimeout(() => {
        if (formRef.current) focusFirstError(formRef.current);
      }, 50);
      return;
    }

    try {
      setIsSubmitting(true);
      let payload: CreateLeavePayload;

      if (activeTab === 'leave') {
        payload = {
          leave_type: leaveCategory,
          request_type: 'leave',
          leave_category: leaveCategory,
          start_date: leaveStartDate,
          end_date: leaveEndDate,
          reason: leaveReason.trim(),
        };
      } else if (activeTab === 'short_leave') {
        const finalDuration = isLeavingEarly ? autoCalculatedHours : Number(shortLeaveDuration);
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
        payload = {
          leave_type: 'wfh',
          request_type: 'wfh',
          start_date: wfhStartDate,
          end_date: wfhEndDate,
          reason: wfhReason.trim(),
        };
      } else {
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

      await attendanceService.createRequest(payload);
      addToast('Request sent', 'Your team lead or HR will review it.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      setServerError(err.response?.data?.detail || err.message || 'Could not submit attendance request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isCorrectionMode = defaultTab === 'regularization';

  return (
    <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="bg-surface rounded-lg border border-border w-full max-w-[560px] shadow-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                'p-2 rounded-md',
                isCorrectionMode
                  ? 'bg-warning-bg text-warning-fg border border-warning-bd'
                  : 'bg-accent-soft-2 text-accent-text border border-accent-200'
              )}
            >
              {isCorrectionMode ? <FileEdit className="w-5 h-5" /> : <FilePlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-h2 font-semibold text-fg">
                {isCorrectionMode ? 'Attendance punch correction' : 'Submit request'}
              </h3>
              <p className="text-small text-fg-muted">
                {isCorrectionMode
                  ? 'Submit time in / time out corrections for review'
                  : 'Submit leaves, short leaves, remote work or punch adjustments'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-muted hover:text-fg p-1 rounded-md hover:bg-hover transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Request Type Selector (2×2 RadioCards per §13.5) */}
          <div>
            <label className="block text-label font-medium text-fg mb-1.5">
              Request type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'leave', label: 'Full leave', desc: 'Annual or sick leave', icon: Calendar },
                { id: 'short_leave', label: 'Short leave', desc: 'Up to 4h departure or mid-shift', icon: Clock },
                { id: 'wfh', label: 'Work from home', desc: 'Remote work exemption', icon: Home },
                { id: 'regularization', label: 'Punch correction', desc: 'Fix missed check-in or out', icon: FileEdit },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id as RequestType);
                      setFieldErrors({});
                      setServerError(null);
                    }}
                    className={cn(
                      'p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex flex-col justify-between gap-1',
                      isSelected
                        ? 'border-accent bg-accent-soft-2'
                        : 'border-border bg-surface hover:bg-subtle'
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className={cn('w-4 h-4', isSelected ? 'text-accent' : 'text-fg-muted')} />
                      <span className={cn('text-ui font-medium', isSelected ? 'text-accent-text font-semibold' : 'text-fg')}>
                        {item.label}
                      </span>
                    </div>
                    <p className="text-small text-fg-muted leading-tight">
                      {item.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TAB 1: FULL LEAVE */}
          {activeTab === 'leave' && (
            <div className="space-y-4">
              {leaveBalance && (
                <Callout variant="neutral">
                  Remaining {leaveBalance.year}: <strong>{leaveBalance.annual_remaining}</strong> annual / <strong>{leaveBalance.sick_remaining}</strong> sick days. Rest days and public holidays are not deducted.
                </Callout>
              )}
              {leaveCategory === 'annual' && leaveBalance && leaveBalance.annual_remaining < countWorkingDays(leaveStartDate, leaveEndDate) && (
                <Callout variant="warning">
                  <strong>Leave balance notice:</strong> This request requires {countWorkingDays(leaveStartDate, leaveEndDate)} day(s), which exceeds your remaining {leaveBalance.annual_remaining} annual days. Your balance will become negative and settled at year-end.
                </Callout>
              )}
              <div>
                <label className="block text-label font-medium text-fg mb-1.5">
                  Leave category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['annual', 'sick'] as LeaveCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setLeaveCategory(cat)}
                      className={cn(
                        'py-2 px-3 rounded-md font-medium text-ui capitalize transition-colors border cursor-pointer',
                        leaveCategory === cat
                          ? 'bg-accent-soft-2 border-accent text-accent-text font-semibold'
                          : 'bg-surface border-border text-fg hover:bg-subtle'
                      )}
                    >
                      {cat === 'annual' ? 'Annual leave (14 quota)' : 'Sick leave (8 quota)'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CustomDatePicker
                  offDayMode="disable"
                  label="Start date"
                  minDate={minDate}
                  value={leaveStartDate}
                  onChange={setLeaveStartDate}
                />
                <CustomDatePicker
                  offDayMode="disable"
                  label="End date"
                  minDate={leaveStartDate || minDate}
                  value={leaveEndDate}
                  onChange={setLeaveEndDate}
                />
              </div>

              <div className="text-small text-fg-muted flex items-center justify-between">
                <span>
                  Requested duration:{' '}
                  <strong className="text-fg font-medium font-numeric">
                    {countWorkingDays(leaveStartDate, leaveEndDate)} working day(s)
                  </strong>
                </span>
                <span className="text-micro text-fg-muted">
                  (Rest days & holidays excluded)
                </span>
              </div>

              <div>
                <label htmlFor="leaveReason" className="block text-label font-medium text-fg mb-1">
                  Reason and handover notes *
                </label>
                <textarea
                  id="leaveReason"
                  rows={3}
                  required
                  aria-invalid={!!fieldErrors.leaveReason}
                  placeholder="Explain reason for leave and any task handovers or coverage..."
                  value={leaveReason}
                  onChange={(e) => {
                    setLeaveReason(e.target.value);
                    if (fieldErrors.leaveReason) setFieldErrors((prev) => { const n = { ...prev }; delete n.leaveReason; return n; });
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-md bg-surface border text-fg placeholder:text-fg-faint text-body focus-visible:focus-ring',
                    fieldErrors.leaveReason ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border-strong'
                  )}
                />
                {fieldErrors.leaveReason && (
                  <p className="mt-1 text-xs text-status-danger-fg flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.leaveReason}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: SHORT LEAVE */}
          {activeTab === 'short_leave' && (
            <div className="space-y-4">
              <Callout variant="info">
                Short leaves are approved for up to 4 hours. Hours not worked count as undertime. Every 8 hours of cumulative undertime deducts 1 day from your annual leave quota.
              </Callout>

              {/* Mode Selector */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-subtle rounded-md">
                <button
                  type="button"
                  onClick={() => setIsLeavingEarly(true)}
                  className={cn(
                    'py-1.5 px-3 rounded-sm font-medium text-ui transition-colors flex items-center justify-center gap-1.5 cursor-pointer',
                    isLeavingEarly
                      ? 'bg-surface text-fg shadow-xs font-semibold'
                      : 'text-fg-muted hover:text-fg'
                  )}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Leaving early (end of day)
                </button>
                <button
                  type="button"
                  onClick={() => setIsLeavingEarly(false)}
                  className={cn(
                    'py-1.5 px-3 rounded-sm font-medium text-ui transition-colors flex items-center justify-center gap-1.5 cursor-pointer',
                    !isLeavingEarly
                      ? 'bg-surface text-fg shadow-xs font-semibold'
                      : 'text-fg-muted hover:text-fg'
                  )}
                >
                  <Clock className="w-3.5 h-3.5" />
                  Mid-shift (returning)
                </button>
              </div>

              {isLeavingEarly ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <CustomDatePicker
                      offDayMode="disable"
                      label="Date"
                      minDate={minDate}
                      error={fieldErrors.shortLeaveDate}
                      value={shortLeaveDate}
                      onChange={(v) => {
                        setShortLeaveDate(v);
                        if (fieldErrors.shortLeaveDate) setFieldErrors((prev) => { const n = { ...prev }; delete n.shortLeaveDate; return n; });
                      }}
                    />
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-label font-medium text-fg">
                          Departure time
                        </label>
                        {shortLeaveDate === getTodayIso() && (
                          <button
                            type="button"
                            onClick={() => {
                              setShortLeaveStartTime(getCurrentTimePkt());
                              if (fieldErrors.shortLeaveStartTime) setFieldErrors((prev) => { const n = { ...prev }; delete n.shortLeaveStartTime; return n; });
                            }}
                            className="text-micro font-medium text-accent hover:underline cursor-pointer flex items-center gap-0.5"
                          >
                            <Clock className="w-2.5 h-2.5" />
                            Leave now ({getCurrentTimePkt()})
                          </button>
                        )}
                      </div>
                      <CustomTimePicker
                        required
                        error={fieldErrors.shortLeaveStartTime}
                        value={shortLeaveStartTime}
                        onChange={(v) => {
                          setShortLeaveStartTime(v);
                          if (fieldErrors.shortLeaveStartTime) setFieldErrors((prev) => { const n = { ...prev }; delete n.shortLeaveStartTime; return n; });
                        }}
                      />
                    </div>
                  </div>

                  {/* Calculated Duration Card */}
                  <div className="p-3.5 rounded-lg bg-subtle border border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-small text-fg-muted">
                          Undertime added (until shift end {shiftEndTime})
                        </span>
                        <div className="mt-1">
                          <span className="text-h2 font-semibold font-numeric text-fg">
                            {earlyDepartureDiffMinutes > 0 ? autoDurationFormatted : '0h'}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-medium bg-warning-bg text-warning-fg border border-warning-bd">
                          +{earlyDepartureDiffMinutes > 0 ? autoDurationFormatted : '0m'} undertime
                        </span>
                        <p className="text-micro text-fg-muted mt-1">
                          8h total = 1 leave day
                        </p>
                      </div>
                    </div>

                    {departureMinutes !== null && shiftEndMinutes !== null && departureMinutes >= shiftEndMinutes && (
                      <p className="mt-2 text-small text-warning-fg flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Departure time ({shortLeaveStartTime}) is at or after shift end ({shiftEndTime}).
                      </p>
                    )}

                    {autoCalculatedHours > 4.0 && (
                      <p className="mt-2 text-small text-danger-fg flex items-center gap-1 font-medium">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Short leave cannot exceed 4.0h. For absences over 4 hours, please submit a Full Leave request.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <CustomDatePicker
                      offDayMode="disable"
                      label="Date"
                      minDate={minDate}
                      error={fieldErrors.shortLeaveDate}
                      value={shortLeaveDate}
                      onChange={(v) => {
                        setShortLeaveDate(v);
                        if (fieldErrors.shortLeaveDate) setFieldErrors((prev) => { const n = { ...prev }; delete n.shortLeaveDate; return n; });
                      }}
                    />
                    <CustomTimePicker
                      label="Departure time"
                      required
                      error={fieldErrors.shortLeaveStartTime}
                      value={shortLeaveStartTime}
                      onChange={(v) => {
                        setShortLeaveStartTime(v);
                        if (fieldErrors.shortLeaveStartTime) setFieldErrors((prev) => { const n = { ...prev }; delete n.shortLeaveStartTime; return n; });
                      }}
                    />
                    <CustomSelect
                      label="Duration"
                      value={String(shortLeaveDuration)}
                      onChange={(e) => setShortLeaveDuration(Number(e))}
                      options={[
                        { value: '1', label: '1.0 hour' },
                        { value: '1.5', label: '1.5 hours' },
                        { value: '2', label: '2.0 hours' },
                        { value: '2.5', label: '2.5 hours' },
                        { value: '3', label: '3.0 hours' },
                        { value: '4', label: '4.0 hours (half day)' },
                      ]}
                    />
                  </div>

                  <div className="p-3 rounded-md bg-subtle border border-border flex items-center justify-between text-xs">
                    <span className="text-fg-muted">
                      Expected return: <strong className="text-fg font-numeric">{midShiftReturnTime}</strong>
                    </span>
                    <span className="text-micro text-fg-muted">
                      Adds {formatHours(Number(shortLeaveDuration) || 0)} to undertime
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="shortLeaveReason" className="block text-label font-medium text-fg mb-1">
                  Reason for short leave *
                </label>
                <textarea
                  id="shortLeaveReason"
                  rows={3}
                  required
                  aria-invalid={!!fieldErrors.shortLeaveReason}
                  placeholder={
                    isLeavingEarly
                      ? 'Reason for leaving early today (e.g. medical appointment, urgent personal matter)...'
                      : 'Reason for temporary absence and return plan...'
                  }
                  value={shortLeaveReason}
                  onChange={(e) => {
                    setShortLeaveReason(e.target.value);
                    if (fieldErrors.shortLeaveReason) setFieldErrors((prev) => { const n = { ...prev }; delete n.shortLeaveReason; return n; });
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-md bg-surface border text-fg placeholder:text-fg-faint text-body focus-visible:focus-ring',
                    fieldErrors.shortLeaveReason ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border-strong'
                  )}
                />
                {fieldErrors.shortLeaveReason && (
                  <p className="mt-1 text-xs text-status-danger-fg flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.shortLeaveReason}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: WORK FROM HOME (WFH) */}
          {activeTab === 'wfh' && (
            <div className="space-y-4">
              <Callout variant="info">
                Approved WFH automatically grants security exemptions, enabling check-in from non-office IPs and GPS locations.
              </Callout>

              <div className="grid grid-cols-2 gap-3">
                <CustomDatePicker
                  offDayMode="disable"
                  label="Start date"
                  minDate={minDate}
                  value={wfhStartDate}
                  onChange={setWfhStartDate}
                />
                <CustomDatePicker
                  offDayMode="disable"
                  label="End date"
                  minDate={wfhStartDate || minDate}
                  value={wfhEndDate}
                  onChange={setWfhEndDate}
                />
              </div>

              <div className="text-small text-fg-muted">
                <span>
                  WFH duration:{' '}
                  <strong className="text-fg font-medium font-numeric">
                    {countWorkingDays(wfhStartDate, wfhEndDate)} working day(s)
                  </strong>
                </span>
              </div>

              <div>
                <label htmlFor="wfhReason" className="block text-label font-medium text-fg mb-1">
                  Deliverables and work plan *
                </label>
                <textarea
                  id="wfhReason"
                  rows={3}
                  required
                  aria-invalid={!!fieldErrors.wfhReason}
                  placeholder="Outline key tasks, deliverables, and communication availability for the remote day..."
                  value={wfhReason}
                  onChange={(e) => {
                    setWfhReason(e.target.value);
                    if (fieldErrors.wfhReason) setFieldErrors((prev) => { const n = { ...prev }; delete n.wfhReason; return n; });
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-md bg-surface border text-fg placeholder:text-fg-faint text-body focus-visible:focus-ring',
                    fieldErrors.wfhReason ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border-strong'
                  )}
                />
                {fieldErrors.wfhReason && (
                  <p className="mt-1 text-xs text-status-danger-fg flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.wfhReason}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: MISSED PUNCH CORRECTION */}
          {activeTab === 'regularization' && (
            <div className="space-y-4">
              <Callout variant="info">
                Punch time corrections recalculate your working hours, undertime, and punctuality record once approved.
              </Callout>

              <CustomDatePicker
                offDayMode="disable"
                label="Date of missed / incorrect punch"
                minDate={minDate}
                error={fieldErrors.regularizeDate}
                value={regularizeDate}
                onChange={(v) => {
                  setRegularizeDate(v);
                  if (fieldErrors.regularizeDate) setFieldErrors((prev) => { const n = { ...prev }; delete n.regularizeDate; return n; });
                }}
              />

              {/* Correction Scope Selector */}
              <div>
                <label className="block text-label font-medium text-fg mb-1.5">
                  Correction scope
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'time_in', label: 'Time in only' },
                    { id: 'time_out', label: 'Time out only' },
                    { id: 'both', label: 'Both in and out' },
                  ].map((scope) => (
                    <button
                      key={scope.id}
                      type="button"
                      onClick={() => setCorrectionTarget(scope.id as any)}
                      className={cn(
                        'py-2 px-2.5 rounded-md font-medium text-ui transition-colors border text-center cursor-pointer',
                        correctionTarget === scope.id
                          ? 'bg-accent-soft-2 border-accent text-accent-text font-semibold'
                          : 'bg-surface border-border text-fg hover:bg-subtle'
                      )}
                    >
                      {scope.label}
                    </button>
                  ))}
                </div>
              </div>

              {(correctionTarget === 'both' || correctionTarget === 'time_out') && (
                <Callout variant="warning">
                  Including time out will check you out at that time. If your shift has not ended, use <strong>Time in only</strong> unless you have already left.
                </Callout>
              )}

              {/* Dynamic Time Pickers */}
              <div className={cn('grid gap-3', correctionTarget === 'both' ? 'grid-cols-2' : 'grid-cols-1')}>
                {(correctionTarget === 'time_in' || correctionTarget === 'both') && (
                  <CustomTimePicker
                    label="Correct time in (check-in)"
                    required
                    error={fieldErrors.regularizeIn}
                    value={regularizeIn}
                    onChange={(v) => {
                      setRegularizeIn(v);
                      if (fieldErrors.regularizeIn) setFieldErrors((prev) => { const n = { ...prev }; delete n.regularizeIn; return n; });
                    }}
                  />
                )}
                {(correctionTarget === 'time_out' || correctionTarget === 'both') && (
                  <CustomTimePicker
                    label="Correct time out (check-out)"
                    required
                    error={fieldErrors.regularizeOut}
                    value={regularizeOut}
                    onChange={(v) => {
                      setRegularizeOut(v);
                      if (fieldErrors.regularizeOut) setFieldErrors((prev) => { const n = { ...prev }; delete n.regularizeOut; return n; });
                    }}
                  />
                )}
              </div>

              <div>
                <label htmlFor="regularizeReason" className="block text-label font-medium text-fg mb-1">
                  Reason and justification for correction *
                </label>
                <textarea
                  id="regularizeReason"
                  rows={3}
                  required
                  aria-invalid={!!fieldErrors.regularizeReason}
                  placeholder="Explain why punch was missed or needs adjustment (e.g. power outage, client call, field meeting)..."
                  value={regularizeReason}
                  onChange={(e) => {
                    setRegularizeReason(e.target.value);
                    if (fieldErrors.regularizeReason) setFieldErrors((prev) => { const n = { ...prev }; delete n.regularizeReason; return n; });
                  }}
                  className={cn(
                    'w-full px-3 py-2 rounded-md bg-surface border text-fg placeholder:text-fg-faint text-body focus-visible:focus-ring',
                    fieldErrors.regularizeReason ? 'border-status-danger-border ring-1 ring-status-danger-border' : 'border-border-strong'
                  )}
                />
                {fieldErrors.regularizeReason && (
                  <p className="mt-1 text-xs text-status-danger-fg flex items-center gap-1" role="alert">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{fieldErrors.regularizeReason}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Modal Footer Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
            <div className="flex items-center gap-2">
              {Object.keys(fieldErrors).length > 1 && (
                <FormErrorSummaryButton
                  count={Object.keys(fieldErrors).length}
                  onClick={() => formRef.current && focusFirstError(formRef.current)}
                />
              )}
              {serverError && (
                <p className="text-xs text-status-danger-fg flex items-center gap-1.5" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{serverError}</span>
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={isSubmitting}
              >
                Send request
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
