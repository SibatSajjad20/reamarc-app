import React, { useState, useMemo, useEffect } from 'react';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  Home,
  FileText,
  Sparkles,
  Search,
  X,
  Trash2,
  AlertTriangle,
  MessageSquare,
  History,
  Edit3,
  CornerUpLeft,
  HelpCircle,
  Eye,
  MoreVertical,
  Copy,
  Check,
} from 'lucide-react';
import type { AttendanceRequest, RequestStatus } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { CustomSelect } from '../ui/CustomSelect';
import { isFuturePktClockTime } from '../../constants/attendance';
import {
  canDeleteLeaveRequest,
  canReviewLeaveRequest,
  canEditLeaveStatus,
  reviewScopeHint,
} from '../../utils/leaveRequestAccess';

interface ApprovalInboxSectionProps {
  requests: AttendanceRequest[];
  isLoading?: boolean;
  onRefresh: () => void;
  canReview?: boolean;
}

const hhmm = (value?: string | null) => {
  if (!value) return '—';
  return value.substring(0, 5);
};

const changeArrow = (from?: string | null, to?: string | null) => `${hhmm(from)} → ${hhmm(to)}`;

const formatCorrectionChange = (req: AttendanceRequest): string => {
  const origIn = req.original_punch_in || req.original_check_in;
  const origOut = req.original_punch_out || req.original_check_out;
  const nextIn = req.regularization_punch_in || req.regularization_check_in;
  const nextOut = req.regularization_punch_out || req.regularization_check_out;
  if (req.correction_target === 'time_in') {
    return `Time In: ${changeArrow(origIn, nextIn)}`;
  }
  if (req.correction_target === 'time_out') {
    return `Time Out: ${changeArrow(origOut, nextOut)}`;
  }
  return `In: ${changeArrow(origIn, nextIn)} · Out: ${changeArrow(origOut, nextOut)}`;
};

