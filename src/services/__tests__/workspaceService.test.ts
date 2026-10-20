import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../apiClient';
import { workspaceService } from '../workspaceService';
import { subscribeInvalidation } from '../../utils/cacheBus';

vi.mock('../apiClient', () => ({
  apiClient: {
    upload: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('workspaceService logo cache', () => {
  beforeEach(() => {
    vi.mocked(apiClient.upload).mockReset();
    workspaceService.clearAllCaches();
  });

  it('emits content-calendar when uploadLogo succeeds', async () => {
    const keys: string[] = [];
    const unsub = subscribeInvalidation(
      ['workspaces', 'content-calendar', 'dashboard'],
      (key) => keys.push(key)
    );
    vi.mocked(apiClient.upload).mockResolvedValue({
      id: 'ws-1',
      name: 'Acme',
      logo_url: 'https://res.cloudinary.com/demo/image/upload/v1/logo.png',
    });

    await workspaceService.uploadLogo('ws-1', new File(['x'], 'logo.png', { type: 'image/png' }));
    unsub();

    expect(keys).toContain('content-calendar');
    expect(keys).toContain('workspaces');
    expect(keys).toContain('dashboard');
  });
});
