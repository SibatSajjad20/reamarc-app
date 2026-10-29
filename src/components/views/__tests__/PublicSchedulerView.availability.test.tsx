import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PublicSchedulerView,
  resolveSchedulerCompany,
  withSchedulerCompany,
} from '../PublicSchedulerView';

/**
 * A fake of the live multi-tenant backend (crm_public.py + crm_scheduler.py):
 *  - every public scheduler call without ?company= / X-Company is rejected with 404,
 *  - Mon–Sat 11:00–23:00 Asia/Karachi, 30-min slots, Sunday closed,
 *  - 2026-10-29 is a holiday (fully booked), 11:30 on 2026-10-28 is already booked.
 */
const HOLIDAY = '2026-10-29';
const BOOKED = { date: '2026-10-28', time: '11:30' };
// "Today at 11:57 PKT" with 1h notice: 11:00/11:30 passed, 12:00/12:30 too soon.
const TODAYISH = '2026-10-27';
const TODAYISH_STATUS: Record<string, string> = { '11:00': 'passed', '11:30': 'passed', '12:00': 'too_soon', '12:30': 'too_soon' };
const calls: string[] = [];

function pktToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());
}

function slotState(date: string, time: string) {
  if (date === BOOKED.date && time === BOOKED.time) return { available: false, status: 'booked', reason: 'Booked' };
  const st = date === TODAYISH ? TODAYISH_STATUS[time] : undefined;
  if (st) return { available: false, status: st, reason: st === 'passed' ? 'Passed' : 'Too soon' };
  return { available: true, status: 'available' };
}

function slotsFor(date: string) {
  const d = new Date(`${date}T12:00:00+05:00`);
  const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  if (date < pktToday() || iso === 7 || date === HOLIDAY) return [];
  const out = [];
  for (let m = 11 * 60; m + 30 <= 23 * 60; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const h12 = ((Math.floor(m / 60) + 11) % 12) + 1;
    const time = `${hh}:${mm}`;
    out.push({
      time,
      label: `${h12}:${mm} ${m >= 720 ? 'PM' : 'AM'}`,
      iso_start: `${date}T${time}:00+05:00`,
      iso_end: `${date}T${time}:00+05:00`,
      ...slotState(date, time),
    });
  }
  return out;
}

let slotsFail = false;

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function fakeBackend(input: RequestInfo | URL) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  calls.push(raw);
  const url = new URL(raw, 'http://localhost');
  if (!url.pathname.includes('/crm/public/scheduler/')) return json({}, 404);
  if (!url.searchParams.get('company')) {
    return json({ detail: 'Company specification required in multi-tenant mode' }, 404);
  }
  if (url.pathname.endsWith('/config')) {
    return json({
      title: 'Book a meeting',
      host_name: 'Muhammad Faizan Khan',
      duration_minutes: 30,
      timezone: 'Asia/Karachi',
      working_days: [1, 2, 3, 4, 5, 6],
      services: ['SEO Strategy & Organic Search'],
    });
  }
  if (url.pathname.endsWith('/month-availability')) {
    return json({ month: url.searchParams.get('month'), fully_booked_dates: [HOLIDAY], working_days: [1, 2, 3, 4, 5, 6] });
  }
  if (url.pathname.endsWith('/slots')) {
    if (slotsFail) return Promise.reject(new TypeError('Failed to fetch'));
    const date = url.searchParams.get('date') || '';
    const slots = slotsFor(date);
    return json({ date, is_available: slots.some((s) => s.available), timezone: 'Asia/Karachi', duration_minutes: 30, slots });
  }
  return json({}, 404);
}

function setUrl(path: string) {
  window.history.replaceState({}, '', path);
}

function dayButton(container: HTMLElement, ymd: string): HTMLButtonElement {
  const btn = container.querySelector(`[data-day="${ymd}"] button`) as HTMLButtonElement | null;
  if (!btn) throw new Error(`no calendar cell for ${ymd}`);
  return btn;
}

async function pickDay(container: HTMLElement, ymd: string) {
  await waitFor(() => expect(dayButton(container, ymd)).toBeTruthy());
  await act(async () => {
    fireEvent.click(dayButton(container, ymd));
  });
}

