import type { ContentCalendarItem, PipelineStage, ContentCalendarQuickFilter } from '../types/contentCalendar';
import { PIPELINE_STAGES } from '../types/contentCalendar';

export type StageAction =
  | 'submit'
  | 'approve'
  | 'send_back'
  | 'request_revision'
  | 'post'
  | 'reject'
  | 'return_to_creative'
  | 'assign'
  | 'admin_move';

export interface StageActionSpec {
  action: StageAction;
  label: string;
  needsNote?: boolean;
  needsAssignee?: boolean;
}

export interface CalendarActor {
  id?: string;
  role?: string;
  department?: string;
  is_active?: boolean;
}

const CONTENT_STAGES: PipelineStage[] = PIPELINE_STAGES.slice(0, 4);
const CREATIVE_STAGES: PipelineStage[] = PIPELINE_STAGES.slice(4, 8);
const SOCIAL_STAGES: PipelineStage[] = PIPELINE_STAGES.slice(8);
export const CLIENT_REVIEW_STAGES: PipelineStage[] = ['Content Client Review', 'Creative Client Review'];

function roleOf(user?: CalendarActor | null): string {
  return (user?.role || '').toLowerCase().trim();
}

function departmentOf(user?: CalendarActor | null): string {
  return (user?.department || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAdmin(user?: CalendarActor | null): boolean {
  return !!user && user.is_active !== false && roleOf(user) === 'admin';
}

function isTeam(user?: CalendarActor | null): boolean {
  const role = roleOf(user);
  return !!user && user.is_active !== false && (role === 'team_lead' || role === 'team_member' || role === 'member');
}

function isContentActor(user?: CalendarActor | null): boolean {
  const dept = departmentOf(user);
  return isTeam(user) && (dept === 'content' || dept === 'content and creative' || dept === 'content & creative');
}

function isContentLead(user?: CalendarActor | null): boolean {
  const dept = departmentOf(user);
  return !!user && user.is_active !== false && roleOf(user) === 'team_lead' && (dept === 'content' || dept === 'content and creative' || dept === 'content & creative');
}

function isCreativeActor(user?: CalendarActor | null): boolean {
  const dept = departmentOf(user);
  return isTeam(user) && (dept === 'creative' || dept === 'content and creative' || dept === 'content & creative');
}

function isCreativeLead(user?: CalendarActor | null): boolean {
  const dept = departmentOf(user);
  return !!user && user.is_active !== false && roleOf(user) === 'team_lead' && (dept === 'creative' || dept === 'content and creative' || dept === 'content & creative');
}

function isSocial(user?: CalendarActor | null): boolean {
  return isTeam(user) && departmentOf(user) === 'social media';
}

function isPerformance(user?: CalendarActor | null): boolean {
  return isTeam(user) && departmentOf(user) === 'performance marketing';
}

export function isTeamLeadOrAdmin(user?: CalendarActor | null): boolean {
  if (!user || user.is_active === false) return false;
  const role = roleOf(user);
  return role === 'admin' || role === 'superadmin' || role === 'team_lead' || role === 'manager' || role === 'operations';
}

export function canAccessClientReviewLink(stage?: string | null, _user?: CalendarActor | null): boolean {
  if (!stage) return false;
  // Review link option is ONLY available when content is in client review stages:
  // - Content Client Review
  // - Creative Client Review
  return stage === 'Content Client Review' || stage === 'Creative Client Review';
}

export function canCreateCampaign(user?: CalendarActor | null): boolean {
  return isAdmin(user) || isContentActor(user);
}

export function visiblePipelineStages(user?: CalendarActor | null): PipelineStage[] {
  if (!user || user.is_active === false) return [];
  if (isAdmin(user) || isPerformance(user) || roleOf(user) === 'client') return [...PIPELINE_STAGES];
  const dept = departmentOf(user);
  if (dept === 'content') return [...CONTENT_STAGES];
  if (dept === 'creative') return [...CREATIVE_STAGES];
  if (dept === 'content and creative' || dept === 'content & creative') {
    return [...CONTENT_STAGES, ...CREATIVE_STAGES];
  }
  if (dept === 'social media') return [...SOCIAL_STAGES];
  return [];
}

export function actionsFor(user: CalendarActor | null | undefined, item: ContentCalendarItem): StageActionSpec[] {
  if (!user || user.is_active === false || isPerformance(user)) return [];
  if (roleOf(user) === 'client') {
    if (item.stage === 'Content Client Review' || item.stage === 'Creative Client Review') {
      return clientReviewActions();
    }
    return [];
  }
  const stage = item.stage;
  const actions: StageActionSpec[] = [];
  const admin = isAdmin(user);

  if ((stage === 'Content' || stage === 'Content Revision') && (admin || isContentActor(user))) {
    actions.push({ action: 'submit', label: 'Submit for internal review' });
  }
  if (stage === 'Content Internal Review' && (admin || isContentLead(user))) {
    actions.push({ action: 'approve', label: 'Send to client' });
    actions.push({ action: 'send_back', label: 'Send back' });
  }
  if ((stage === 'Creative Production' || stage === 'Creative Revision') && (admin || isCreativeLead(user))) {
    actions.push({ action: 'assign', label: 'Assign', needsAssignee: true });
  }
  const creativeCanSubmit =
    (stage === 'Creative Production' || stage === 'Creative Revision') &&
    (admin || isCreativeLead(user) || (isCreativeActor(user) && item.assignee_id && item.assignee_id === user.id));
  if (creativeCanSubmit) {
    actions.push({ action: 'submit', label: 'Submit for internal review' });
  }
  if (stage === 'Creative Internal Review' && (admin || isCreativeLead(user))) {
    actions.push({ action: 'approve', label: 'Send to client' });
    actions.push({ action: 'send_back', label: 'Send back' });
  }
  if (stage === 'Ready to Post' && (admin || isSocial(user))) {
    actions.push({ action: 'post', label: 'Mark posted' });
    actions.push({ action: 'reject', label: 'Reject' });
    actions.push({ action: 'return_to_creative', label: 'Return to creative', needsNote: true });
  }
  return actions;
}

export function clientReviewActions(): StageActionSpec[] {
  return [
    { action: 'approve', label: 'Approve' },
    { action: 'request_revision', label: 'Request revision', needsNote: true },
  ];
}

export interface DropActionResult {
  allowed: boolean;
  action?: StageAction;
  target_stage?: PipelineStage;
  needsNote?: boolean;
  needsAssignee?: boolean;
  reason?: string;
}

export function getDropTransition(
  item: ContentCalendarItem,
  targetStage: PipelineStage,
  user?: CalendarActor | null,
): DropActionResult {
  if (item.stage === targetStage) {
    return { allowed: false, reason: 'Item is already in this stage' };
  }
  if (!user || user.is_active === false || isPerformance(user)) {
    return { allowed: false, reason: 'You do not have permission to change stages' };
  }

  const admin = isAdmin(user);
  const current = item.stage;

  // 1. Content / Revision -> Content Internal Review (Submit)
  if ((current === 'Content' || current === 'Content Revision') && targetStage === 'Content Internal Review') {
    if (admin || isContentActor(user)) {
      return { allowed: true, action: 'submit' };
    }
    return { allowed: false, reason: 'Only the content team can submit content for review' };
  }

  // 2. Content Internal Review -> Content Client Review (Approve)
  if (current === 'Content Internal Review' && targetStage === 'Content Client Review') {
    if (admin || isContentLead(user)) {
      if (!item.workspace_id) {
        return { allowed: false, reason: 'Assign a client workspace before sending to client' };
      }
      return { allowed: true, action: 'approve' };
    }
    return { allowed: false, reason: 'Only a content lead can approve internal review' };
  }

  // 3. Content Internal Review -> Content or Content Revision (Send back)
  if (current === 'Content Internal Review' && (targetStage === 'Content' || targetStage === 'Content Revision')) {
    if (admin || isContentLead(user)) {
      return { allowed: true, action: 'send_back' };
    }
    return { allowed: false, reason: 'Only a content lead can send back content' };
  }

  // 4. Content Client Review -> Creative Production (Approve)
  if (current === 'Content Client Review' && targetStage === 'Creative Production') {
    if (admin || roleOf(user) === 'client') {
      return { allowed: true, action: 'approve' };
    }
    return { allowed: false, reason: 'Only the client can approve content review' };
  }

  // 5. Content Client Review -> Content Revision (Request Revision)
  if (current === 'Content Client Review' && targetStage === 'Content Revision') {
    if (admin || roleOf(user) === 'client') {
      return { allowed: true, action: 'request_revision', needsNote: true };
    }
    return { allowed: false, reason: 'Only the client can request content revisions' };
  }

  // 6. Creative Production / Revision -> Creative Internal Review (Submit)
  if ((current === 'Creative Production' || current === 'Creative Revision') && targetStage === 'Creative Internal Review') {
    const canSubmit = admin || isCreativeLead(user) || (isCreativeActor(user) && item.assignee_id === user.id);
    if (canSubmit) {
      return { allowed: true, action: 'submit' };
    }
    return { allowed: false, reason: 'Only the assigned creative or creative lead can submit this' };
  }

  // 7. Creative Internal Review -> Creative Client Review (Approve)
  if (current === 'Creative Internal Review' && targetStage === 'Creative Client Review') {
    if (admin || isCreativeLead(user)) {
      if (!item.workspace_id) {
        return { allowed: false, reason: 'Assign a client workspace before sending to client' };
      }
      return { allowed: true, action: 'approve' };
    }
    return { allowed: false, reason: 'Only a creative lead can approve internal review' };
  }

  // 8. Creative Internal Review -> Creative Production or Creative Revision (Send back)
  if (current === 'Creative Internal Review' && (targetStage === 'Creative Production' || targetStage === 'Creative Revision')) {
    if (admin || isCreativeLead(user)) {
      return { allowed: true, action: 'send_back' };
    }
    return { allowed: false, reason: 'Only a creative lead can send back creative work' };
  }

  // 9. Creative Client Review -> Ready to Post (Approve)
  if (current === 'Creative Client Review' && targetStage === 'Ready to Post') {
    if (admin || roleOf(user) === 'client') {
      return { allowed: true, action: 'approve' };
    }
    return { allowed: false, reason: 'Only the client can approve creative review' };
  }

  // 10. Creative Client Review -> Creative Revision (Request Revision)
  if (current === 'Creative Client Review' && targetStage === 'Creative Revision') {
    if (admin || roleOf(user) === 'client') {
      return { allowed: true, action: 'request_revision', needsNote: true };
    }
    return { allowed: false, reason: 'Only the client can request creative revisions' };
  }

  // 11. Ready to Post -> Posted (Post)
  if (current === 'Ready to Post' && targetStage === 'Posted') {
    if (admin || isSocial(user)) {
      return { allowed: true, action: 'post' };
    }
    return { allowed: false, reason: 'Only social media team can mark campaigns as posted' };
  }

  // 12. Ready to Post -> Rejected (Reject)
  if (current === 'Ready to Post' && targetStage === 'Rejected') {
    if (admin || isSocial(user)) {
      return { allowed: true, action: 'reject' };
    }
    return { allowed: false, reason: 'Only social media team can reject campaigns' };
  }

  // 13. Ready to Post -> Creative Revision (Return to creative)
  if (current === 'Ready to Post' && targetStage === 'Creative Revision') {
    if (admin || isSocial(user)) {
      return { allowed: true, action: 'return_to_creative', needsNote: true };
    }
    return { allowed: false, reason: 'Only social media team can return to creative' };
  }

  // Admin override: Admin can move to any stage
  if (admin) {
    return { allowed: true, action: 'admin_move', target_stage: targetStage };
  }

  return { allowed: false, reason: `Cannot move directly from "${current}" to "${targetStage}"` };
}

/**
 * Returns the relevant target date string and display label for a content item.
 * For "Ready to Post" / "Posted", publish_date is the primary driving date.
 * For other earlier pipeline stages, design_due is the primary driving date.
 */
export function getContentCalendarTargetDate(item: ContentCalendarItem): {
  dateStr: string | null;
  label: string;
  isPostStage: boolean;
} {
  const isPostStage = item.stage === 'Ready to Post' || item.stage === 'Posted';
  const dateStr = isPostStage
    ? (item.publish_date?.trim() || item.design_due?.trim() || null)
    : (item.design_due?.trim() || item.publish_date?.trim() || null);
  const label = isPostStage ? 'Publish' : 'Due';
  return { dateStr, label, isPostStage };
}

/**
 * Categorizes a Content Calendar campaign into an urgency bucket:
 * 'overdue' | 'today' | 'scheduled' | 'idle', or null for closed/rejected.
 * Matches CRM pipeline follow-up bucket conventions.
 */
export function getContentCalendarBucket(
  item: ContentCalendarItem,
  now = new Date()
): ContentCalendarQuickFilter | null {
  if (item.stage === 'Rejected') {
    return null;
  }

  const { dateStr } = getContentCalendarTargetDate(item);
  if (!dateStr) {
    if (item.stage === 'Posted') return null;
    return 'idle';
  }

  const dateOnly = dateStr.split('T')[0];
  const parts = dateOnly.split('-');
  if (parts.length < 3) {
    if (item.stage === 'Posted') return null;
    return 'idle';
  }

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    if (item.stage === 'Posted') return null;
    return 'idle';
  }

  const targetMidnight = new Date(year, month, day).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((targetMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    if (item.stage === 'Posted') return null;
    return 'overdue';
  }
  if (diffDays === 0) {
    return 'today';
  }
  return 'scheduled';
}

/**
 * Returns breakdown counts of creative assets (images, videos, links, docs).
 */
export function getAssetCounts(attachments?: Array<{ kind?: string }>) {
  if (!attachments || attachments.length === 0) {
    return { total: 0, images: 0, videos: 0, links: 0, docs: 0, other: 0 };
  }
  let images = 0;
  let videos = 0;
  let links = 0;
  let docs = 0;
  let other = 0;
  for (const a of attachments) {
    if (a.kind === 'image') images++;
    else if (a.kind === 'video') videos++;
    else if (a.kind === 'link') links++;
    else if (a.kind === 'document') docs++;
    else other++;
  }
  return { total: attachments.length, images, videos, links, docs, other };
}

