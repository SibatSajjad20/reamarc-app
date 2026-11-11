import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canAssignTo,
  canEditTask,
  canReassign,
  canTransitionTo,
  canViewTask,
  changedFields,
  isApprover,
  isViewOnly,
  listRowAdvanceTo,
} from './taskAccess';
import type { Task, TaskActor } from '@/types/task';

const actor = (id: string, role: string, dept: string): TaskActor => ({
  id,
  role,
  primary_department: dept,
  departments: dept ? [dept] : [],
  is_active: true,
});

const admin = actor('admin', 'admin', '');
const leadC = actor('lead.content', 'team_lead', 'Content');
const memberC1 = actor('member.content1', 'team_member', 'Content');
const memberC2 = actor('member.content2', 'team_member', 'Content');
const leadW = actor('lead.web', 'team_lead', 'Website');
const memberW = actor('member.web', 'team_member', 'Website');
const leadSeo = actor('lead.seo', 'team_lead', 'SEO');
const memberHr = actor('member.hr', 'team_member', 'HR');
const hr = actor('hr', 'hr', 'HR');

const task = (over: Partial<Task> = {}): Task => ({
  id: 'tsk1',
  serial: 'T-0001',
  title: 'Task',
  status: 'todo',
  priority: 'medium',
  creator_id: 'lead.content',
  assigner_id: 'lead.content',
  assignee_id: 'member.content1',
  department: 'Content',
  involved_ids: ['lead.content', 'member.content1'],
  ...over,
});

describe('taskAccess', () => {
  it('mirrors view/edit/assign matrix', () => {
    expect(canViewTask(admin, task())).toBe(true);
    expect(canViewTask(leadC, task())).toBe(true);
    expect(canViewTask(memberC1, task())).toBe(true);
    expect(canViewTask(memberW, task())).toBe(false);
    expect(canViewTask(hr, task())).toBe(false);
    expect(canEditTask(leadC, task())).toBe(true);
    expect(canEditTask(memberC1, task())).toBe(false);
    expect(canAssignTo(leadC, leadW)).toBe(true);
    expect(canAssignTo(leadC, memberW)).toBe(false);
    expect(canAssignTo(memberC1, memberC2)).toBe(true);
    expect(canAssignTo(memberC1, leadC)).toBe(true);
    expect(canAssignTo(memberC1, leadW)).toBe(false);
    expect(canAssignTo(leadW, leadC)).toBe(true);
    expect(canAssignTo(leadW, memberC1)).toBe(false);
    expect(canAssignTo(admin, memberHr)).toBe(false);
  });

  it('mirrors reassign and approver rules', () => {
    const open = task();
    expect(canReassign(leadC, open)).toBe(true);
    expect(canReassign(memberC1, open)).toBe(true);
    expect(canReassign(memberC2, open)).toBe(false);
    expect(canReassign(leadC, task({ status: 'completed' }))).toBe(false);
    const delegated = task({
      creator_id: 'lead.web',
      assigner_id: 'lead.content',
      assignee_id: 'member.content1',
      department: 'Content',
      assignment_chain: [
        { from_id: 'lead.web', to_id: 'lead.content' },
        { from_id: 'lead.content', to_id: 'member.content1' },
      ],
      involved_ids: ['lead.web', 'lead.content', 'member.content1'],
      status: 'in_review',
    });
    expect(isApprover(leadC, delegated)).toBe(true);
    expect(isApprover(leadW, delegated)).toBe(true);
    expect(isApprover(admin, delegated)).toBe(true);
    expect(isApprover(memberC1, delegated)).toBe(false);
    expect(isApprover(memberC2, delegated)).toBe(false);
    expect(isApprover(leadSeo, delegated)).toBe(false);
    expect(canTransitionTo(leadC, delegated, 'completed')).toBe(true);
    expect(canTransitionTo(memberC1, delegated, 'completed')).toBe(false);
  });

  it('lead department view is comment-only', () => {
    const peer = task({
      creator_id: 'member.content1',
      assigner_id: 'member.content1',
      assignee_id: 'member.content2',
      involved_ids: ['member.content1', 'member.content2'],
    });
    expect(canViewTask(leadC, peer)).toBe(true);
    expect(canEditTask(leadC, peer)).toBe(false);
    expect(isViewOnly(leadC, peer)).toBe(true);
  });

  it('transitions: self-assigned complete, send-back needs reason', () => {
    const assigned = task({ status: 'in_review' });
    expect(canTransitionTo(memberC1, assigned, 'completed')).toBe(false);
    expect(canTransitionTo(leadC, assigned, 'completed')).toBe(true);
    expect(canTransitionTo(leadC, assigned, 'in_progress')).toBe(false);
    expect(canTransitionTo(leadC, assigned, 'in_progress', 'fix it')).toBe(true);
    const selfTask = task({
      status: 'in_progress',
      assigner_id: 'member.content1',
      assignee_id: 'member.content1',
      creator_id: 'member.content1',
      involved_ids: ['member.content1'],
    });
    expect(canTransitionTo(memberC1, selfTask, 'completed')).toBe(true);
    expect(allowedTransitions(leadC, assigned)).toContain('completed');
  });

  it('list row checkbox: assignee starts/submits; lead/assigner approve in review', () => {
    const todo = task({ status: 'todo' });
    expect(listRowAdvanceTo(memberC1, todo)).toBe('in_progress');
    expect(listRowAdvanceTo(memberC2, todo)).toBeNull();
    expect(listRowAdvanceTo(leadC, todo)).toBeNull();
    expect(listRowAdvanceTo(leadC, task({ status: 'todo', assignee_id: 'lead.content' }))).toBe('in_progress');

    const wip = task({ status: 'in_progress' });
    expect(listRowAdvanceTo(memberC1, wip)).toBe('in_review');
    expect(listRowAdvanceTo(leadC, wip)).toBeNull();

    const review = task({ status: 'in_review' });
    expect(listRowAdvanceTo(memberC1, review)).toBeNull();
    expect(listRowAdvanceTo(leadC, review)).toBe('completed');
    expect(listRowAdvanceTo(leadW, review)).toBeNull();
    expect(listRowAdvanceTo(memberC1, task({ status: 'completed' }))).toBeNull();
    expect(listRowAdvanceTo(leadC, task({ status: 'completed' }))).toBeNull();
  });

  it('changedFields sends only diffs', () => {
    const orig = { title: 'A', priority: 'low', due_date: '2026-11-11' };
    const next = { title: 'A', priority: 'high', due_date: '2026-11-11' };
    expect(changedFields(orig, next)).toEqual({ priority: 'high' });
  });
});
