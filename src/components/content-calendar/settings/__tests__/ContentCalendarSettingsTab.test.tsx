import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ContentCalendarSettingsTab } from '../ContentCalendarSettingsTab';
import type { ClientExpectationClient } from '../../../../types/contentCalendar';

let mockUser: any = { id: 'u1', role: 'admin' };
const mockConfirm = vi.fn();
const mockAddToast = vi.fn();
const mockGetClientExpectations = vi.fn();
const mockSaveClientExpectations = vi.fn();
const mockOpenFileAttachment = vi.fn();
const mockEmitInvalidation = vi.fn();

vi.mock('../../../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

vi.mock('../../../ui/ConfirmProvider', () => ({
  useConfirm: () => mockConfirm,
}));

vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('../../../../services/contentCalendarService', () => ({
  contentCalendarService: {
    getClientExpectations: () => mockGetClientExpectations(),
    saveClientExpectations: (id: string, lines: any[]) => mockSaveClientExpectations(id, lines),
  },
}));

vi.mock('../../../../utils/fileUrl', () => ({
  openFileAttachment: (...args: any[]) => mockOpenFileAttachment(...args),
}));

vi.mock('../../../../utils/cacheBus', () => ({
  emitInvalidation: (key: string) => mockEmitInvalidation(key),
}));

const mockCreativeTypes = ['Video', 'Static', 'Reel', 'Carousel', 'Story'];

const mockClients: ClientExpectationClient[] = [
  {
    workspace_id: 'ws_sp',
    name: 'SP Builders',
    proposal_url: '/uploads/sp_proposal.pdf',
    proposal_name: 'SP_Proposal.pdf',
    content_expectations: {
      period: 'month',
      lines: [
        { creative_type: 'Static', expected: 5, expected_max: 10 },
        { creative_type: 'Carousel', expected: null, included: true, layout: '3x3' },
        { creative_type: 'Animated Post', expected: 2, skip_months: ['2026-11'] },
      ],
    },
  },
  {
    workspace_id: 'ws_nov',
    name: 'Nov Real Estate',
    proposal_url: '/uploads/nov_prop.pdf',
    proposal_name: 'Nov_Proposal.pdf',
    content_expectations: null,
  },
  {
    workspace_id: 'ws_clean',
    name: 'Clean Slate Co',
    proposal_url: null,
    proposal_name: null,
    content_expectations: null,
  },
];

describe('ContentCalendarSettingsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'u1', role: 'admin' };
    mockConfirm.mockResolvedValue(true);
    mockGetClientExpectations.mockResolvedValue({
      creative_types: mockCreativeTypes,
      clients: mockClients,
    });
    mockSaveClientExpectations.mockResolvedValue({ ok: true });
  });

  it('renders the client list with the right pills', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    const clientList = screen.getByRole('list');
    expect(within(clientList).getByText('SP Builders')).toBeTruthy();
    expect(within(clientList).getByText('Nov Real Estate')).toBeTruthy();
    expect(within(clientList).getByText('Clean Slate Co')).toBeTruthy();

    expect(screen.getByText('Plan set')).toBeTruthy();
    expect(screen.getByText('Proposal, no plan')).toBeTruthy();
    expect(screen.getByText('No plan')).toBeTruthy();
  });

  it('selecting a client shows its counts and proposal details', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // By default first client (SP Builders) is selected
    expect(screen.getByRole('heading', { name: 'SP Builders' })).toBeTruthy();
    await waitFor(() => expect((screen.getByTestId('cc-expect-input-static') as HTMLInputElement).value).toBe('5'));

    // Switch to Nov Real Estate
    const novBtn = within(screen.getByRole('list')).getByText('Nov Real Estate').closest('button')!;
    fireEvent.click(novBtn);
    expect(screen.getByRole('heading', { name: 'Nov Real Estate' })).toBeTruthy();
    expect(screen.getByText('No monthly plan yet. Enter counts below.')).toBeTruthy();
    expect((screen.getByTestId('cc-expect-input-static') as HTMLInputElement).value).toBe('');
  });

  it('Story is never shown in the grid', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    expect(screen.queryByTestId('cc-expect-input-story')).toBeNull();
    expect(screen.queryByText(/Story \(Stories\)/i)).toBeNull();
  });

  it('legacy type is flagged "Not in field values" with the Callout', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // SP Builders has "Animated Post", which is NOT in mockCreativeTypes
    expect(screen.getByText('Animated Post')).toBeTruthy();
    expect(screen.getByText('Not in field values')).toBeTruthy();
    expect(screen.getByText(/Some types in this client's plan are missing from Field values/)).toBeTruthy();
  });

  it('preserved-attribute captions render', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Static has expected_max: 10
    expect(screen.getByText(/Range 5–10/)).toBeTruthy();

    // Carousel has layout: 3x3
    expect(screen.getByText(/Layout 3x3/)).toBeTruthy();

    // Animated Post has skip_months: ['2026-11']
    expect(screen.getByText(/Paused Nov 2026/)).toBeTruthy();
  });

  it('the count input rejects >500 and non-digits', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    const input = screen.getByTestId('cc-expect-input-video') as HTMLInputElement;

    // Reject non-digits
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('');

    // Reject negative numbers
    fireEvent.change(input, { target: { value: '-5' } });
    expect(input.value).toBe('');

    // Reject > 500
    fireEvent.change(input, { target: { value: '501' } });
    expect(screen.getByText('Must be between 0 and 500.')).toBeTruthy();

    // Save button should be disabled when field has error
    const saveBtn = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);

    // Valid number 25
    fireEvent.change(input, { target: { value: '25' } });
    expect(screen.queryByText('Must be between 0 and 500.')).toBeNull();
    expect(saveBtn.disabled).toBe(false);
  });

  it('Save sends exactly {lines:[{creative_type, expected}]} for every shown row', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Switch to Nov Real Estate (no lines)
    const novBtn = within(screen.getByRole('list')).getByText('Nov Real Estate').closest('button')!;
    fireEvent.click(novBtn);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nov Real Estate' })).toBeTruthy());

    // Set Video: 2, Static: 8
    fireEvent.change(screen.getByTestId('cc-expect-input-video'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('cc-expect-input-static'), { target: { value: '8' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    await waitFor(() => expect(mockSaveClientExpectations).toHaveBeenCalledTimes(1));
    const [workspaceId, lines] = mockSaveClientExpectations.mock.calls[0];
    expect(workspaceId).toBe('ws_nov');

    // Check sent lines
    expect(lines).toContainEqual({ creative_type: 'Video', expected: 2 });
    expect(lines).toContainEqual({ creative_type: 'Static', expected: 8 });
    expect(lines).toContainEqual({ creative_type: 'Reel', expected: null });
    expect(lines).toContainEqual({ creative_type: 'Carousel', expected: null });
  });

  it('the confirm appears when removing a counted type', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // SP Builders originally has Static: 5 and Animated Post: 2
    // Clear Static
    fireEvent.change(screen.getByTestId('cc-expect-input-static'), { target: { value: '' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const confirmArg = mockConfirm.mock.calls[0][0];
    expect(confirmArg.description).toContain('Static');
    expect(confirmArg.description).toContain('removed');

    await waitFor(() => expect(mockSaveClientExpectations).toHaveBeenCalledTimes(1));
  });

  it('cancelling remove confirm aborts save', async () => {
    mockConfirm.mockResolvedValueOnce(false);
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Clear Static
    fireEvent.change(screen.getByTestId('cc-expect-input-static'), { target: { value: '' } });

    const saveBtn = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveBtn);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockSaveClientExpectations).not.toHaveBeenCalled();
  });

  it('success -> toast + emitInvalidation("workspaces") called', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    fireEvent.change(screen.getByTestId('cc-expect-input-video'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Plan saved', expect.any(String), 'success');
      expect(mockEmitInvalidation).toHaveBeenCalledWith('workspaces');
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'reamarc_workspaces_updated' })
      );
    });
    dispatchSpy.mockRestore();
  });

  it('server 409/422 -> error toast, and edits are kept', async () => {
    mockSaveClientExpectations.mockRejectedValueOnce(new Error('Validation error'));
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    const videoInput = screen.getByTestId('cc-expect-input-video') as HTMLInputElement;
    fireEvent.change(videoInput, { target: { value: '14' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Save failed', expect.any(String), 'error');
    });

    // Edits must still be in the input field!
    expect(videoInput.value).toBe('14');
  });

  it('read-only user -> banner, inputs disabled, no Save button', async () => {
    mockUser = { id: 'u2', role: 'team_member' };
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    expect(screen.getByText(/Only admins and content or creative team leads can change client expectations/)).toBeTruthy();
    expect((screen.getByTestId('cc-expect-input-static') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('dirty + switch client -> discard confirm', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    // Modify Static count to make form dirty
    fireEvent.change(screen.getByTestId('cc-expect-input-static'), { target: { value: '9' } });

    // Click Nov Real Estate
    const novBtn = within(screen.getByRole('list')).getByText('Nov Real Estate').closest('button')!;
    fireEvent.click(novBtn);

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm.mock.calls[0][0].title).toBe('Discard unsaved changes?');
  });

  it('the empty state with zero clients', async () => {
    mockGetClientExpectations.mockResolvedValueOnce({
      creative_types: ['Video', 'Static'],
      clients: [],
    });

    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByText('No active clients yet')).toBeTruthy());
    expect(screen.getByText('Add clients in Active clients to set their monthly plan.')).toBeTruthy();
  });

  it('Open proposal calls openFileAttachment', async () => {
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    const openBtn = screen.getByRole('button', { name: 'Open' });
    fireEvent.click(openBtn);

    expect(mockOpenFileAttachment).toHaveBeenCalledWith('/uploads/sp_proposal.pdf', 'SP_Proposal.pdf');
  });

  it('constants with duplicate spellings render a single row, and Save sends a single line for it', async () => {
    mockGetClientExpectations.mockResolvedValueOnce({
      creative_types: ['Static', 'Reel', 'Animated Post', 'animated post', 'Animated posts'],
      clients: mockClients,
    });
    render(<ContentCalendarSettingsTab />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    const animatedInputs = screen.getAllByTestId('cc-expect-input-animated-post');
    expect(animatedInputs).toHaveLength(1);

    fireEvent.change(animatedInputs[0], { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mockSaveClientExpectations).toHaveBeenCalledTimes(1);
    });
    const savedLines = mockSaveClientExpectations.mock.calls[0][1];
    const animatedSaved = savedLines.filter((l: any) => l.creative_type.toLowerCase().includes('animat'));
    expect(animatedSaved).toHaveLength(1);
    expect(animatedSaved[0].expected).toBe(5);
  });

  it('calls onDirtyChange(true) after typing, and false after Cancel', async () => {
    const onDirtyChange = vi.fn();
    render(<ContentCalendarSettingsTab onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByTestId('cc-expect-input-static'), { target: { value: '9' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('calls onDirtyChange(false) after a successful save', async () => {
    const onDirtyChange = vi.fn();
    render(<ContentCalendarSettingsTab onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(screen.getByTestId('cc-settings-tab')).toBeTruthy());

    fireEvent.change(screen.getByTestId('cc-expect-input-video'), { target: { value: '3' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('Plan saved', expect.any(String), 'success');
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });
  });
});
