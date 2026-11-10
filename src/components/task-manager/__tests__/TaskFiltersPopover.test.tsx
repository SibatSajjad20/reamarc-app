import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TaskFiltersPopover } from '../TaskFiltersPopover';

describe('TaskFiltersPopover', () => {
  it('changes query when a filter is set', () => {
    const onChange = vi.fn();
    render(
      <TaskFiltersPopover
        filters={{ scope: 'all' }}
        onChange={onChange}
        assignees={[{ id: 'u1', name: 'Ada' }]}
        departments={['Content', 'Website']}
        workspaces={[{ id: 'ws1', name: 'Acme' }]}
      />,
    );
    fireEvent.click(screen.getByText('Filter'));
    expect(screen.getByText('Filters')).toBeTruthy();
    expect(screen.getByText('Any assigner')).toBeTruthy();
    expect(screen.getByText('Any related client')).toBeTruthy();
  });
});
