import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingScreen } from '../LoadingScreen';

describe('LoadingScreen fullScreen (boot)', () => {
  it('is immediately visible — no opacity-0 delay that blinked under the HTML splash', () => {
    const { getByTestId } = render(<LoadingScreen fullScreen />);
    const el = getByTestId('fullscreen-loader');
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(el.className).not.toMatch(/opacity-0/);
    expect(el.className).not.toMatch(/pointer-events-none/);
  });

  it('shows the neutral W mark, not a company name', () => {
    const { getByTestId, queryByText } = render(
      <LoadingScreen fullScreen message="" />,
    );
    const img = getByTestId('fullscreen-loader').querySelector('img');
    expect(img?.getAttribute('src')).toBe('/worklane-mark.png');
    expect(queryByText(/Reamarc|DataViz/i)).toBeNull();
  });
});
