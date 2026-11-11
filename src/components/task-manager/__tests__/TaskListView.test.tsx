import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskListView } from '../TaskListView';
import type { Task, TaskActor } from '@/types/task';

vi.mock('@/hooks/useMemberAvatars', () => ({
  useMemberAvatars: () => ({ getAvatarUrl: () => null }),
}));

const member: TaskActor = {
  id: 'member.web',
  role: 'team_member',
  primary_department: 'Website',
  departments: ['Website'],
};
const otherMember: TaskActor = {
  id: 'member.web2',
  role: 'team_member',
  primary_department: 'Website',
  departments: ['Website'],
};
const lead: TaskActor = {
  id: 'lead.web',
  role: 'team_lead',
  primary_department: 'Website',
  departments: ['Website'],
};
const contentLead: TaskActor = {
  id: 'lead.content',
  role: 'team_lead',
  primary_department: 'Content',
  departments: ['Content'],
};

const task = (over: Partial<Task> = {}): Task => ({
  id: over.id || 'tsk1',
  serial: over.serial || 'T-0001',
  title: over.title || 'Landing page copy',
  status: over.status || 'todo',
  priority: over.priority || 'high',
  assignee_id: over.assignee_id ?? 'member.web',
  assignee_name: over.assignee_name || 'Member Web',
  assigner_id: over.assigner_id ?? 'lead.web',
  creator_id: over.creator_id ?? 'lead.web',
  department: over.department ?? 'Website',
  involved_ids: over.involved_ids || ['lead.web', 'member.web'],
  progress: 40,
  due_date: '2026-11-12',
  ...over,
});

function renderList(tasks: Task[], actor: TaskActor, onAction = vi.fn()) {
  return {
    onAction,
    ...render(
      <TaskListView
        tasks={tasks}
        actor={actor}
        onOpen={vi.fn()}
        onAction={onAction}
        onViewAll={vi.fn()}
      />,
    ),
  };
}

describe('TaskListView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('groups by stage and shows server stage_counts', () => {
    render(
      <TaskListView
        tasks={[
          task({ id: 'a', status: 'todo', title: 'Landing page copy' }),
          task({ id: 'b', serial: 'T-0002', status: 'todo', title: 'Peer draft' }),
          task({ id: 'c', serial: 'T-0003', status: 'in_progress', title: 'In flight' }),
        ]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onViewAll={vi.fn()}
        stageCounts={{ todo: 12, in_progress: 4 }}
      />,
    );
    expect(screen.getByTestId('task-stage-todo').textContent).toMatch(/12/);
    expect(screen.getByTestId('task-stage-in_progress').textContent).toMatch(/4/);
    expect(screen.getByText('Landing page copy')).toBeTruthy();
  });

  it('View all calls onViewAll with the stage', () => {
    const onViewAll = vi.fn();
    render(
      <TaskListView
        tasks={[task()]}
        actor={{ id: 'admin', role: 'admin' }}
        onOpen={vi.fn()}
        onAction={vi.fn()}
        onViewAll={onViewAll}
      />,
    );
    fireEvent.click(screen.getAllByText('View all')[0]);
    expect(onViewAll).toHaveBeenCalledWith('todo');
  });

  it('member assigned todo: checkbox advances to in_progress; not assignee: no checkbox', () => {
    const { onAction } = renderList([task({ status: 'todo', serial: 'T-0001' })], member);
    fireEvent.click(screen.getByLabelText('Advance T-0001'));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ serial: 'T-0001', priority: 'high' }), 'start');
    expect(onAction.mock.calls[0][1]).not.toBe('priority');

    const again = renderList([task({ id: 'x', serial: 'T-0009', status: 'todo' })], otherMember);
    expect(again.container.querySelector('[aria-label="Advance T-0009"]')).toBeNull();
  });

  it('member in_progress: checkbox advances to in_review', () => {
    const { onAction } = renderList([task({ status: 'in_progress', serial: 'T-0031' })], member);
    fireEvent.click(screen.getByLabelText('Advance T-0031'));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'tsk1' }), 'submit');
  });

  it('member in_review: no checkbox; lead and assigner: checkbox advances to completed', () => {
    const review = task({ status: 'in_review', serial: 'T-0040' });
    renderList([review], member);
    expect(screen.queryByLabelText('Advance T-0040')).toBeNull();

    const leadRender = renderList([review], lead);
    fireEvent.click(leadRender.getByLabelText('Advance T-0040'));
    expect(leadRender.onAction).toHaveBeenCalledWith(expect.objectContaining({ serial: 'T-0040' }), 'approve');

    const assigner: TaskActor = {
      id: 'lead.web',
      role: 'team_member',
      primary_department: 'Website',
      departments: ['Website'],
    };
    const chained = task({
      status: 'in_review',
      serial: 'T-0041',
      assignment_chain: [{ from_id: 'lead.web', to_id: 'member.web' }],
    });
    const assignerRender = renderList([chained], assigner);
    expect(assignerRender.getByLabelText('Advance T-0041')).toBeTruthy();
  });

  it('lead on own assigned todo: checkbox present; on report todo: none; on report in_review: checkbox', () => {
    renderList(
      [
        task({ id: 'own', serial: 'T-OWN', status: 'todo', assignee_id: 'lead.web', assigner_id: 'admin' }),
        task({ id: 'rep', serial: 'T-REP', status: 'todo', assignee_id: 'member.web' }),
        task({ id: 'rev', serial: 'T-REV', status: 'in_review', assignee_id: 'member.web' }),
      ],
      lead,
    );
    expect(screen.getByLabelText('Advance T-OWN')).toBeTruthy();
    expect(screen.queryByLabelText('Advance T-REP')).toBeNull();
    expect(screen.getByLabelText('Advance T-REV')).toBeTruthy();
  });

  it('completed: no checkbox', () => {
    renderList([task({ status: 'completed', serial: 'T-DONE' })], member);
    expect(screen.queryByLabelText('Advance T-DONE')).toBeNull();
    expect(screen.getByTestId('task-stage-completed').querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  });

  it('checkbox does not change priority', () => {
    const { onAction } = renderList([task({ status: 'todo', priority: 'urgent', serial: 'T-URG' })], member);
    fireEvent.click(screen.getByLabelText('Advance T-URG'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ priority: 'urgent' }), 'start');
  });

  it('content lead cannot approve a website in-review task they did not assign', () => {
    renderList([task({ status: 'in_review', serial: 'T-WEB', department: 'Website' })], contentLead);
    expect(screen.queryByLabelText('Advance T-WEB')).toBeNull();
  });

  it('unchecking does not send a reverse stage action', () => {
    const { onAction } = renderList([task({ status: 'todo', serial: 'T-0001' })], member);
    const box = screen.getByLabelText('Advance T-0001');
    fireEvent.click(box);
    expect(onAction).toHaveBeenCalledWith(expect.anything(), 'start');
    onAction.mockClear();
    fireEvent.click(box);
    expect(onAction).not.toHaveBeenCalled();
  });
});
