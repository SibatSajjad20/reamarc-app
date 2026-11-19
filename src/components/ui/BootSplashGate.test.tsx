import { Suspense, lazy } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BootFallback, RemoveBootSplashOnMount } from './BootSplashGate';
import { resetBootSplashGuardForTests } from '../../utils/bootSplash';

function splash() {
  return document.getElementById('boot-splash');
}

describe('BootSplashGate', () => {
  beforeEach(() => {
    resetBootSplashGuardForTests();
    const el = document.createElement('div');
    el.id = 'boot-splash';
    document.body.appendChild(el);
  });
  afterEach(() => {
    splash()?.remove();
    resetBootSplashGuardForTests();
  });

  it('keeps the splash up until the lazy screen has mounted, then removes it', async () => {
    let resolve!: (m: { default: React.FC }) => void;
    const Screen = lazy(() => new Promise<{ default: React.FC }>((r) => { resolve = r; }));
    render(
      <Suspense fallback={<BootFallback />}>
        <Screen />
        <RemoveBootSplashOnMount />
      </Suspense>,
    );
    // Chunk still downloading: splash visible, no second loader, no blank page.
    expect(splash()?.classList.contains('boot-splash-hide')).toBe(false);
    expect(screen.queryByTestId('fullscreen-loader')).toBeNull();
    await act(async () => {
      resolve({ default: () => <div data-testid="login">login</div> });
    });
    expect(screen.getByTestId('login')).toBeTruthy();
    expect(splash()?.classList.contains('boot-splash-hide')).toBe(true);
  });

  it('shows the full-screen loader (not a blank page) once the splash is gone', () => {
    splash()?.remove();
    const Never = lazy(() => new Promise<{ default: React.FC }>(() => {}));
    render(
      <Suspense fallback={<BootFallback />}>
        <Never />
      </Suspense>,
    );
    expect(screen.getByTestId('fullscreen-loader')).toBeTruthy();
  });
});
