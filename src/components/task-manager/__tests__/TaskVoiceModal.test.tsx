import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskVoiceModal, VOICE_MAX_SECONDS, VOICE_MAX_TEXT } from '../TaskVoiceModal';
import { taskService } from '@/services/taskService';
import type { TaskActor } from '@/types/task';

vi.mock('@/hooks/useWorkspaces', () => ({
  useWorkspaces: () => ({ workspaces: [] }),
}));
vi.mock('@/context/ToastContext', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));
vi.mock('@/services/taskService', () => ({
  taskService: {
    voiceParseTask: vi.fn(),
    createTask: vi.fn(),
  },
}));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = MockResizeObserver;

const admin: TaskActor = { id: 'admin', role: 'admin', is_active: true } as TaskActor;
const lead: TaskActor = { id: 'lead', role: 'team_lead', is_active: true } as TaskActor;
const member: TaskActor = { id: 'm1', role: 'team_member', is_active: true } as TaskActor;

let recorderInstances: any[] = [];

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType: string;
  options: any;
  ondataavailable: ((e: any) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(_stream: any, options: any = {}) {
    this.options = options;
    this.mimeType = options.mimeType || 'audio/webm';
    recorderInstances.push(this);
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob([new Uint8Array(2048)], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const trackStop = vi.fn();
const getUserMedia = vi.fn();

const renderModal = (actor: TaskActor | null = admin) =>
  render(
    <TaskVoiceModal open onClose={() => {}} onSaved={() => {}} assignable={[]} actor={actor} workspaces={[]} />,
  );

describe('TaskVoiceModal security behaviour', () => {
  beforeEach(() => {
    recorderInstances = [];
    trackStop.mockReset();
    getUserMedia.mockReset();
    getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] });
    (globalThis as any).MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    (taskService.voiceParseTask as any).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders nothing for a team member and renders for admin and team lead', () => {
    const { unmount } = renderModal(member);
    expect(screen.queryByText('Start Speaking')).toBeNull();
    unmount();
    renderModal(lead);
    expect(screen.getByText('Start Speaking')).toBeTruthy();
  });

  it('asks for noise suppression, echo cancellation and auto gain explicitly', async () => {
    renderModal();
    await act(async () => {
      fireEvent.click(screen.getByText('Start Speaking'));
    });
    const constraints = getUserMedia.mock.calls[0][0];
    expect(constraints.audio.noiseSuppression).toBe(true);
    expect(constraints.audio.echoCancellation).toBe(true);
    expect(constraints.audio.autoGainControl).toBe(true);
    expect(recorderInstances[0].options.audioBitsPerSecond).toBe(32000);
  });

  it('auto-stops at 60 seconds and uploads once', async () => {
    vi.useFakeTimers();
    (taskService.voiceParseTask as any).mockReturnValue(new Promise(() => {}));
    renderModal();
    await act(async () => {
      fireEvent.click(screen.getByText('Start Speaking'));
    });
    expect(recorderInstances[0].state).toBe('recording');
    await act(async () => {
      vi.advanceTimersByTime((VOICE_MAX_SECONDS + 5) * 1000);
    });
    expect(recorderInstances[0].state).toBe('inactive');
    expect(taskService.voiceParseTask).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalled();
  });

  it('shows only the server message on failure and never logs the error object', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('secret device detail'), { name: 'NotAllowedError' }));
    renderModal();
    await act(async () => {
      fireEvent.click(screen.getByText('Start Speaking'));
    });
    expect(screen.getByText(/Microphone permission was denied/)).toBeTruthy();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('caps the typed command at 600 characters', () => {
    renderModal();
    const input = screen.getByPlaceholderText(/Assign website banner/) as HTMLInputElement;
    expect(input.maxLength).toBe(VOICE_MAX_TEXT);
    fireEvent.change(input, { target: { value: 'a'.repeat(700) } });
    expect(input.value.length).toBe(VOICE_MAX_TEXT);
    expect(screen.getByText(`${VOICE_MAX_TEXT}/${VOICE_MAX_TEXT}`)).toBeTruthy();
  });

  it('pins an opaque footer below the scrolling body in the draft', async () => {
    (taskService.voiceParseTask as any).mockResolvedValue({
      transcript: 'Design banner',
      task: {
        title: 'Design banner',
        description: 'Design the launch banner.',
        assignee_id: null,
        watcher_ids: [],
        company_id: null,
        start_date: null,
        due_date: '2026-11-30',
        due_time: '18:00',
        estimate_hours: 2,
        priority: 'medium',
        checklist: [],
        is_collective: false,
        subtasks: [],
      },
      confidence: { status: 'unassigned', ambiguous_candidates: [] },
    });
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/Assign website banner/), { target: { value: 'Design banner' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Parse'));
    });
    const confirm = screen.getByText('Confirm & Assign Task').closest('button') as HTMLButtonElement;
    const footer = confirm.closest('.border-t') as HTMLElement;
    expect(footer).toBeTruthy();
    expect(footer.className).toMatch(/\bbg-surface\b/);
    expect(footer.className).toMatch(/\bshrink-0\b/);
    expect(footer.className).not.toMatch(/bg-surface\/|backdrop-blur|sticky/);
    expect(footer.contains(screen.getByText('Cancel'))).toBe(true);
    // The footer is not inside the scrolling body, so form fields never render under it.
    const body = screen.getByDisplayValue('Design banner').closest('.overflow-y-auto') as HTMLElement;
    expect(body).toBeTruthy();
    expect(body.contains(footer)).toBe(false);
    expect(body.nextElementSibling).toBe(footer);
  });
});
