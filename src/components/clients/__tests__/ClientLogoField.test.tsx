import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { ClientLogoField } from '../ClientLogoField';
import { workspaceService } from '../../../services/workspaceService';
import type { Workspace } from '../../../types';

vi.mock('../../../services/workspaceService', () => ({
  workspaceService: {
    uploadLogo: vi.fn(),
    removeLogo: vi.fn(),
  },
}));

const CLOUDINARY = 'https://res.cloudinary.com/demo/image/upload/v1/reamarc/clients/ws1/logo/logo-abc.png';

function mockSquarePad() {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 8, height: 8, close: () => undefined }));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,preview');
}

describe('ClientLogoField', () => {
  it('shows the Cloudinary logo immediately after a successful upload', async () => {
    mockSquarePad();
    const updated = {
      id: 'ws-1',
      name: 'Acme',
      logo_url: CLOUDINARY,
    } as Workspace;
    vi.mocked(workspaceService.uploadLogo).mockResolvedValue(updated);

    const { container, getByAltText } = render(
      <ClientLogoField
        workspaceId="ws-1"
        name="Acme"
        canManage
        pendingFile={null}
        onPendingFile={vi.fn()}
        onWorkspacePatched={vi.fn()}
      />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      const img = getByAltText('Acme logo') as HTMLImageElement;
      expect(img.getAttribute('src')).toContain('res.cloudinary.com');
    });
  });
});
