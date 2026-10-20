import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { ClientAvatar } from '../ClientAvatar';

const LOGO = 'https://res.cloudinary.com/demo/image/upload/v1/reamarc/clients/ws1/logo/logo-abc.png';

describe('ClientAvatar', () => {
  it('renders a transformed Cloudinary thumb with lazy loading', () => {
    const { getByAltText } = render(<ClientAvatar name="Sample Client A" logoUrl={LOGO} size={20} />);
    const img = getByAltText('Sample Client A logo') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('w_40,h_40,c_pad,b_transparent,f_auto,q_auto');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('falls back to initials when the image errors', () => {
    const { getByAltText, getByText, container } = render(
      <ClientAvatar name="Sample Client A" logoUrl={LOGO} size={20} />
    );
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    fireEvent.error(getByAltText('Sample Client A logo'));
    expect(getByText('SA')).toBeTruthy();
  });

  it('uses a stable colour for the same id and a different colour for another id', () => {
    const a = render(<ClientAvatar name="Acme" clientId="ws-a" size={20} />);
    const bgA = (a.getByText('AC') as HTMLElement).style.backgroundColor;
    a.unmount();
    const a2 = render(<ClientAvatar name="Acme" clientId="ws-a" size={20} />);
    expect((a2.getByText('AC') as HTMLElement).style.backgroundColor).toBe(bgA);
    a2.unmount();
    const b = render(<ClientAvatar name="Acme" clientId="ws-b" size={20} />);
    expect((b.getByText('AC') as HTMLElement).style.backgroundColor).not.toBe(bgA);
  });

  it('sets title to the client name', () => {
    const { getByTitle } = render(<ClientAvatar name="Sample Client A" size={20} />);
    expect(getByTitle('Sample Client A')).toBeTruthy();
  });

  it('renders an img for a data:image URL', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const { getByAltText } = render(<ClientAvatar name="Local Preview" logoUrl={dataUrl} size={40} />);
    const img = getByAltText('Local Preview logo') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(dataUrl);
  });
});
