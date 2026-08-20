import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Shield,
  Plus,
  Edit2,
  Trash2,
  MapPin,
  Wifi,
  Sparkles,
  X,
  Users,
  Search,
} from 'lucide-react';
import { attendanceService } from '../../../services/attendanceService';
import { adminService } from '../../../services/adminService';
import { useToast } from '../../../context/ToastContext';
import type {
  ShiftTemplate,
  SecuritySettings,
  CompanyCalendarEvent,
} from '../../../types/attendance';
import type { AdminMember } from '../../../types/admin';
import { CustomSelect } from '../../ui/CustomSelect';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { CustomTimePicker } from '../../ui/CustomTimePicker';
import { NumberStepper } from '../../ui/NumberStepper';
import { ToggleSwitch } from '../../ui/ToggleSwitch';

const getDeptBadgeClass = (dept?: string) => {
  const nd = (dept || '').toLowerCase().trim();
  if (nd.includes('software') || nd.includes('dev')) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
  }
  if (nd.includes('website')) {
    return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
  }
  if (nd.includes('creative')) {
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30';
  }
  if (nd.includes('content')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  if (nd.includes('seo')) {
    return 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30';
  }
  if (nd.includes('performance') || nd.includes('marketing')) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
  }
  if (nd.includes('ai')) {
    return 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30';
  }
  if (nd.includes('hr')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
  }
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
};

const getRoleBadgeClass = (role?: string) => {
  const r = (role || '').toLowerCase();
  if (r.includes('admin')) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
  }
  if (r.includes('hr')) {
    return 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30';
  }
  if (r.includes('operations')) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  }
  if (r.includes('lead')) {
    return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30';
  }
  return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700';
};

