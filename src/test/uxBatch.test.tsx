import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

describe('#1 company accent survives dark mode', () => {
  it('writes the accent for dark mode too, not only an inline style on <html>', async () => {
    const { applyAccent } = await import('../context/BrandingProvider');
    document.documentElement.removeAttribute('style');
    applyAccent('#2563EB');
    const css = Array.from(document.querySelectorAll('style')).map((s) => s.textContent || '').join('\n').toLowerCase();
    expect(css).toMatch(/body\.dark[^{]*\{[^}]*--accent:\s*#2563eb/);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('');
  });
});

describe('#3 company switch does not reload its own tab', () => {
  it('ignores its own broadcast, reacts to other tabs', async () => {
    const mod: any = await import('../context/AuthContext');
    expect(typeof mod.isForeignSwitchMessage).toBe('function');
    expect(mod.isForeignSwitchMessage({ type: 'company_switched', companyId: 'b', from: mod.TAB_ID }, mod.TAB_ID)).toBe(false);
    expect(mod.isForeignSwitchMessage({ type: 'company_switched', companyId: 'b', from: 'other-tab' }, mod.TAB_ID)).toBe(true);
  });
});

describe('#5 compliance never shows a fake 100%', () => {
  it('no shifts / on leave give a reason instead of a number', async () => {
    const { complianceScore } = await import('../utils/logComplianceScore');
    expect(complianceScore({ range: 'week', status: 'not_started', daysMissed: 0, daysDue: 0 })).toEqual({ pct: null, reason: 'No shifts' });
    expect(complianceScore({ range: 'today', status: 'on_leave' }).pct).toBeNull();
    expect(complianceScore({ range: 'week', status: 'missing', daysMissed: 1, daysDue: 4 }).pct).toBe(75);
  });
});

describe('#7 Drive sign-in popup closed', () => {
  beforeEach(async () => {
    (await import('../services/googlePickerService')).__resetDriveTokenCache?.();
  });
  it('rejects (so the button unlocks) instead of hanging, and reuses a fresh token', async () => {
    const svc: any = await import('../services/googlePickerService');
    let cfg: any;
    const initTokenClient = vi.fn((c: any) => { cfg = c; return { requestAccessToken: vi.fn() }; });
    (window as any).google = { accounts: { oauth2: { initTokenClient } } };
    const p = svc.requestDriveFileAccessToken('cid');
    await waitFor(() => expect(cfg).toBeTruthy());
    cfg.error_callback({ type: 'popup_closed' });
    await expect(p).rejects.toMatchObject({ code: 'cancelled' });

    const ok = svc.requestDriveFileAccessToken('cid');
    await waitFor(() => expect(initTokenClient).toHaveBeenCalledTimes(2));
    cfg.callback({ access_token: 'tok', expires_in: 3600 });
    await expect(ok).resolves.toBe('tok');
    await expect(svc.requestDriveFileAccessToken('cid')).resolves.toBe('tok');
    expect(initTokenClient).toHaveBeenCalledTimes(2);
  });
});

describe('#10 lead source logos', () => {
  it('maps WhatsApp, WordPress and manual to icons, unknown to text', async () => {
    const { sourceIconKind } = await import('../components/crm/SourceIcon');
    expect(sourceIconKind('WhatsApp')).not.toBe('text');
    expect(sourceIconKind('wordpress')).not.toBe('text');
    expect(sourceIconKind('manual')).not.toBe('text');
    expect(sourceIconKind('carrier pigeon')).toBe('text');
  });
});

describe('D client logo can be positioned before upload', () => {
  it('opens the crop popup and does not upload until the user saves', async () => {
    const ws = await import('../services/workspaceService');
    const up = vi.spyOn(ws.workspaceService, 'uploadLogo').mockResolvedValue({ id: 'ws1', logo_url: 'x' } as any);
    (URL as any).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as any).revokeObjectURL = vi.fn();
    const { ClientLogoField } = await import('../components/clients/ClientLogoField');
    const { container } = render(
      <ClientLogoField workspaceId="ws1" name="SP Builders" canManage pendingFile={null} onPendingFile={() => {}} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } });
    expect(await screen.findByText('Position client logo')).toBeTruthy();
    expect(up).not.toHaveBeenCalled();
  });
});
