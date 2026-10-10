import React, { useState, useMemo, useEffect } from 'react';
import {
  Inbox,
  CheckCircle2,
  XCircle,
  Clock,
  Home,
  FileEdit,
  Calendar,
  Search,
  X,
  Trash2,
  MessageSquare,
  Edit3,
  CornerUpLeft,
  HelpCircle,
  Eye,
  MoreVertical,
} from 'lucide-react';
import type { AttendanceRequest, RequestStatus } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { CustomSelect } from '../ui/CustomSelect';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusPill } from '../ui/StatusPill';
import { Button } from '../ui/button';
import { Callout } from '../ui/Callout';
import { cn } from '../../lib/utils';
import { isFuturePktClockTime } from '../../constants/attendance';
import { formatHours } from '../../utils/logTimeChecks';
import {
  canDeleteLeaveRequest,
  canReviewLeaveRequest,
  canEditLeaveStatus,
  reviewScopeHint,
} from '../../utils/leaveRequestAccess';
import { RequestDetailsSheet } from './RequestDetailsSheet';
import { Avatar } from '../ui/Avatar';
import { useMemberAvatars } from '../../hooks/useMemberAvatars';
import {
  isClarifiedPending,
  requestActivityAt,
  requestReasonPreview,
} from '../../utils/leaveClarificationDisplay';

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
  isLoading = false,
  onRefresh,
  canReview = true,
}) => {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { getAvatarUrl } = useMemberAvatars();
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
  const [deleteIsHard, setDeleteIsHard] = useState(true);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

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
    const filtered = requests.filter((req) => {
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
        req.reason.toLowerCase().includes(term) ||
        (req.clarification_response || '').toLowerCase().includes(term) ||
        (req.clarification_prompt || '').toLowerCase().includes(term);

      return matchesType && matchesStatus && matchesSearch;
    });

    return [...filtered].sort((a, b) => requestActivityAt(b).localeCompare(requestActivityAt(a)));
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
          ? 'Request approved'
          : reviewingItem.action === 'needs_info'
          ? 'Asked for more info'
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
      addToast('Status updated', `Request status changed to ${editStatusValue}. Timesheet synced.`, 'success');
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
      addToast('Details sent', 'Your updated details have been submitted for review.', 'success');
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
      addToast('Appeal sent', 'Your request has been reopened under appeal for review.', 'info');
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-info-bg text-info-fg border border-info-bd">
            <Calendar className="w-3 h-3" /> {req.leave_category ? `${req.leave_category} leave` : 'Full leave'}
          </span>
        );
      case 'short_leave':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-info-bg text-info-fg border border-info-bd">
            <Clock className="w-3 h-3" /> Short leave
            {req.short_leave_duration_hours ? ` (${formatHours(req.short_leave_duration_hours)})` : ''}
          </span>
        );
      case 'wfh':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-soft-2 text-accent-text border border-accent-200">
            <Home className="w-3 h-3" /> WFH
          </span>
        );
      case 'regularization':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning-bg text-warning-fg border border-warning-bd">
            <FileEdit className="w-3 h-3" /> Correction
          </span>
        );
      case 'overtime':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success-bg text-success-fg border border-success-bd">
            <Clock className="w-3 h-3" /> Overtime
            {req.overtime_minutes ? ` (+${String(Math.floor(req.overtime_minutes / 60)).padStart(2, '0')}:${String(req.overtime_minutes % 60).padStart(2, '0')})` : ''}
          </span>
        );
      default:
        return null;
    }
  };

  const renderStatusBadge = (req: Pick<AttendanceRequest, 'status' | 'clarification_response'>) => {
    if (isClarifiedPending(req)) {
      return <StatusPill variant="success" label="Clarified" />;
    }
    return <StatusPill status={req.status} />;
  };

  return (
    <div className="space-y-4">
      {/* Top Summary Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total', count: totalCount, icon: Inbox, colorClass: 'text-fg' },
          { label: 'Pending', count: pendingCount, icon: Clock, colorClass: 'text-warning-fg' },
          { label: 'Appealed', count: appealedCount, icon: CornerUpLeft, colorClass: 'text-accent-text' },
          { label: 'Needs info', count: needsInfoCount, icon: HelpCircle, colorClass: 'text-info-fg' },
          { label: 'Approved', count: approvedCount, icon: CheckCircle2, colorClass: 'text-success-fg' },
          { label: 'Rejected', count: rejectedCount, icon: XCircle, colorClass: 'text-danger-fg' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="p-3 rounded-lg bg-surface border border-border shadow-xs flex items-center justify-between">
              <div>
                <span className="text-small font-medium text-fg-muted">{item.label}</span>
                {isLoading && requests.length === 0 ? (
                  <div className="h-6 w-8 bg-skel rounded-xs animate-pulse mt-0.5" />
                ) : (
                  <p className={cn('text-h3 font-semibold font-numeric mt-0.5', item.colorClass)}>{item.count}</p>
                )}
              </div>
              <div className="p-2 rounded-md bg-subtle text-fg-muted">
                <Icon className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="p-3.5 bg-surface rounded-lg border border-border shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            value={statusFilter}
            onValueChange={(val: string) => setStatusFilter(val as any)}
            size="sm"
            options={[
              { value: 'All', label: 'All', count: isLoading && requests.length === 0 ? undefined : totalCount },
              { value: 'pending', label: 'Pending', count: isLoading && requests.length === 0 ? undefined : pendingCount },
              { value: 'appealed', label: 'Appealed', count: appealedCount > 0 ? appealedCount : undefined },
              { value: 'needs_info', label: 'Needs info', count: needsInfoCount > 0 ? needsInfoCount : undefined },
              { value: 'approved', label: 'Approved', count: isLoading && requests.length === 0 ? undefined : approvedCount },
              { value: 'rejected', label: 'Rejected', count: isLoading && requests.length === 0 ? undefined : rejectedCount },
            ]}
          />

          {/* Type Filter */}
          <div className="w-48">
            <CustomSelect
              value={typeFilter}
              onChange={setTypeFilter}
              options={[
                { value: 'All', label: 'Type: All requests' },
                { value: 'leave', label: 'Type: Full leave' },
                { value: 'short_leave', label: 'Type: Short leave' },
                { value: 'wfh', label: 'Type: WFH' },
                { value: 'regularization', label: 'Type: Correction' },
                { value: 'overtime', label: 'Type: Overtime' },
              ]}
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search applicant / reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 rounded-md bg-surface border border-border-strong text-xs text-fg placeholder:text-fg-faint focus-visible:focus-ring w-56"
          />
        </div>
      </div>

      {/* Requests Table */}
      <div className="bg-surface rounded-lg border border-border shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-border flex items-center justify-between">
          <h3 className="text-h3 font-semibold text-fg flex items-center gap-2">
            <Inbox className="w-4 h-4 text-fg-muted" />
            <span>{canReview ? 'Approval inbox and request log' : 'My submitted requests'}</span>
          </h3>
          <span className="text-small text-fg-muted">
            {isLoading && requests.length === 0 ? 'Loading requests...' : `${filteredRequests.length} requests displayed`}
          </span>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar">
          <table className="w-full text-left text-table border-collapse">
            <thead className="sticky top-0 z-10 bg-canvas border-b border-border shadow-xs">
              <tr className="text-fg-muted text-xs font-medium">
                <th className="py-2.5 px-3 font-medium">Applicant</th>
                <th className="py-2.5 px-3 font-medium">Request type</th>
                <th className="py-2.5 px-3 font-medium">Dates and time</th>
                <th className="py-2.5 px-3 font-medium max-w-sm">Reason and work details</th>
                <th className="py-2.5 px-3 font-medium">Status</th>
                <th className="py-2.5 px-3 font-medium text-right w-16">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-normal">
              {isLoading && requests.length === 0 ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={`req-skeleton-${idx}`} className="h-10 animate-pulse">
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-skel shrink-0" />
                        <div className="space-y-1">
                          <div className="h-3.5 w-24 bg-skel rounded-xs" />
                          <div className="h-2.5 w-16 bg-skel rounded-xs" />
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="h-5 w-20 bg-skel rounded-md" />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        <div className="h-3.5 w-28 bg-skel rounded-xs" />
                        <div className="h-2.5 w-16 bg-skel rounded-xs" />
                      </div>
                    </td>
                    <td className="py-2.5 px-3 max-w-sm">
                      <div className="h-3.5 w-48 bg-skel rounded-xs" />
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="h-5 w-20 bg-skel rounded-full" />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="h-6 w-12 bg-skel rounded-md ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-fg-muted">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-fg-faint" />
                    <p className="text-body font-medium text-fg">No requests found</p>
                    <p className="text-small text-fg-muted mt-0.5">Nothing matches the current filters.</p>
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
                      className="h-10 hover:bg-hover/60 transition-colors cursor-pointer group"
                    >
                      {/* Applicant */}
                      <td className="py-2 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Avatar
                            name={req.user_name}
                            src={(req as any).avatar_url || getAvatarUrl(req.user_id, req.user_name)}
                            size={24}
                            className="rounded-md shrink-0"
                          />
                          <div>
                            <p className="font-medium text-fg leading-tight">
                              {req.user_name}
                            </p>
                            <p className="text-micro text-fg-muted">
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
                      <td className="py-3.5 px-4 whitespace-nowrap text-fg">
                        {req.request_type === 'short_leave' ? (
                          <div>
                            <p className="font-semibold">{req.start_date}</p>
                            <p className="text-xs text-fg-muted font-numeric">
                              {req.short_leave_start_time}
                              {req.short_leave_end_time ? ` → ${req.short_leave_end_time}` : ''} ({formatHours(req.short_leave_duration_hours || 0)} duration)
                            </p>
                          </div>
                        ) : req.request_type === 'regularization' ? (
                          <div>
                            <p className="font-semibold">{req.start_date}</p>
                            <p className="text-xs text-fg-muted font-numeric">
                              {formatCorrectionChange(req)}
                            </p>
                            <p className="text-xs text-fg-muted">
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
                            <p className="text-xs text-fg-muted font-numeric">
                              Shift end {req.shift_end || '—'} → Out {req.check_out || '—'}
                            </p>
                          </div>
                        ) : req.start_date === req.end_date ? (
                          <span className="font-semibold">{req.start_date}</span>
                        ) : (
                          <span className="font-semibold">
                            {req.start_date} <span className="text-fg-muted">to</span> {req.end_date}
                          </span>
                        )}
                      </td>

                      {/* Reason Column: Clean clamped preview without clutter link */}
                      <td className="py-3.5 px-4 text-fg-muted max-w-xs">
                        <div className="space-y-1">
                          <p className="line-clamp-2 text-fg">
                            {requestReasonPreview(req)}
                          </p>

                          {/* Extra info banners */}
                          {req.clarification_prompt && !isClarifiedPending(req) && (
                            <div className="flex items-center gap-1 text-xs text-accent-text font-semibold truncate">
                              <HelpCircle className="w-3 h-3 shrink-0" />
                              <span className="truncate">HR: {req.clarification_prompt}</span>
                            </div>
                          )}

                          {req.appeal_reason && (
                            <div className="flex items-center gap-1 text-xs text-accent-text font-semibold truncate">
                              <CornerUpLeft className="w-3 h-3 shrink-0" />
                              <span className="truncate">Appeal: {req.appeal_reason}</span>
                            </div>
                          )}

                          {(req.rejection_reason || req.review_comments) && !req.clarification_prompt && (
                            <p className="text-xs text-danger-fg font-semibold truncate">
                              Note: {req.rejection_reason || req.review_comments}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          {renderStatusBadge(req)}
                          {isPendingOrAppealed && !canReviewThis && scopeHint && (
                            <p className="text-xs text-fg-muted max-w-[10rem] truncate" title={scopeHint}>
                              {scopeHint}
                            </p>
                          )}
                          {!canReview && !isPendingOrAppealed && req.reviewed_by_name && (
                            <p className="text-xs text-fg-muted">
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
                            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-hover transition-colors cursor-pointer"
                            title="Actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>

                          {openDropdownId === req.id && (
                            <div
                              className="absolute right-0 top-full mt-1 w-52 bg-surface rounded-xl border border-border shadow-md py-1 z-30 text-xs text-left animate-in fade-in zoom-in-95 duration-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* 1. View Full Details */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenDropdownId(null);
                                  setSelectedDetailItem(req);
                                }}
                                className="w-full px-3 py-2 text-left text-fg-2 hover:bg-hover flex items-center gap-2 font-medium cursor-pointer transition-colors"
                              >
                                <Eye className="w-3.5 h-3.5 text-fg-muted" />
                                <span>View Full Details</span>
                              </button>

                              {/* Reviewer actions on pending/appealed requests */}
                              {canReviewThis && (
                                <>
                                  <div className="my-1 border-t border-border" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenReview(req, 'approved');
                                    }}
                                    className="w-full px-3 py-2 text-left text-success-fg hover:bg-success-bg flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-success-fg" />
                                    <span>Approve Request</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenReview(req, 'needs_info');
                                    }}
                                    className="w-full px-3 py-2 text-left text-accent-text hover:bg-accent-soft flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5 text-accent-text" />
                                    <span>Ask for Info</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenReview(req, 'rejected');
                                    }}
                                    className="w-full px-3 py-2 text-left text-danger-fg hover:bg-danger-bg flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <XCircle className="w-3.5 h-3.5 text-danger-fg" />
                                    <span>Reject Request</span>
                                  </button>
                                </>
                              )}

                              {/* Reviewer Edit Status on already resolved requests */}
                              {canEditThis && (
                                <>
                                  <div className="my-1 border-t border-border" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      handleOpenEditStatus(req);
                                    }}
                                    className="w-full px-3 py-2 text-left text-accent-text hover:bg-accent-soft flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-accent-text" />
                                    <span>Edit Decision</span>
                                  </button>
                                </>
                              )}

                              {/* Employee action: Reply to clarification */}
                              {isNeedsInfo && isMyRequest && (
                                <>
                                  <div className="my-1 border-t border-border" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setClarifyingItem(req);
                                      setClarifyResponseText('');
                                    }}
                                    className="w-full px-3 py-2 text-left text-accent-text hover:bg-accent-soft flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-accent-text" />
                                    <span>Reply to HR</span>
                                  </button>
                                </>
                              )}

                              {/* Employee action: Single-use Appeal */}
                              {req.status === 'rejected' && isMyRequest && !req.has_appealed && (
                                <>
                                  <div className="my-1 border-t border-border" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setAppealingItem(req);
                                      setAppealReasonText('');
                                    }}
                                    className="w-full px-3 py-2 text-left text-accent-text hover:bg-accent-soft flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <CornerUpLeft className="w-3.5 h-3.5 text-accent-text" />
                                    <span>Appeal Rejection</span>
                                  </button>
                                </>
                              )}

                              {/* Delete Request */}
                              {canDeleteThis && (
                                <>
                                  <div className="my-1 border-t border-border" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenDropdownId(null);
                                      setDeletingItem(req);
                                    }}
                                    className="w-full px-3 py-2 text-left text-danger-fg hover:bg-danger-bg flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-danger-fg" />
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
      <RequestDetailsSheet
        isOpen={Boolean(selectedDetailItem)}
        onClose={() => setSelectedDetailItem(null)}
        request={selectedDetailItem}
        currentUser={user}
        onReview={(req, action) => handleOpenReview(req, action)}
        onEditStatus={(req) => handleOpenEditStatus(req)}
        onClarify={(req) => {
          setClarifyingItem(req);
          setClarifyResponseText('');
        }}
        onAppeal={(req) => {
          setAppealingItem(req);
          setAppealReasonText('');
        }}
        onDelete={(req, isHard) => {
          setDeleteIsHard(isHard);
          setDeletingItem(req);
        }}
      />

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. Review Modal Dialog (Approve, Reject, Request Info) */}
      {/* ────────────────────────────────────────────────────────── */}
      {reviewingItem && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-md p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                {reviewingItem.action === 'approved' ? (
                  <CheckCircle2 className="w-4 h-4 text-success-fg" />
                ) : reviewingItem.action === 'needs_info' ? (
                  <HelpCircle className="w-4 h-4 text-info-fg" />
                ) : (
                  <XCircle className="w-4 h-4 text-danger-fg" />
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
                className="text-fg-muted hover:text-fg p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-subtle border border-border text-xs space-y-1 text-fg-2">
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
                <label className="block font-medium text-fg mb-1">
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
                  className="w-full px-3 py-2 rounded-md bg-surface border border-border text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setReviewingItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isProcessing}
                  variant={reviewingItem.action === 'rejected' ? 'danger' : 'primary'}
                  
                >
                  {isProcessing
                    ? 'Processing...'
                    : reviewingItem.action === 'approved'
                    ? 'Confirm Approval'
                    : reviewingItem.action === 'needs_info'
                    ? 'Send Request for Info'
                    : 'Confirm Rejection'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 3. Status Edit / Undo Modal Dialog */}
      {/* ────────────────────────────────────────────────────────── */}
      {editingStatusItem && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-md p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-accent" />
                <span>Edit / Reverse Request Status</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStatusItem(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-subtle border border-border text-xs space-y-1 text-fg-2">
              <p>
                <strong>Applicant:</strong> {editingStatusItem.user_name} ({editingStatusItem.department})
              </p>
              <p>
                <strong>Current Status:</strong> <span className="font-semibold capitalize">{editingStatusItem.status}</span>
              </p>
            </div>

            <form onSubmit={handleConfirmEditStatus} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-fg mb-1">
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
                <label className="block font-medium text-fg mb-1">
                  Reason for Status Change (Mandatory for Audit Trail)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this decision is being modified (e.g. Discovered error in checkout time / verified overtime proof)..."
                  value={editStatusReason}
                  onChange={(e) => setEditStatusReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-surface border border-border text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingStatusItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Saving...' : 'Update Status & Recalculate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 4. Clarification Reply Modal Dialog (For Employee) */}
      {/* ────────────────────────────────────────────────────────── */}
      {clarifyingItem && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-md p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-info-fg" />
                <span>Provide Requested Clarification</span>
              </h3>
              <button
                type="button"
                onClick={() => setClarifyingItem(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {clarifyingItem.clarification_prompt && (
              <Callout variant="info" title="HR / Reviewer Question:">
                {clarifyingItem.clarification_prompt}
              </Callout>
            )}

            <form onSubmit={handleConfirmClarification} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-fg mb-1">
                  Your Explanation / Response
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide detailed breakdown or answer the reviewer's inquiry..."
                  value={clarifyResponseText}
                  onChange={(e) => setClarifyResponseText(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-surface border border-border text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setClarifyingItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Submitting...' : 'Submit Clarification'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 5. Appeal Modal Dialog (For Employee, Single-Use) */}
      {/* ────────────────────────────────────────────────────────── */}
      {appealingItem && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-md p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <CornerUpLeft className="w-4 h-4 text-accent" />
                <span>Appeal Rejected Request</span>
              </h3>
              <button
                type="button"
                onClick={() => setAppealingItem(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <Callout variant="warning" title="Single-Use Appeal">
              <p>You can only submit an appeal once for this request. Please provide a clear, comprehensive justification.</p>
              {appealingItem.rejection_reason && (
                <p className="text-xs pt-1 text-danger-fg">
                  <strong>Rejection Note:</strong> {appealingItem.rejection_reason}
                </p>
              )}
            </Callout>

            <form onSubmit={handleConfirmAppeal} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-fg mb-1">
                  Appeal Rationale
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Explain why this request should be reconsidered..."
                  value={appealReasonText}
                  onChange={(e) => setAppealReasonText(e.target.value)}
                  className="w-full px-3 py-2 rounded-md bg-surface border border-border text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAppealingItem(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isProcessing}
                >
                  {isProcessing ? 'Submitting...' : 'Submit Appeal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* 6. Delete Confirmation Modal Dialog */}
      {/* ────────────────────────────────────────────────────────── */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-overlay flex items-center justify-center p-4">
          <div className="bg-surface rounded-lg border border-border w-full max-w-sm p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h3 className="text-sm font-semibold text-danger-fg flex items-center gap-2">
                <Trash2 className="w-4 h-4" />
                <span>Delete Request</span>
              </h3>
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="text-fg-muted hover:text-fg p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-fg-2">
              {deleteIsHard ? (
                <>
                  Are you sure you want to cancel and withdraw this{' '}
                  <strong className="capitalize text-fg">{deletingItem.request_type.replace('_', ' ')}</strong> request
                  for <strong className="text-fg">{deletingItem.start_date}</strong>? It will be removed for everyone.
                </>
              ) : (
                <>
                  Remove this{' '}
                  <strong className="capitalize text-fg">{deletingItem.request_type.replace('_', ' ')}</strong> request
                  for <strong className="text-fg">{deletingItem.start_date}</strong> from your list? Approvers and Admin
                  keep the record.
                </>
              )}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeletingItem(null)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                disabled={isProcessing}
              >
                {isProcessing ? 'Processing...' : deleteIsHard ? 'Cancel Request' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