export const AttendancePoliciesSection: React.FC = () => {
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'shifts' | 'calendar' | 'security'>('shifts');
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
  const [searchMemberQuery, setSearchMemberQuery] = useState('');
  const [isAssigning, setIsAssigning] = useState<Record<string, boolean>>({});
  const [pendingShiftChange, setPendingShiftChange] = useState<{
    member: AdminMember;
    newShiftId: string;
    newShiftName: string;
    currentShiftName: string;
  } | null>(null);

  // Calendar & Holidays State
  const [calendarEvents, setCalendarEvents] = useState<CompanyCalendarEvent[]>([]);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-08-19');
  const [newEventType, setNewEventType] = useState<'holiday' | 'working_saturday'>('holiday');
  const [newEventDesc, setNewEventDesc] = useState('');

  // Security Settings State
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings>({
    office_public_ips: ['127.0.0.1', '::1', '154.192.130.18', '154.57.199.55'],
    office_subnets: ['192.168.1.0/24', '10.0.0.0/8'],
    office_ip_whitelist: ['127.0.0.1', '::1', '192.168.1.0/24', '154.192.130.18', '154.57.199.55'],
    office_latitude: 33.5315,
    office_longitude: 73.1382,
    geofence_radius_meters: 500,
    grace_period_minutes: 30,
    late_threshold_minutes: 30,
    enforce_ip_whitelist: true,
    enforce_gps_geofence: true,
    allow_wfh_bypass: true,
  });
  const [newIpInput, setNewIpInput] = useState('');

  // Initial Data Fetch
  const fetchData = async () => {
    try {
      const calNow = new Date();
      const [fetchedShifts, fetchedSec, fetchedCal, fetchedMembers, fetchedAssignments] = await Promise.allSettled([
        attendanceService.getShifts(),
        attendanceService.getSecuritySettings(),
        attendanceService.getCalendarMonth(calNow.getFullYear(), calNow.getMonth() + 1),
        adminService.getMembers(),
        attendanceService.getShiftAssignments(),
      ]);

      if (fetchedShifts.status === 'fulfilled' && fetchedShifts.value?.length) {
        setShifts(fetchedShifts.value);
      } else {
        setShifts([
          {
            id: 'standard_shift',
            name: 'Standard Shift (General Team)',
            code: 'STD',
            start_time: '09:30',
            end_time: '18:30',
            grace_period_minutes: 30,
            break_duration_minutes: 60,
            late_threshold_time: '10:00',
            is_cross_midnight: false,
            expected_work_hours: 8.0,
          },
          {
            id: 'hr_shift',
            name: 'HR Department Shift',
            code: 'HR',
            start_time: '09:00',
            end_time: '18:00',
            grace_period_minutes: 30,
            break_duration_minutes: 60,
            late_threshold_time: '09:30',
            is_cross_midnight: false,
            expected_work_hours: 8.0,
          },
          {
            id: 'afternoon_shift',
            name: 'Afternoon Shift',
            code: 'AFT',
            start_time: '14:00',
            end_time: '20:00',
            grace_period_minutes: 30,
            break_duration_minutes: 30,
            late_threshold_time: '14:30',
            is_cross_midnight: false,
            expected_work_hours: 5.5,
          },
          {
            id: 'night_shift',
            name: 'Night Operations Shift',
            code: 'NGT',
            start_time: '22:00',
            end_time: '06:00',
            grace_period_minutes: 30,
            break_duration_minutes: 60,
            late_threshold_time: '22:30',
            is_cross_midnight: true,
            expected_work_hours: 7.0,
          },
        ]);
      }

      if (fetchedSec.status === 'fulfilled' && fetchedSec.value) {
        setSecuritySettings(fetchedSec.value);
      }

      if (fetchedCal.status === 'fulfilled' && fetchedCal.value?.events) {
        setCalendarEvents(fetchedCal.value.events);
      }

      if (fetchedMembers.status === 'fulfilled' && Array.isArray(fetchedMembers.value)) {
        setMembers(fetchedMembers.value.filter((m: AdminMember) => m.role !== 'client' && m.role !== 'admin'));
      }

      if (fetchedAssignments.status === 'fulfilled' && Array.isArray(fetchedAssignments.value)) {
        const map: Record<string, string> = {};
        fetchedAssignments.value.forEach((a: any) => {
          if (a.user_id && a.shift_id) {
            map[a.user_id] = a.shift_id;
          }
        });
        setShiftAssignments(map);
      }
    } catch {
      // Keep defaults
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAssignUserShift = async (userId: string, shiftId: string) => {
    try {
      setIsAssigning((prev) => ({ ...prev, [userId]: true }));
      setShiftAssignments((prev) => ({ ...prev, [userId]: shiftId }));

      await attendanceService.assignShift({ user_id: userId, shift_id: shiftId });
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
      start_time: '09:30',
      end_time: '18:30',
      grace_period_minutes: 30,
      break_duration_minutes: 60,
      late_threshold_time: '10:00',
      is_cross_midnight: false,
      expected_work_hours: 8.0,
    });
    setIsShiftModalOpen(true);
  };

  const handleOpenEditShift = (shift: ShiftTemplate) => {
    setEditingShift({ ...shift });
    setIsShiftModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    if (!editingShift.name.trim()) {
      addToast('Name Required', 'Please provide a shift name.', 'warning');
      return;
    }

    try {
      setIsSaving(true);
      if (editingShift.id && !editingShift.id.startsWith('new_')) {
        await attendanceService.updateShift(editingShift.id, editingShift);
      } else {
        await attendanceService.createShift(editingShift);
      }
      addToast('Shift Saved', `Shift template "${editingShift.name}" was saved.`, 'success');
      setIsShiftModalOpen(false);
      setEditingShift(null);
      fetchData();
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to save shift.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── IP Whitelist Handlers ───
  const handleAddIp = () => {
    if (!newIpInput.trim()) return;
    const ip = newIpInput.trim();
    const currentIps = securitySettings.office_public_ips || securitySettings.office_ip_whitelist || [];
    if (!currentIps.includes(ip)) {
      const updated = [...currentIps, ip];
      setSecuritySettings((prev) => ({
        ...prev,
        office_public_ips: updated,
        office_ip_whitelist: updated,
      }));
      setNewIpInput('');
    }
  };

  const handleRemoveIp = (ipToRemove: string) => {
    const currentIps = securitySettings.office_public_ips || securitySettings.office_ip_whitelist || [];
    const updated = currentIps.filter((ip) => ip !== ipToRemove);
    setSecuritySettings((prev) => ({
      ...prev,
      office_public_ips: updated,
      office_ip_whitelist: updated,
    }));
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const payload: SecuritySettings = {
        office_public_ips: securitySettings.office_public_ips || securitySettings.office_ip_whitelist || ['127.0.0.1', '::1'],
        office_subnets: securitySettings.office_subnets || ['192.168.1.0/24', '10.0.0.0/8'],
        office_latitude: Number(securitySettings.office_latitude) || 33.5315,
        office_longitude: Number(securitySettings.office_longitude) || 73.1382,
        geofence_radius_meters: Number(securitySettings.geofence_radius_meters) || 500,
        enforce_ip_whitelist: Boolean(securitySettings.enforce_ip_whitelist),
        enforce_gps_geofence: Boolean(securitySettings.enforce_gps_geofence),
        allow_wfh_bypass: Boolean(securitySettings.allow_wfh_bypass),
      };
      await attendanceService.updateSecuritySettings(payload);
      addToast('Security Settings Updated', 'Office IP whitelist and GPS perimeter saved.', 'success');
    } catch (err: any) {
      addToast('Error', err.message || 'Failed to save security settings.', 'error');
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
            Configure shift schedules, 30m grace buffers, public holidays, and Rawalpindi HQ anti-proxy geofencing
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
                setNewEventDate('2026-08-19');
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
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-zinc-50 dark:bg-[#0c0d12]'
              : 'border-transparent text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Anti-Proxy Security & Geofencing</span>
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
                  Assign custom shifts to individual team members. By default, HR department follows HR Shift (09:00-18:00) and other departments follow Standard Shift (09:30-18:30).
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
                    <th className="py-3 px-4">Designated Shift</th>
                    <th className="py-3 px-4">Shift Timings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-400">
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
                      const currentShiftObj = shifts.find((s) => s.id === currentShiftId);

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
                          <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {currentShiftObj
                              ? `${currentShiftObj.start_time} — ${currentShiftObj.end_time}`
                              : '09:30 — 18:30'}
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

      {/* ─── TAB 3: ANTI-PROXY SECURITY & GEOFENCING ─── */}
      {activeTab === 'security' && (
        <form onSubmit={handleSaveSecurity} className="space-y-4">
          {/* Enforce Toggles */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              Security Check Toggles
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                <ToggleSwitch
                  checked={Boolean(securitySettings.enforce_ip_whitelist)}
                  onChange={(checked) =>
                    setSecuritySettings({
                      ...securitySettings,
                      enforce_ip_whitelist: checked,
                    })
                  }
                  label="Tier 1: Office IP & CIDR Subnet Whitelist"
                  description="Validates client IP against configured office CIDRs on punch in/out."
                />
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                <ToggleSwitch
                  checked={Boolean(securitySettings.enforce_gps_geofence)}
                  onChange={(checked) =>
                    setSecuritySettings({
                      ...securitySettings,
                      enforce_gps_geofence: checked,
                    })
                  }
                  label="Tier 3: Browser GPS Geofencing (150m Perimeter)"
                  description="Validates distance ≤ 150m of Rawalpindi office coordinates via Haversine calculation."
                />
              </div>

              <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                <ToggleSwitch
                  checked={Boolean(securitySettings.allow_wfh_bypass)}
                  onChange={(checked) =>
                    setSecuritySettings({
                      ...securitySettings,
                      allow_wfh_bypass: checked,
                    })
                  }
                  label="Approved WFH Security Auto-Bypass"
                  description="Automatically bypasses IP and GPS checks if and only if employee has an approved WFH record."
                />
              </div>
            </div>
          </div>

          {/* Office Coordinates */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              Office Coordinates & Perimeter (Rawalpindi HQ)
            </h3>
            <p className="text-xs text-zinc-500">
              Business Bay, 3rd Floor, Building A-26, Sector F DHA Phase 1, Rawalpindi
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={securitySettings.office_latitude}
                  onChange={(e) =>
                    setSecuritySettings({
                      ...securitySettings,
                      office_latitude: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={securitySettings.office_longitude}
                  onChange={(e) =>
                    setSecuritySettings({
                      ...securitySettings,
                      office_longitude: parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Radius (Meters)
                </label>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  required
                  value={securitySettings.geofence_radius_meters}
                  onChange={(e) =>
                    setSecuritySettings({
                      ...securitySettings,
                      geofence_radius_meters: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-bold text-zinc-800 dark:text-zinc-200"
                />
              </div>
            </div>
          </div>

          {/* Office IP Whitelist */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800/90 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-indigo-600" />
              Whitelisted Office IPs & Subnets
            </h3>

            <div className="flex gap-2 text-xs">
              <input
                type="text"
                placeholder="e.g. 192.168.1.0/24 or 110.39.1.50"
                value={newIpInput}
                onChange={(e) => setNewIpInput(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200"
              />
              <button
                type="button"
                onClick={handleAddIp}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
              >
                Add IP
              </button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              {(securitySettings.office_public_ips || securitySettings.office_ip_whitelist || []).map((ip) => (
                <span
                  key={ip}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-mono text-zinc-800 dark:text-zinc-200 font-semibold"
                >
                  {ip}
                  <button
                    type="button"
                    onClick={() => handleRemoveIp(ip)}
                    className="text-zinc-400 hover:text-rose-500 p-0.5 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Security Settings'}
            </button>
          </div>
        </form>
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
                    value={editingShift.start_time}
                    onChange={(val) => setEditingShift({ ...editingShift, start_time: val })}
                  />
                </div>
                <div>
                  <CustomTimePicker
                    label="End Time"
                    value={editingShift.end_time}
                    onChange={(val) => setEditingShift({ ...editingShift, end_time: val })}
                  />
                </div>
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
                      setEditingShift({
                        ...editingShift,
                        break_duration_minutes: val,
                      })
                    }
                  />
                </div>

                <div>
                  <NumberStepper
                    label="Expected Work"
                    min={1}
                    max={24}
                    step={0.5}
                    unit="hrs"
                    value={editingShift.expected_hours ?? editingShift.expected_work_hours ?? 8.0}
                    onChange={(val) =>
                      setEditingShift({
                        ...editingShift,
                        expected_hours: val,
                        expected_work_hours: val,
                      })
                    }
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800">
                <ToggleSwitch
                  checked={Boolean(editingShift.is_cross_midnight)}
                  onChange={(checked) =>
                    setEditingShift({ ...editingShift, is_cross_midnight: checked })
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
                    minDate="2026-08-19"
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