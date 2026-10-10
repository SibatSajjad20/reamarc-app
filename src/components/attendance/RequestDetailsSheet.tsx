import React, { useState } from 'react';
import {
  MoreHorizontal,
  Copy,
  Check,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  Trash2,
  Edit3,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/Avatar';
import { useMemberAvatars } from '@/hooks/useMemberAvatars';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { AttendanceRequest } from '@/types/attendance';
import { getRoleDisplayName } from '@/lib/roleLabel';
import {
  canReviewLeaveRequest,
  canEditLeaveStatus,
  canDeleteLeaveRequest,
  reviewScopeHint,
} from '@/utils/leaveRequestAccess';
import {
  formatPktDateTimeWithRelative,
  formatPktDate,
  formatPktDateRange,
  formatOvertimeMinutes,
  formatCorrectionChange,
} from '@/utils/datetime';

interface RequestDetailsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  request: AttendanceRequest | null;
  currentUser: {
    id?: string;
    role?: string;
    name?: string;
  } | null;
  onReview?: (request: AttendanceRequest, action: 'approved' | 'rejected' | 'needs_info') => void;
  onEditStatus?: (request: AttendanceRequest) => void;
  onClarify?: (request: AttendanceRequest) => void;
  onAppeal?: (request: AttendanceRequest) => void;
  onDelete?: (request: AttendanceRequest, isHardDelete: boolean) => void;
}

