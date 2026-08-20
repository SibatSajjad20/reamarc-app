import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import type { AttendanceRequest, RequestStatus } from '../../types/attendance';
import { attendanceService } from '../../services/attendanceService';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../ui/CustomSelect';

interface ApprovalInboxSectionProps {
  requests: AttendanceRequest[];
  isLoading?: boolean;
  onRefresh: () => void;
  canReview?: boolean;
}

export const ApprovalInboxSection: React.FC<ApprovalInboxSectionProps> = ({
  requests,
  onRefresh,
  canReview = true,
}) => {
  const { addToast } = useToast();
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Review Modal State
  const [reviewingItem, setReviewingItem] = useState<{
    request: AttendanceRequest;
    action: 'approved' | 'rejected';
  } | null>(null);
  const [deletingItem, setDeletingItem] = useState<AttendanceRequest | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filtered Requests
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      const matchesType =
        typeFilter === 'All' ||
        (typeFilter === 'leave' && req.request_type === 'leave') ||
        (typeFilter === 'short_leave' && req.request_type === 'short_leave') ||
        (typeFilter === 'wfh' && req.request_type === 'wfh') ||
        (typeFilter === 'regularization' && req.request_type === 'regularization');

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
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  const handleOpenReview = (request: AttendanceRequest, action: 'approved' | 'rejected') => {
    setReviewingItem({ request, action });
    setReviewComment('');
  };

  const handleConfirmReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewingItem) return;

    if (reviewingItem.action === 'rejected' && !reviewComment.trim()) {
      addToast('Rejection Reason Required', 'Please provide a justification for declining this request.', 'warning');
      return;
    }

    try {
      setIsProcessing(true);
      await attendanceService.reviewRequest(reviewingItem.request.id, {
        status: reviewingItem.action,
        review_comments: reviewComment.trim() || undefined,
      });

      addToast(
        reviewingItem.action === 'approved' ? 'Request Approved 🎉' : 'Request Rejected',
        `The ${reviewingItem.request.request_type.replace('_', ' ')} for ${reviewingItem.request.user_name} has been ${reviewingItem.action}.`,
        reviewingItem.action === 'approved' ? 'success' : 'info'
      );

      setReviewingItem(null);
      onRefresh();
    } catch (err: any) {
      addToast('Review Failed', err.message || 'Could not process request review.', 'error');
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Submissions</span>
            <p className="text-xl font-extrabold text-zinc-900 dark:text-zinc-100 mt-0.5">{totalCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            <Inbox className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pending Review</span>
            <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-0.5">{pendingCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Approved</span>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{approvedCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#11131a] border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Rejected</span>
            <p className="text-xl font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">{rejectedCount}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
            <XCircle className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Control Bar: Filters & Search */}
      <div className="p-4 bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/80 text-xs font-bold">
            {(
              [
                { id: 'All', label: 'All Submissions', count: totalCount },
                { id: 'pending', label: 'Pending', count: pendingCount },
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
                <th className="py-3 px-4">Reason / Handover Notes</th>
                <th className="py-3 px-4">Submitted At</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-2 text-zinc-400 dark:text-zinc-500">
                      <Inbox className="w-8 h-8 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">No requests found</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Nothing matches the current filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const isPending = req.status === 'pending';

                  return (
                    <tr
                      key={req.id}
                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      {/* Applicant */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] flex items-center justify-center">
                            {req.user_name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                              {req.user_name}
                            </p>
                            <p className="text-[10px] text-zinc-400">{req.department}</p>
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
                            <p className="text-[10px] text-zinc-400 font-mono">
                              {req.short_leave_start_time} ({req.short_leave_duration_hours}h duration)
                            </p>
                          </div>
                        ) : req.request_type === 'regularization' ? (
                          <div>
                            <p className="font-semibold">{req.start_date}</p>
                            <p className="text-[10px] text-zinc-400 font-mono">
                              {req.correction_target === 'time_in'
                                ? `Time In: ${req.regularization_punch_in || req.regularization_check_in || '--'} (In Only)`
                                : req.correction_target === 'time_out'
                                ? `Time Out: ${req.regularization_punch_out || req.regularization_check_out || '--'} (Out Only)`
                                : `In: ${req.regularization_punch_in || req.regularization_check_in || '--'} | Out: ${req.regularization_punch_out || req.regularization_check_out || '--'}`}
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

                      {/* Reason */}
                      <td className="py-3.5 px-4 text-zinc-600 dark:text-zinc-400 max-w-xs truncate" title={req.reason}>
                        {req.reason}
                        {req.rejection_reason && (
                          <p className="text-[10px] text-rose-600 font-semibold mt-0.5 truncate">
                            Note: {req.rejection_reason}
                          </p>
                        )}
                      </td>

                      {/* Submitted At */}
                      <td className="py-3.5 px-4 text-zinc-400 whitespace-nowrap text-[11px]">
                        {req.created_at ? req.created_at.substring(0, 10) : 'Recent'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderStatusBadge(req.status)}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {canReview && isPending && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenReview(req, 'approved')}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900 border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReview(req, 'rejected')}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900 border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {!canReview && !isPending && req.reviewed_by_name && (
                            <span className="text-[11px] text-zinc-400 mr-1">
                              By {req.reviewed_by_name}
                            </span>
                          )}
                          {/* Delete / Cancel Request Button */}
                          <button
                            type="button"
                            onClick={() => setDeletingItem(req)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete / Cancel Request"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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

      {/* Review Modal Dialog */}
      {reviewingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#11131a] rounded-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {reviewingItem.action === 'approved' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
                <span>
                  {reviewingItem.action === 'approved' ? 'Approve' : 'Reject'}{' '}
                  {reviewingItem.request.request_type.replace('_', ' ')}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setReviewingItem(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg"
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
                {reviewingItem.request.request_type === 'regularization' && (
                  <span className="font-semibold text-amber-600 dark:text-amber-400 ml-1">
                    [{reviewingItem.request.correction_target === 'time_in'
                      ? `Time In: ${reviewingItem.request.regularization_punch_in || reviewingItem.request.regularization_check_in || '--'}`
                      : reviewingItem.request.correction_target === 'time_out'
                      ? `Time Out: ${reviewingItem.request.regularization_punch_out || reviewingItem.request.regularization_check_out || '--'}`
                      : `In: ${reviewingItem.request.regularization_punch_in || '--'} | Out: ${reviewingItem.request.regularization_punch_out || '--'}`}]
                  </span>
                )}
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
                    : 'Rejection Reason (Mandatory)'}
                </label>
                <textarea
                  rows={2}
                  required={reviewingItem.action === 'rejected'}
                  placeholder={
                    reviewingItem.action === 'approved'
                      ? 'Add any approval remarks or instructions...'
                      : 'State reason for request decline...'
                  }
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400"
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
                      : 'bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/20'
                  }`}
                >
                  {isProcessing
                    ? 'Processing...'
                    : reviewingItem.action === 'approved'
                    ? 'Confirm Approval'
                    : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Dialog */}
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