export const ApprovalInboxSection: React.FC<ApprovalInboxSectionProps> = ({
  requests,
  onRefresh,
  canReview = true,
}) => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals & Active Items
  const [selectedDetailItem, setSelectedDetailItem] = useState<AttendanceRequest | null>(null);
  const [reviewingItem, setReviewingItem] = useState<{
    request: AttendanceRequest;
    action: 'approved' | 'rejected' | 'needs_info';
  } | null>(null);
  const [editingStatusItem, setEditingStatusItem] = useState<AttendanceRequest | null>(null);
  const [clarifyingItem, setClarifyingItem] = useState<AttendanceRequest | null>(null);
  const [appealingItem, setAppealingItem] = useState<AttendanceRequest | null>(null);
  const [deletingItem, setDeletingItem] = useState<AttendanceRequest | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Close dropdown on click outside
  useEffect(() => {
    if (!openDropdownId) return;
    const handleDocClick = () => setOpenDropdownId(null);
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, [openDropdownId]);

  // Form Inputs
  const [reviewComment, setReviewComment] = useState('');
  const [editStatusValue, setEditStatusValue] = useState<RequestStatus>('approved');
  const [editStatusReason, setEditStatusReason] = useState('');
  const [clarifyResponseText, setClarifyResponseText] = useState('');
  const [appealReasonText, setAppealReasonText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filtered Requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const matchesType =
        typeFilter === 'All' ||
        (typeFilter === 'leave' && req.request_type === 'leave') ||
        (typeFilter === 'short_leave' && req.request_type === 'short_leave') ||
        (typeFilter === 'wfh' && req.request_type === 'wfh') ||
        (typeFilter === 'regularization' && req.request_type === 'regularization') ||
        (typeFilter === 'overtime' && req.request_type === 'overtime');

      const matchesStatus =
        statusFilter === 'All' || req.status.toLowerCase() === statusFilter.toLowerCase();

      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        req.user_name.toLowerCase().includes(term) ||
        req.department.toLowerCase().includes(term) ||
        req.reason.toLowerCase().includes(term);

      return matchesType && matchesStatus && matchesSearch;
    });
  }, [requests, typeFilter, statusFilter, searchTerm]);

  // KPI counters
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const appealedCount = requests.filter((r) => r.status === 'appealed').length;
  const needsInfoCount = requests.filter((r) => r.status === 'needs_info').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  const handleOpenReview = (request: AttendanceRequest, action: 'approved' | 'rejected' | 'needs_info') => {
    setReviewingItem({ request, action });
    setReviewComment('');
  };

  const handleOpenEditStatus = (request: AttendanceRequest) => {
    setEditingStatusItem(request);
    setEditStatusValue(request.status === 'approved' ? 'rejected' : 'approved');
    setEditStatusReason('');
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingItem) return;

    if (reviewingItem.action === 'rejected' && !reviewComment.trim()) {
      addToast('Rejection Reason Required', 'Please provide a justification for declining this request.', 'warning');
      return;
    }

    if (reviewingItem.action === 'needs_info' && !reviewComment.trim()) {
      addToast('Clarification Prompt Required', 'Please specify what additional information or proof is needed.', 'warning');
      return;
    }

    const req = reviewingItem.request;
    if (!canReviewLeaveRequest(user?.id, user?.role, req)) {
      addToast('Not allowed', 'You cannot review this request.', 'warning');
      return;
    }
    const outTime = req.regularization_punch_out || req.regularization_check_out || '';
    const correctionClosesDay =
      req.request_type === 'regularization' &&
      (req.correction_target === 'both' || req.correction_target === 'time_out');
    if (
      reviewingItem.action === 'approved' &&
      correctionClosesDay &&
      isFuturePktClockTime(req.start_date, outTime)
    ) {
      addToast(
        'This would check them out too early',
        `Time Out ${outTime} is still in the future. Ask for Time In Only, or use Daily Matrix override and clear Time Out so they can still Check Out.`,
        'warning'
      );
      return;
    }

    try {
      setIsProcessing(true);
      await attendanceService.reviewRequest(reviewingItem.request.id, {
        status: reviewingItem.action,
        review_comments: reviewingItem.action === 'approved' ? reviewComment.trim() || undefined : undefined,
        rejection_reason: reviewingItem.action === 'rejected' ? reviewComment.trim() : undefined,
        clarification_prompt: reviewingItem.action === 'needs_info' ? reviewComment.trim() : undefined,
      });

      addToast(
        reviewingItem.action === 'approved'
          ? 'Request Approved 🎉'
          : reviewingItem.action === 'needs_info'
          ? 'Clarification Requested 💬'
          : 'Request Rejected',
        `The ${reviewingItem.request.request_type.replace('_', ' ')} for ${reviewingItem.request.user_name} has been processed.`,
        reviewingItem.action === 'approved' ? 'success' : 'info'
      );

      setReviewingItem(null);
      if (selectedDetailItem?.id === reviewingItem.request.id) {
        setSelectedDetailItem(null);
      }
      onRefresh();
    } catch (err: any) {
      addToast('Review Failed', err.message || 'Could not process request review.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmEditStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStatusItem) return;
    if (!editStatusReason.trim()) {
      addToast('Reason Required', 'Please explain why the status is being modified.', 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      await attendanceService.editRequestStatus(editingStatusItem.id, {
        new_status: editStatusValue,
        reason: editStatusReason.trim(),
      });
      addToast('Status Updated 🔄', `Request status changed to ${editStatusValue}. Timesheet synced.`, 'success');
      setEditingStatusItem(null);
      if (selectedDetailItem?.id === editingStatusItem.id) {
        setSelectedDetailItem(null);
      }
      onRefresh();
    } catch (err: any) {
      addToast('Edit Failed', err.message || 'Could not update status.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmClarification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clarifyingItem) return;
    if (!clarifyResponseText.trim()) {
      addToast('Response Required', 'Please provide the requested explanation.', 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      await attendanceService.clarifyRequest(clarifyingItem.id, {
        clarification_response: clarifyResponseText.trim(),
      });
      addToast('Clarification Sent 📤', 'Your updated details have been submitted for review.', 'success');
      setClarifyingItem(null);
      if (selectedDetailItem?.id === clarifyingItem.id) {
        setSelectedDetailItem(null);
      }
      onRefresh();
    } catch (err: any) {
      addToast('Submission Failed', err.message || 'Could not submit clarification.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appealingItem) return;
    if (!appealReasonText.trim()) {
      addToast('Appeal Reason Required', 'Please provide justification for your appeal.', 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      await attendanceService.appealRequest(appealingItem.id, {
        appeal_reason: appealReasonText.trim(),
      });
      addToast('Appeal Submitted ⚖️', 'Your request has been reopened under appeal for review.', 'info');
      setAppealingItem(null);
      if (selectedDetailItem?.id === appealingItem.id) {
        setSelectedDetailItem(null);
      }
      onRefresh();
    } catch (err: any) {
      addToast('Appeal Failed', err.message || 'Could not submit appeal.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    try {
      setIsProcessing(true);
      await attendanceService.deleteRequest(deletingItem.id);
      addToast(
        'Request Deleted',
        `The ${deletingItem.request_type.replace('_', ' ')} request for ${deletingItem.start_date} has been deleted.`,
        'info'
      );
      setDeletingItem(null);
      if (selectedDetailItem?.id === deletingItem.id) {
        setSelectedDetailItem(null);
      }
      onRefresh();
    } catch (err: any) {
      addToast('Delete Failed', err.message || 'Could not delete request.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const renderTypeBadge = (req: AttendanceRequest) => {
    switch (req.request_type) {
      case 'leave':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 capitalize">
            <FileText className="w-3 h-3" /> {req.leave_category || ''} Leave
          </span>
        );
      case 'short_leave':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Clock className="w-3 h-3" /> Short Leave ({req.short_leave_duration_hours || 2}h)
          </span>
        );
      case 'wfh':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <Home className="w-3 h-3" /> WFH Exemption
          </span>
        );
      case 'regularization':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
            <Sparkles className="w-3 h-3 text-amber-600" /> Correction
          </span>
        );
      case 'overtime':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <Clock className="w-3 h-3" /> Overtime
            {req.overtime_minutes ? ` (+${String(Math.floor(req.overtime_minutes / 60)).padStart(2, '0')}:${String(req.overtime_minutes % 60).padStart(2, '0')})` : ''}
          </span>
        );
      default:
        return null;
    }
  };

  const renderStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      case 'appealed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-300 animate-pulse">
            <CornerUpLeft className="w-3 h-3" /> Appealed
          </span>
        );
      case 'needs_info':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-300">
            <HelpCircle className="w-3 h-3" /> Needs Info
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300">
            <X className="w-3 h-3" /> Cancelled
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 animate-pulse">
            <Clock className="w-3 h-3" /> Pending Review
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total</span>
            <p className="text-lg font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">{totalCount}</p>
          </div>
          <div className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            <Inbox className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pending</span>
            <p className="text-lg font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">{pendingCount}</p>
          </div>
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Appealed</span>
            <p className="text-lg font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">{appealedCount}</p>
          </div>
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400">
            <CornerUpLeft className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Needs Info</span>
            <p className="text-lg font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{needsInfoCount}</p>
          </div>
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
            <HelpCircle className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Approved</span>
            <p className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{approvedCount}</p>
          </div>
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Rejected</span>
            <p className="text-lg font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">{rejectedCount}</p>
          </div>
          <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="p-4 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-bold overflow-x-auto max-w-full">
            {(
              [
                { id: 'All', label: 'All', count: totalCount },
                { id: 'pending', label: 'Pending', count: pendingCount },
                { id: 'appealed', label: 'Appealed', count: appealedCount },
                { id: 'needs_info', label: 'Needs Info', count: needsInfoCount },
                { id: 'approved', label: 'Approved', count: approvedCount },
                { id: 'rejected', label: 'Rejected', count: rejectedCount },
              ] as const
            ).map((st) => {
              const isActive = statusFilter === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-white dark:bg-[#11131a] text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <span>{st.label}</span>
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300'
                        : 'bg-zinc-200/70 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {st.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Type Filter */}
          <div className="w-48">
            <CustomSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'All', label: 'Type: All Requests' },
                { value: 'leave', label: 'Type: Full Leave' },
                { value: 'short_leave', label: 'Type: Short Leave' },
                { value: 'wfh', label: 'Type: WFH' },
                { value: 'regularization', label: 'Type: Correction' },
                { value: 'overtime', label: 'Type: Overtime' },
              ]}
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search applicant / reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Approval Inbox & Request Audit Log
          </h3>
          <span className="text-xs font-semibold text-zinc-500">
            {filteredRequests.length} requests displayed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-[#161822] text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold">
                <th className="py-3 px-4">Applicant</th>
                <th className="py-3 px-4">Request Type</th>
                <th className="py-3 px-4">Applicable Dates / Time</th>
                <th className="py-3 px-4 max-w-sm">Reason / Work Details</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
                      <Inbox className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No requests found</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Nothing matches the current filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const isPendingOrAppealed = req.status === 'pending' || req.status === 'appealed';
                  const isNeedsInfo = req.status === 'needs_info';
                  const isResolved = req.status === 'approved' || req.status === 'rejected' || req.status === 'cancelled';
                  const isMyRequest = Boolean(user?.id && req.user_id && String(user.id) === String(req.user_id));

                  const canReviewThis =
                    canReview &&
                    isPendingOrAppealed &&
                    canReviewLeaveRequest(user?.id, user?.role, req);

                  const canEditThis =
                    canReview &&
                    isResolved &&
                    canEditLeaveStatus(user?.id, user?.role, req);

                  const canDeleteThis = canDeleteLeaveRequest(user?.id, user?.role, req);
                  const scopeHint = isPendingOrAppealed ? reviewScopeHint(user?.id, user?.role, req) : null;

                  return (
                    <tr
                      key={req.id}
                      onClick={() => setSelectedDetailItem(req)}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                    >
                      {/* Applicant */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] flex items-center justify-center">
                            {req.user_name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                              {req.user_name}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {req.department} · <span className="capitalize">{req.user_role || 'Staff'}</span>
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Request Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderTypeBadge(req)}
                      </td>

                      {/* Dates / Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-zinc-700 dark:text-zinc-300">
                        {req.request_type === 'short_leave' ? (
                          <div>
                            <p className="font-semibold">{req.start_date}</p>
                            <p className="text-[10px] text-zinc-400 font-numeric">
                              {req.short_leave_start_time} ({req.short_leave_duration_hours}h duration)
                            </p>
                          </div>
                        ) : req.request_type === 'regularization' ? (
                          <div>
                            <p className="font-semibold">{req.start_date}</p>
                            <p className="text-[10px] text-zinc-400 font-numeric">
                              {formatCorrectionChange(req)}
                            </p>
                            <p className="text-[10px] text-zinc-400">
                              {req.correction_target === 'time_in'
                                ? 'In only'
                                : req.correction_target === 'time_out'
                                ? 'Out only'
                                : 'In & Out'}
                            </p>
                          </div>
                        ) : req.request_type === 'overtime' ? (
                          <div>
                            <p className="font-semibold">{req.start_date}</p>
                            <p className="text-[10px] text-zinc-400 font-numeric">
                              Shift end {req.shift_end || '—'} → Out {req.check_out || '—'}
                            </p>
                          </div>
                        ) : req.start_date === req.end_date ? (
                          <span className="font-semibold">{req.start_date}</span>
                        ) : (
                          <span className="font-semibold">
                            {req.start_date} <span className="text-zinc-400">to</span> {req.end_date}
                          </span>
                        )}
                      </td>

                      {/* Reason Column: Clean clamped preview without clutter link */}
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400 max-w-xs">
                        <div className="space-y-1">
                          <p className="line-clamp-2 text-zinc-800 dark:text-zinc-200">
                            {req.reason}
                          </p>

                          {/* Extra info banners */}
                          {req.clarification_prompt && (
                            <div className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-semibold truncate">
                              <HelpCircle className="w-3 h-3 shrink-0" />
                              <span className="truncate">HR: {req.clarification_prompt}</span>
                            </div>
                          )}

                          {req.appeal_reason && (
                            <div className="flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-semibold truncate">
                              <CornerUpLeft className="w-3 h-3 shrink-0" />
                              <span className="truncate">Appeal: {req.appeal_reason}</span>
                            </div>
                          )}

                          {(req.rejection_reason || req.review_comments) && !req.clarification_prompt && (
                            <p className="text-[10px] text-rose-600 font-semibold truncate">
                              Note: {req.rejection_reason || req.review_comments}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          {renderStatusBadge(req.status)}
                          {isPendingOrAppealed && !canReviewThis && scopeHint && (
                            <p className="text-[10px] text-zinc-400 max-w-[10rem] truncate" title={scopeHint}>
                              {scopeHint}
                            </p>
                          )}
                          {!canReview && !isPendingOrAppealed && req.reviewed_by_name && (
                            <p className="text-[10px] text-zinc-400">
                              By {req.reviewed_by_name}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Actions Dropdown */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === req.id ? null : req.id);
                            }}
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                            title="Actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {openDropdownId === req.id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#161822] rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xl py-1 z-30 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* 1. View Full Details */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  setSelectedDetailItem(req);
                                }}
                                className="w-full px-3 py-2 text-left text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2 font-medium cursor-pointer transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5 text-zinc-400" />
                                <span>View Full Details</span>
                              </button>

                              {/* Reviewer actions on pending/appealed requests */}
                              {canReviewThis && (
                                <>
                                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenReview(req, 'approved');
                                    }}
                                    className="w-full px-3 py-2 text-left text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Approve Request</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenReview(req, 'needs_info');
                                    }}
                                    className="w-full px-3 py-2 text-left text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                                    <span>Ask for Info</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenReview(req, 'rejected');
                                    }}
                                    className="w-full px-3 py-2 text-left text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                    <span>Reject Request</span>
                                  </button>
                                </>
                              )}

                              {/* Reviewer Edit Status on already resolved requests */}
                              {canEditThis && (
                                <>
                                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenEditStatus(req);
                                    }}
                                    className="w-full px-3 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Edit Decision</span>
                                  </button>
                                </>
                              )}

                              {/* Employee action: Reply to clarification */}
                              {isNeedsInfo && isMyRequest && (
                                <>
                                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setClarifyingItem(req);
                                      setClarifyResponseText('');
                                    }}
                                    className="w-full px-3 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Reply to HR</span>
                                  </button>
                                </>
                              )}

                              {/* Employee action: Single-use Appeal */}
                              {req.status === 'rejected' && isMyRequest && !req.has_appealed && (
                                <>
                                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setAppealingItem(req);
                                      setAppealReasonText('');
                                    }}
                                    className="w-full px-3 py-2 text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <CornerUpLeft className="w-3.5 h-3.5 text-blue-500" />
                                    <span>Appeal Rejection</span>
                                  </button>
                                </>
                              )}

                              {/* Delete Request */}
                              {canDeleteThis && (
                                <>
                                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setDeletingItem(req);
                                    }}
                                    className="w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Delete Request</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. Request Details Side Drawer / Modal */}
      {/* ────────────────────────────────────────────────────────── */}
      {selectedDetailItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end">
          <div className="bg-white dark:bg-[#11131a] border-l border-zinc-200 dark:border-zinc-800 w-full max-w-lg h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-[#161822]">
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Request Details & Audit History
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-zinc-500 font-numeric">ID: {selectedDetailItem.id}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(selectedDetailItem.id);
                      setCopiedId(true);
                      setTimeout(() => setCopiedId(false), 2000);
                    }}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-0.5 rounded cursor-pointer transition-colors"
                    title="Copy Request ID"
                  >
                    {copiedId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Metadata Card */}
              <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center">
                      {selectedDetailItem.user_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100 text-sm">
                        {selectedDetailItem.user_name}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {selectedDetailItem.department} · <span className="capitalize">{selectedDetailItem.user_role || 'Staff'}</span>
                      </p>
                    </div>
                  </div>
                  <div>{renderStatusBadge(selectedDetailItem.status)}</div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2.5 border-t border-zinc-200 dark:border-zinc-800/80 text-[11px]">
                  <div>
                    <span className="text-zinc-400 block font-semibold">Request Type</span>
                    <div className="mt-0.5">{renderTypeBadge(selectedDetailItem)}</div>
                  </div>
                  <div>
                    <span className="text-zinc-400 block font-semibold">Applicable Dates</span>
                    <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                      {selectedDetailItem.start_date}{' '}
                      {selectedDetailItem.end_date !== selectedDetailItem.start_date
                        ? `to ${selectedDetailItem.end_date}`
                        : ''}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-400 block font-semibold">Submitted At</span>
                    <p className="font-bold text-zinc-800 dark:text-zinc-200 mt-0.5">
                      {selectedDetailItem.created_at
                        ? selectedDetailItem.created_at.substring(0, 16).replace('T', ' ')
                        : 'Recent'}
                    </p>
                  </div>
                </div>

                {selectedDetailItem.request_type === 'overtime' && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                    <span className="font-semibold">Claimed Overtime Duration</span>
                    <span className="font-extrabold text-sm">
                      {selectedDetailItem.overtime_minutes
                        ? `+${String(Math.floor(selectedDetailItem.overtime_minutes / 60)).padStart(2, '0')}:${String(selectedDetailItem.overtime_minutes % 60).padStart(2, '0')}`
                        : '—'}
                      {selectedDetailItem.shift_end && selectedDetailItem.check_out
                        ? ` (${selectedDetailItem.shift_end} → ${selectedDetailItem.check_out})`
                        : ''}
                    </span>
                  </div>
                )}

                {selectedDetailItem.request_type === 'regularization' && (
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 flex items-center justify-between">
                    <span className="font-semibold">Punch Adjustment</span>
                    <span className="font-extrabold">{formatCorrectionChange(selectedDetailItem)}</span>
                  </div>
                )}
              </div>

              {/* Full Original Reason / Work Breakdown */}
              <div className="space-y-1.5">
                <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-xs flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  Reason / Detailed Work Summary
                </h4>
                <div className="p-3.5 rounded-xl bg-zinc-100/80 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed text-xs">
                  {selectedDetailItem.reason}
                </div>
              </div>

              {/* Clarification Thread */}
              {(selectedDetailItem.clarification_prompt || selectedDetailItem.clarification_response) && (
                <div className="space-y-2 p-3.5 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
                  <h4 className="font-bold text-blue-900 dark:text-blue-300 text-xs flex items-center gap-1.5">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    Clarification Conversation
                  </h4>
                  {selectedDetailItem.clarification_prompt && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-blue-200 dark:border-blue-800/50 text-xs">
                      <p className="font-bold text-blue-800 dark:text-blue-300 text-[11px]">
                        Reviewer Question:
                      </p>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-0.5">
                        {selectedDetailItem.clarification_prompt}
                      </p>
                      {selectedDetailItem.clarification_requested_at && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {selectedDetailItem.clarification_requested_at.substring(0, 16).replace('T', ' ')}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedDetailItem.clarification_response && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-blue-200 dark:border-blue-800/50 text-xs">
                      <p className="font-bold text-emerald-700 dark:text-emerald-400 text-[11px]">
                        Employee Response:
                      </p>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-0.5 whitespace-pre-wrap">
                        {selectedDetailItem.clarification_response}
                      </p>
                      {selectedDetailItem.clarification_submitted_at && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {selectedDetailItem.clarification_submitted_at.substring(0, 16).replace('T', ' ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Appeal Thread */}
              {(selectedDetailItem.appeal_reason || selectedDetailItem.has_appealed) && (
                <div className="space-y-2 p-3.5 rounded-2xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50">
                  <h4 className="font-bold text-purple-900 dark:text-purple-300 text-xs flex items-center gap-1.5">
                    <CornerUpLeft className="w-3.5 h-3.5 text-purple-600" />
                    Appeal Submission
                  </h4>
                  {selectedDetailItem.rejection_reason && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-purple-200 dark:border-purple-800/50 text-xs">
                      <p className="font-bold text-rose-700 dark:text-rose-400 text-[11px]">
                        Initial Rejection Reason:
                      </p>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-0.5">
                        {selectedDetailItem.rejection_reason}
                      </p>
                    </div>
                  )}
                  {selectedDetailItem.appeal_reason && (
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#11131a] border border-purple-200 dark:border-purple-800/50 text-xs">
                      <p className="font-bold text-purple-800 dark:text-purple-300 text-[11px]">
                        Employee Appeal Statement:
                      </p>
                      <p className="text-zinc-700 dark:text-zinc-300 mt-0.5 whitespace-pre-wrap">
                        {selectedDetailItem.appeal_reason}
                      </p>
                      {selectedDetailItem.appealed_at && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {selectedDetailItem.appealed_at.substring(0, 16).replace('T', ' ')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Status History & Audit Log */}
              <div className="space-y-2">
                <h4 className="font-bold text-zinc-800 dark:text-zinc-200 text-xs flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-zinc-500" />
                  Status & Review Audit Timeline
                </h4>
                <div className="space-y-2 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200 dark:before:bg-zinc-800">
                  {/* Initial Submission */}
                  <div className="flex items-start gap-3 relative pl-6">
                    <div className="w-2.5 h-2.5 rounded-full bg-zinc-400 dark:bg-zinc-600 absolute left-2 top-1.5 ring-4 ring-white dark:ring-[#11131a]" />
                    <div className="flex-1 p-2.5 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 text-[11px] space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-zinc-900 dark:text-zinc-100">
                          Request Submitted
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          {selectedDetailItem.created_at
                            ? selectedDetailItem.created_at.substring(0, 16).replace('T', ' ')
                            : 'Initial'}
                        </span>
                      </div>
                      <p className="text-zinc-500">
                        By <strong className="text-zinc-700 dark:text-zinc-300">{selectedDetailItem.user_name}</strong> ({selectedDetailItem.user_role || 'Staff'})
                      </p>
                    </div>
                  </div>

                  {/* Status History Transitions */}
                  {selectedDetailItem.status_history && selectedDetailItem.status_history.map((hist, idx) => (
                    <div key={idx} className="flex items-start gap-3 relative pl-6">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600 absolute left-2 top-1.5 ring-4 ring-white dark:ring-[#11131a]" />
                      <div className="flex-1 p-2.5 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 text-[11px] space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-zinc-900 dark:text-zinc-100 capitalize">
                            {hist.from_status} → {hist.to_status}
                          </span>
                          <span className="text-[10px] text-zinc-400">
                            {hist.changed_at ? hist.changed_at.substring(0, 16).replace('T', ' ') : ''}
                          </span>
                        </div>
                        <p className="text-zinc-500">
                          By <strong className="text-zinc-700 dark:text-zinc-300">{hist.changed_by_name}</strong>{' '}
                          {hist.changed_by_role ? `(${hist.changed_by_role})` : ''}
                        </p>
                        {hist.reason && (
                          <p className="text-zinc-600 dark:text-zinc-400 italic mt-0.5">
                            "{hist.reason}"
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#161822] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedDetailItem(null)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Close
              </button>

              <div className="flex items-center gap-2">
                {/* Review Buttons */}
                {(selectedDetailItem.status === 'pending' || selectedDetailItem.status === 'appealed') &&
                  canReviewLeaveRequest(user?.id, user?.role, selectedDetailItem) && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenReview(selectedDetailItem, 'approved')}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenReview(selectedDetailItem, 'needs_info')}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-sm cursor-pointer"
                      >
                        Ask Info
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenReview(selectedDetailItem, 'rejected')}
                        className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-sm cursor-pointer"
                      >
                        Reject
                      </button>
                    </>
                  )}

                {/* Edit Status */}
                {(selectedDetailItem.status === 'approved' || selectedDetailItem.status === 'rejected') &&
                  canEditLeaveStatus(user?.id, user?.role, selectedDetailItem) && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditStatus(selectedDetailItem)}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Status
                    </button>
                  )}

                {/* Clarification Reply for Applicant */}
                {selectedDetailItem.status === 'needs_info' &&
                  user?.id &&
                  String(user.id) === String(selectedDetailItem.user_id) && (
                    <button
                      type="button"
                      onClick={() => {
                        setClarifyingItem(selectedDetailItem);
                        setClarifyResponseText('');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-sm cursor-pointer"
                    >
                      Reply to Clarification
                    </button>
                  )}

                {/* Single-use Appeal for Applicant */}
                {selectedDetailItem.status === 'rejected' &&
                  user?.id &&
                  String(user.id) === String(selectedDetailItem.user_id) &&
                  !selectedDetailItem.has_appealed && (
                    <button
                      type="button"
                      onClick={() => {
                        setAppealingItem(selectedDetailItem);
                        setAppealReasonText('');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-sm cursor-pointer"
                    >
                      Appeal Rejection
                    </button>
                  )}

                {/* Delete Request */}
                {canDeleteLeaveRequest(user?.id, user?.role, selectedDetailItem) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeletingItem(selectedDetailItem);
                    }}
                    className="p-2 rounded-xl text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors cursor-pointer"
                    title="Delete Request"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. Review Modal Dialog (Approve, Reject, Request Info) */}
      {/* ────────────────────────────────────────────────────────── */}
      {reviewingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {reviewingItem.action === 'approved' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : reviewingItem.action === 'needs_info' ? (
                  <HelpCircle className="w-4 h-4 text-blue-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {reviewingItem.action === 'approved'
                    ? 'Approve'
                    : reviewingItem.action === 'needs_info'
                    ? 'Request Clarification for'
                    : 'Reject'}{' '}
                  {reviewingItem.request.request_type.replace('_', ' ')}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setReviewingItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 text-xs space-y-1 text-zinc-600 dark:text-zinc-300">
              <p>
                <strong>Applicant:</strong> {reviewingItem.request.user_name} ({reviewingItem.request.department})
              </p>
              <p>
                <strong>Dates / Time:</strong> {reviewingItem.request.start_date}{' '}
                {reviewingItem.request.end_date !== reviewingItem.request.start_date
                  ? `to ${reviewingItem.request.end_date}`
                  : ''}
              </p>
              <p>
                <strong>Reason:</strong> {reviewingItem.request.reason}
              </p>
            </div>

            <form onSubmit={handleConfirmReview} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  {reviewingItem.action === 'approved'
                    ? 'Approver Comment (Optional)'
                    : reviewingItem.action === 'needs_info'
                    ? 'Information / Proof Needed from Employee (Mandatory)'
                    : 'Rejection Reason (Mandatory)'}
                </label>
                <textarea
                  rows={3}
                  required={reviewingItem.action !== 'approved'}
                  placeholder={
                    reviewingItem.action === 'approved'
                      ? 'Add any approval remarks or instructions...'
                      : reviewingItem.action === 'needs_info'
                      ? 'Specify what additional proof, tickets, or breakdown you require...'
                      : 'State reason for request decline...'
                  }
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewingItem(null)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className={`px-4 py-2 rounded-xl text-white font-bold cursor-pointer disabled:opacity-50 ${
                    reviewingItem.action === 'approved'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-md shadow-emerald-600/20'
                      : reviewingItem.action === 'needs_info'
                      ? 'bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20'
                      : 'bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/20'
                  }`}
                >
                  {isProcessing
                    ? 'Processing...'
                    : reviewingItem.action === 'approved'
                    ? 'Confirm Approval'
                    : reviewingItem.action === 'needs_info'
                    ? 'Send Request for Info'
                    : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 3. Status Edit / Undo Modal Dialog */}
      {/* ────────────────────────────────────────────────────────── */}
      {editingStatusItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <span>Edit / Reverse Request Status</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStatusItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-[#161822] border border-zinc-200 dark:border-zinc-800 text-xs space-y-1 text-zinc-600 dark:text-zinc-300">
              <p>
                <strong>Applicant:</strong> {editingStatusItem.user_name} ({editingStatusItem.department})
              </p>
              <p>
                <strong>Current Status:</strong> <span className="font-bold capitalize">{editingStatusItem.status}</span>
              </p>
            </div>

            <form onSubmit={handleConfirmEditStatus} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  New Status
                </label>
                <CustomSelect
                  value={editStatusValue}
                  onChange={(val) => setEditStatusValue(val as RequestStatus)}
                  options={[
                    { value: 'approved', label: 'Approved', icon: CheckCircle2 },
                    { value: 'rejected', label: 'Rejected', icon: XCircle },
                    { value: 'cancelled', label: 'Cancelled', icon: Trash2 },
                  ]}
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Reason for Status Change (Mandatory for Audit Trail)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this decision is being modified (e.g. Discovered error in checkout time / verified overtime proof)..."
                  value={editStatusReason}
                  onChange={(e) => setEditStatusReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingStatusItem(null)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Saving...' : 'Update Status & Recalculate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 4. Clarification Reply Modal Dialog (For Employee) */}
      {/* ────────────────────────────────────────────────────────── */}
      {clarifyingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                <span>Provide Requested Clarification</span>
              </h3>
              <button
                type="button"
                onClick={() => setClarifyingItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {clarifyingItem.clarification_prompt && (
              <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                <p className="font-bold text-[11px]">HR / Reviewer Question:</p>
                <p className="leading-relaxed">{clarifyingItem.clarification_prompt}</p>
              </div>
            )}

            <form onSubmit={handleConfirmClarification} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Your Explanation / Response
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide detailed breakdown or answer the reviewer's inquiry..."
                  value={clarifyResponseText}
                  onChange={(e) => setClarifyResponseText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClarifyingItem(null)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Submitting...' : 'Submit Clarification'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 5. Appeal Modal Dialog (For Employee, Single-Use) */}
      {/* ────────────────────────────────────────────────────────── */}
      {appealingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <CornerUpLeft className="w-4 h-4 text-blue-600" />
                <span>Appeal Rejected Request</span>
              </h3>
              <button
                type="button"
                onClick={() => setAppealingItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-bold text-[11px] flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-blue-600" /> Single-Use Appeal
              </p>
              <p className="leading-relaxed">
                You can only submit an appeal once for this request. Please provide a clear, comprehensive justification.
              </p>
              {appealingItem.rejection_reason && (
                <p className="text-[11px] pt-1 text-rose-700 dark:text-rose-300">
                  <strong>Rejection Note:</strong> {appealingItem.rejection_reason}
                </p>
              )}
            </div>

            <form onSubmit={handleConfirmAppeal} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 dark:text-zinc-300 mb-1">
                  Appeal Rationale
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Explain why this request should be reconsidered..."
                  value={appealReasonText}
                  onChange={(e) => setAppealReasonText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAppealingItem(null)}
                  className="px-4 py-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 rounded-xl text-white font-bold bg-blue-600 hover:bg-blue-500 shadow-md shadow-blue-600/20 cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? 'Submitting...' : 'Submit Appeal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 6. Delete Confirmation Modal Dialog */}
      {/* ────────────────────────────────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-sm p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-rose-600 flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>Delete Request</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              Are you sure you want to delete this <strong className="capitalize">{deletingItem.request_type.replace('_', ' ')}</strong> request for <strong>{deletingItem.start_date}</strong>? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isProcessing}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/20 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