export const RequestDetailsSheet: React.FC<RequestDetailsSheetProps> = ({
  isOpen,
  onClose,
  request,
  currentUser,
  onReview,
  onEditStatus,
  onClarify,
  onAppeal,
  onDelete,
}) => {
  const { getAvatarUrl } = useMemberAvatars();
  const [copiedId, setCopiedId] = useState(false);

  if (!request) return null;

  const isApplicant = Boolean(
    currentUser?.id && request.user_id && String(currentUser.id) === String(request.user_id)
  );
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
  const canReview = canReviewLeaveRequest(currentUser?.id, currentUser?.role, request);
  const canEdit = canEditLeaveStatus(currentUser?.id, currentUser?.role, request);
  const canDelete = canDeleteLeaveRequest(currentUser?.id, currentUser?.role, request);
  const isInFlight = ['pending', 'needs_info', 'appealed'].includes(request.status);

  const handleCopyId = () => {
    navigator.clipboard.writeText(request.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const getRequestTitle = (req: AttendanceRequest) => {
    switch (req.request_type) {
      case 'leave':
        return 'Leave request';
      case 'short_leave':
        return 'Short leave request';
      case 'wfh':
        return 'WFH request';
      case 'regularization':
        return 'Punch correction request';
      case 'overtime':
        return 'Overtime request';
      default:
        return 'Attendance request';
    }
  };

  const renderStatusBadge = (status: AttendanceRequest['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning-bg text-warning-fg border border-warning-bd">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case 'needs_info':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-info-bg text-info-fg border border-info-bd">
            <HelpCircle className="w-3 h-3" /> Needs info
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success-bg text-success-fg border border-success-bd">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-danger-bg text-danger-fg border border-danger-bd">
            <XCircle className="w-3 h-3" /> Rejected
          </span>
        );
      case 'appealed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning-bg text-warning-fg border border-warning-bd">
            <AlertCircle className="w-3 h-3" /> Appealed
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-subtle text-fg-muted border border-border">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-subtle text-fg-muted border border-border capitalize">
            {status}
          </span>
        );
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] p-0 flex flex-col h-full bg-surface text-fg border-l border-border"
        showClose={true}
      >
        {/* Drawer Header */}
        <SheetHeader className="p-4 border-b border-border bg-surface flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-fg">
                {getRequestTitle(request)}
              </h2>
              {renderStatusBadge(request.status)}
            </div>
          </div>

          {/* Requester Row */}
          <div className="flex items-center gap-2.5 pt-1">
            <Avatar
              name={request.user_name}
              src={(request as any).avatar_url || getAvatarUrl(request.user_id, request.user_name)}
              size={32}
              className="rounded-md shrink-0"
            />
            <div className="min-w-0">
              <p className="font-semibold text-fg text-sm leading-tight truncate">
                {request.user_name}
              </p>
              <p className="text-xs text-fg-muted leading-tight mt-0.5 truncate">
                {getRoleDisplayName(request.user_role)} · {request.department || 'General'}
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs text-fg">
          {/* Facts: 2-column description list */}
          <div>
            <dl className="grid grid-cols-[132px_1fr] gap-y-2.5 text-[13px] leading-relaxed">
              {request.request_type === 'leave' && (
                <>
                  <dt className="text-fg-muted font-medium">Leave type</dt>
                  <dd className="text-fg font-medium capitalize">
                    {request.leave_category ? `${request.leave_category} leave` : 'Full leave'}
                  </dd>
                  <dt className="text-fg-muted font-medium">Dates</dt>
                  <dd className="text-fg font-medium">
                    {formatPktDateRange(request.start_date, request.end_date)}
                  </dd>
                </>
              )}

              {request.request_type === 'short_leave' && (
                <>
                  <dt className="text-fg-muted font-medium">Date</dt>
                  <dd className="text-fg font-medium">{formatPktDate(request.start_date)}</dd>
                  <dt className="text-fg-muted font-medium">Time</dt>
                  <dd className="text-fg font-medium">
                    {request.short_leave_start_time || '—'} – {request.short_leave_end_time || '—'}
                  </dd>
                  {request.short_leave_duration_hours != null && (
                    <>
                      <dt className="text-fg-muted font-medium">Duration</dt>
                      <dd className="text-fg font-medium">
                        {request.short_leave_duration_hours} hour
                        {request.short_leave_duration_hours === 1 ? '' : 's'}
                      </dd>
                    </>
                  )}
                </>
              )}

              {request.request_type === 'wfh' && (
                <>
                  <dt className="text-fg-muted font-medium">Dates</dt>
                  <dd className="text-fg font-medium">
                    {formatPktDateRange(request.start_date, request.end_date)}
                  </dd>
                </>
              )}

              {request.request_type === 'regularization' && (
                <>
                  <dt className="text-fg-muted font-medium">Date</dt>
                  <dd className="text-fg font-medium">
                    {formatPktDate(request.regularization_date || request.start_date)}
                  </dd>
                  <dt className="text-fg-muted font-medium">Change</dt>
                  <dd className="text-fg font-medium">{formatCorrectionChange(request)}</dd>
                </>
              )}

              {request.request_type === 'overtime' && (
                <>
                  <dt className="text-fg-muted font-medium">Date</dt>
                  <dd className="text-fg font-medium">
                    {formatPktDate(request.overtime_date ?? request.start_date)}
                  </dd>
                  <dt className="text-fg-muted font-medium">Overtime claimed</dt>
                  <dd className="text-fg font-medium">
                    {formatOvertimeMinutes(request.overtime_minutes)}
                  </dd>
                  <dt className="text-fg-muted font-medium">Checked out</dt>
                  <dd className="text-fg font-medium">
                    {request.check_out || '—'}
                    {request.shift_end && (
                      <span className="text-fg-muted font-normal"> · shift ended {request.shift_end}</span>
                    )}
                  </dd>
                </>
              )}

              <dt className="text-fg-muted font-medium">Submitted</dt>
              <dd className="text-fg font-medium">
                {formatPktDateTimeWithRelative(request.created_at)}
              </dd>
            </dl>
          </div>

          {/* Reason Section */}
          <div className="space-y-1.5 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-fg-muted">Reason</h3>
            <p className="text-sm text-fg whitespace-pre-wrap leading-relaxed">
              {request.reason || 'No reason specified.'}
            </p>
          </div>

          {/* Activity Timeline */}
          <div className="space-y-3 pt-4 border-t border-border">
            <h3 className="text-xs font-semibold text-fg-muted">Activity timeline</h3>
            <div className="relative pl-6 space-y-4 border-l-2 border-border ml-2 py-1">
              {/* Event 1: Submission */}
              <div className="relative">
                <div className="w-[9px] h-[9px] rounded-full bg-surface border-2 border-fg-muted absolute -left-[29px] top-1" />
                <div>
                  <p className="font-medium text-fg text-xs">
                    Submitted by {request.user_name} · {getRoleDisplayName(request.user_role)}
                  </p>
                  <p className="text-[11px] text-fg-muted mt-0.5">
                    {formatPktDateTimeWithRelative(request.created_at)}
                  </p>
                </div>
              </div>

              {/* Clarification prompt if present */}
              {request.clarification_prompt && (
                <div className="relative">
                  <div className="w-[9px] h-[9px] rounded-full bg-info-fg absolute -left-[29px] top-1" />
                  <div>
                    <p className="font-medium text-fg text-xs">
                      Info requested by {request.reviewed_by_name || 'Approver'} · HR
                    </p>
                    <p className="text-[11px] text-fg-muted mt-0.5">
                      {formatPktDateTimeWithRelative(request.clarification_requested_at || request.updated_at)}
                    </p>
                    <div className="mt-1.5 p-2 rounded bg-subtle border border-border text-fg text-xs whitespace-pre-wrap">
                      {request.clarification_prompt}
                    </div>
                  </div>
                </div>
              )}

              {/* Clarification response if present */}
              {request.clarification_response && (
                <div className="relative">
                  <div className="w-[9px] h-[9px] rounded-full bg-surface border-2 border-fg-muted absolute -left-[29px] top-1" />
                  <div>
                    <p className="font-medium text-fg text-xs">
                      Replied by {request.user_name} · {getRoleDisplayName(request.user_role)}
                    </p>
                    <p className="text-[11px] text-fg-muted mt-0.5">
                      {formatPktDateTimeWithRelative(request.clarification_submitted_at || request.updated_at)}
                    </p>
                    <div className="mt-1.5 p-2 rounded bg-subtle border border-border text-fg text-xs whitespace-pre-wrap">
                      {request.clarification_response}
                    </div>
                  </div>
                </div>
              )}

              {/* Status history events if available */}
              {request.status_history && request.status_history.length > 0 ? (
                request.status_history.map((hist, idx) => {
                  const toStatus = hist.to_status?.toLowerCase();
                  let verb = `Changed to ${hist.to_status}`;
                  let dotColor = 'bg-fg/50';

                  if (toStatus === 'approved') {
                    verb = 'Approved';
                    dotColor = 'bg-success-fg ring-4 ring-success-bg';
                  } else if (toStatus === 'rejected') {
                    verb = 'Rejected';
                    dotColor = 'bg-danger-fg ring-4 ring-danger-bg';
                  } else if (toStatus === 'needs_info') {
                    verb = 'Info requested';
                    dotColor = 'bg-info-fg ring-4 ring-info-bg';
                  } else if (toStatus === 'appealed') {
                    verb = 'Appealed';
                    dotColor = 'bg-warning-fg ring-4 ring-warning-bg';
                  } else if (toStatus === 'cancelled') {
                    verb = 'Cancelled';
                    dotColor = 'bg-fg/50';
                  }

                  return (
                    <div key={idx} className="relative">
                      <div className={`w-[9px] h-[9px] rounded-full absolute -left-[29px] top-1 ${dotColor}`} />
                      <div>
                        <p className="font-medium text-fg text-xs">
                          {verb} by {hist.changed_by_name} · {getRoleDisplayName(hist.changed_by_role)}
                        </p>
                        <p className="text-[11px] text-fg-muted mt-0.5">
                          {formatPktDateTimeWithRelative(hist.changed_at)}
                        </p>
                        {hist.reason && (
                          <div className="mt-1.5 p-2 rounded bg-subtle border border-border text-fg text-xs whitespace-pre-wrap">
                            {hist.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Fallback if no status_history array but request is resolved */
                <>
                  {request.status === 'approved' && (
                    <div className="relative">
                      <div className="w-[9px] h-[9px] rounded-full bg-success-fg ring-4 ring-success-bg absolute -left-[29px] top-1" />
                      <div>
                        <p className="font-medium text-fg text-xs">
                          Approved by {request.reviewed_by_name || 'Reviewer'}
                        </p>
                        <p className="text-[11px] text-fg-muted mt-0.5">
                          {formatPktDateTimeWithRelative(request.reviewed_at || request.updated_at)}
                        </p>
                        {request.review_comments && (
                          <div className="mt-1.5 p-2 rounded bg-subtle border border-border text-fg text-xs whitespace-pre-wrap">
                            {request.review_comments}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {request.status === 'rejected' && (
                    <div className="relative">
                      <div className="w-[9px] h-[9px] rounded-full bg-danger-fg ring-4 ring-danger-bg absolute -left-[29px] top-1" />
                      <div>
                        <p className="font-medium text-fg text-xs">
                          Rejected by {request.reviewed_by_name || 'Reviewer'}
                        </p>
                        <p className="text-[11px] text-fg-muted mt-0.5">
                          {formatPktDateTimeWithRelative(request.reviewed_at || request.updated_at)}
                        </p>
                        {request.rejection_reason && (
                          <div className="mt-1.5 p-2 rounded bg-subtle border border-border text-fg text-xs whitespace-pre-wrap">
                            {request.rejection_reason}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Appeal reason if present and not in history */}
              {request.has_appealed && request.appeal_reason && (
                <div className="relative">
                  <div className="w-[9px] h-[9px] rounded-full bg-warning-fg ring-4 ring-warning-bg absolute -left-[29px] top-1" />
                  <div>
                    <p className="font-medium text-fg text-xs">
                      Appealed by {request.user_name} · {getRoleDisplayName(request.user_role)}
                    </p>
                    <p className="text-[11px] text-fg-muted mt-0.5">
                      {formatPktDateTimeWithRelative(request.appealed_at || request.updated_at)}
                    </p>
                    <div className="mt-1.5 p-2 rounded bg-subtle border border-border text-fg text-xs whitespace-pre-wrap">
                      {request.appeal_reason}
                    </div>
                  </div>
                </div>
              )}

              {/* If still pending or appealed, show current awaiting review status */}
              {(request.status === 'pending' || request.status === 'appealed') && (
                <div className="relative">
                  <div className="w-[9px] h-[9px] rounded-full bg-warning-fg ring-4 ring-warning-bg absolute -left-[29px] top-1" />
                  <div>
                    <p className="font-medium text-fg text-xs">
                      {reviewScopeHint(currentUser?.id, currentUser?.role, request) ||
                        'Awaiting review: HR, Operations or Admin can approve'}
                    </p>
                    <p className="text-[11px] text-fg-muted mt-0.5">In review queue</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <SheetFooter className="p-3.5 border-t border-border bg-surface flex-shrink-0 flex items-center justify-between">
          {/* Left: ⋯ Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="h-8 w-8 p-0" title="More options">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuItem onClick={handleCopyId} className="flex items-center gap-2 cursor-pointer">
                {copiedId ? <Check className="w-4 h-4 text-success-fg" /> : <Copy className="w-4 h-4" />}
                <span>{copiedId ? 'Copied ID' : 'Copy request ID'}</span>
              </DropdownMenuItem>

              {/* Reviewer / Admin: Change decision */}
              {canEdit && (request.status === 'approved' || request.status === 'rejected') && (
                <DropdownMenuItem
                  onClick={() => onEditStatus?.(request)}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-fg-muted" />
                  <span>Change decision</span>
                </DropdownMenuItem>
              )}

              {/* Admin delete on another user's in-flight request */}
              {isAdmin && !isApplicant && isInFlight && (
                <DropdownMenuItem
                  onClick={() => onDelete?.(request, true)}
                  className="flex items-center gap-2 text-danger-fg focus:text-danger-fg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete request…</span>
                </DropdownMenuItem>
              )}

              {/* Resolved requests: Remove from my list */}
              {canDelete && !isInFlight && (
                <DropdownMenuItem
                  onClick={() => onDelete?.(request, false)}
                  className="flex items-center gap-2 text-danger-fg focus:text-danger-fg cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove from my list…</span>
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-mono text-[10px] text-fg-muted px-2 py-1 truncate">
                ID: {request.id}
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Right: Main Action Buttons */}
          <div className="flex items-center gap-2">
            {/* Reviewer reviewing pending / appealed request */}
            {canReview && (request.status === 'pending' || request.status === 'appealed') ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReview?.(request, 'needs_info')}
                >
                  Ask for info
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-danger-fg hover:bg-danger-bg hover:text-danger-fg"
                  onClick={() => onReview?.(request, 'rejected')}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onReview?.(request, 'approved')}
                >
                  Approve
                </Button>
              </>
            ) : isApplicant && request.status === 'needs_info' ? (
              /* Applicant replying to clarification */
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-danger-fg hover:bg-danger-bg hover:text-danger-fg"
                  onClick={() => onDelete?.(request, true)}
                >
                  Cancel request
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onClarify?.(request)}
                >
                  Reply to clarification
                </Button>
              </>
            ) : isApplicant && (request.status === 'pending' || request.status === 'appealed') ? (
              /* Applicant in-flight request: can cancel */
              <>
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-danger-fg hover:bg-danger-bg hover:text-danger-fg"
                  onClick={() => onDelete?.(request, true)}
                >
                  Cancel request
                </Button>
              </>
            ) : isApplicant && request.status === 'rejected' && !request.has_appealed ? (
              /* Applicant rejected and appeal available */
              <>
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => onAppeal?.(request)}
                >
                  Appeal
                </Button>
              </>
            ) : (
              /* Default state for resolved or view-only */
              <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