beforeEach(() => {
  calls.length = 0;
  slotsFail = false;
  // Fri 23 Oct 2026, 10:00 PKT
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-23T05:00:00Z'));
  vi.stubGlobal('fetch', vi.fn(fakeBackend));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  setUrl('/book?topic=brand');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('company resolution', () => {
  it('uses ?company=, then the /book/<slug> path, then the reamarc default', () => {
    expect(resolveSchedulerCompany({ pathname: '/book', search: '?company=acme' })).toBe('acme');
    expect(resolveSchedulerCompany({ pathname: '/book', search: '?slug=acme-co' })).toBe('acme-co');
    expect(resolveSchedulerCompany({ pathname: '/book/acme', search: '' })).toBe('acme');
    expect(resolveSchedulerCompany({ pathname: '/schedule/acme', search: '' })).toBe('acme');
    expect(resolveSchedulerCompany({ pathname: '/book', search: '' })).toBe('reamarc');
    expect(resolveSchedulerCompany({ pathname: '/book', search: '?company=<x>' })).toBe('x');
    expect(withSchedulerCompany('/crm/public/scheduler/slots?date=2026-10-28', 'reamarc')).toBe(
      '/crm/public/scheduler/slots?date=2026-10-28&company=reamarc'
    );
  });
});

describe('PublicSchedulerView availability (multi-tenant backend)', () => {
  it('uses the Worklane subdomain slug when path and query are empty', () => {
    expect(
      resolveSchedulerCompany({
        pathname: '/book',
        search: '',
        hostname: 'dataviz.oneworklane.com',
      }),
    ).toBe('dataviz');
    expect(
      resolveSchedulerCompany({
        pathname: '/book',
        search: '',
        hostname: 'www.oneworklane.com',
      }),
    ).toBe('reamarc');
    expect(
      resolveSchedulerCompany({
        pathname: '/book',
        search: '',
        hostname: 'evil-oneworklane.com',
      }),
    ).toBe('reamarc');
  });

  it('shows working-hour slots for a future weekday and shows the booked one disabled', async () => {
    const { container } = render(<PublicSchedulerView />);
    await pickDay(container, '2026-10-28');
    expect(await screen.findByText('11:00 AM')).toBeTruthy();
    expect(screen.getByText('10:30 PM')).toBeTruthy();
    expect(screen.queryByText('11:00 PM')).toBeNull();
    const booked = screen.getByText('11:30 AM').closest('button') as HTMLButtonElement;
    expect(booked.disabled).toBe(true); // booked → shown, disabled
    expect(booked.textContent).toContain('Booked');
    expect(screen.queryByText('No available slots for this date')).toBeNull();
    expect(calls.filter((c) => c.includes('/scheduler/')).every((c) => c.includes('company=reamarc'))).toBe(true);
  });

  it('shows passed and too-soon slots disabled instead of hiding them', async () => {
    const { container } = render(<PublicSchedulerView />);
    await pickDay(container, TODAYISH);
    for (const [label, tag] of [['11:00 AM', 'Passed'], ['11:30 AM', 'Passed'], ['12:00 PM', 'Too soon'], ['12:30 PM', 'Too soon']]) {
      const btn = (await screen.findByText(label)).closest('button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toContain(tag);
      fireEvent.click(btn);
    }
    expect(screen.queryByText(/Step 2/i)).toBeNull();
    const open = screen.getByText('1:00 PM').closest('button') as HTMLButtonElement;
    expect(open.disabled).toBe(false);
    expect(container.querySelectorAll('[data-slot-status]').length).toBe(24);
  });

  it('shows slots for a Saturday', async () => {
    const { container } = render(<PublicSchedulerView />);
    await pickDay(container, '2026-10-24');
    expect(await screen.findByText('11:00 AM')).toBeTruthy();
  });

  it('sends the company from a /book/<slug> link', async () => {
    setUrl('/book/acme?topic=brand');
    const { container } = render(<PublicSchedulerView />);
    await pickDay(container, '2026-10-28');
    await screen.findByText('11:00 AM');
    expect(calls.some((c) => c.includes('/scheduler/slots') && c.includes('company=acme'))).toBe(true);
  });

  it('disables Sunday, past and holiday dates', async () => {
    const { container } = render(<PublicSchedulerView />);
    await waitFor(() => expect(dayButton(container, HOLIDAY).disabled).toBe(true));
    expect(dayButton(container, '2026-10-25').disabled).toBe(true); // Sunday
    expect(dayButton(container, '2026-10-22').disabled).toBe(true); // past
    expect(dayButton(container, '2026-10-28').disabled).toBe(false);
  });

  it('uses the PKT date after midnight PKT even though UTC is still the previous day', async () => {
    // 2026-10-24 19:30Z = Sun 25 Oct 00:30 PKT → Saturday 24th is now past
    vi.setSystemTime(new Date('2026-10-24T19:30:00Z'));
    const { container } = render(<PublicSchedulerView />);
    await waitFor(() => expect(dayButton(container, '2026-10-24').disabled).toBe(true));
    expect(dayButton(container, '2026-10-26').disabled).toBe(false);
    expect(await screen.findByText('11:00 AM')).toBeTruthy(); // auto-selected Mon 26th
  });

  it('shows a retryable error (not "no slots") when the slot lookup fails, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    slotsFail = true;
    const { container } = render(<PublicSchedulerView />);
    await pickDay(container, '2026-10-28');
    expect(await screen.findByText("Couldn't load available times")).toBeTruthy();
    expect(screen.queryByText('No available slots for this date')).toBeNull();
    expect(warn).toHaveBeenCalled();
    slotsFail = false;
    await act(async () => {
      fireEvent.click(screen.getByText('Try again'));
    });
    expect(await screen.findByText('11:00 AM')).toBeTruthy();
  });
});
