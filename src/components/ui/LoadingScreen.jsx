import React from 'react';
import { Skeleton } from './skeleton';

/**
 * LoadingScreen Component
 * Supports both full-screen boot/session verification overlay
 * and in-container section skeleton loading.
 *
 * Full-screen mode is brand-neutral (Worklane W mark + spinner, no company name)
 * so Worklane hosts never flash Reamarc on first load.
 *
 * Full-screen is immediately visible (no opacity delay). First boot keeps the
 * HTML #boot-splash only (App returns null while auth loads) so the W mark is
 * not swapped for a second React loader. Use fullScreen for company switches.
 *
 * @param {Object} props
 * @param {string} [props.message]
 * @param {string} [props.title] - ignored in fullScreen (kept for call-site compat)
 * @param {string} [props.subtext]
 * @param {number} [props.size]
 * @param {boolean} [props.fullScreen]
 * @param {string} [props.className]
 */
export function LoadingScreen({
  message = '',
  title: _title = '',
  subtext = '',
  _size = 0,
  fullScreen = false,
  className = '',
}) {
  if (fullScreen) {
    return (
      <div
        data-testid="fullscreen-loader"
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas text-fg select-none ${className}`}
        aria-busy="true"
        aria-label={message || 'Loading'}
      >
        {/* Top 2px indeterminate progress bar */}
        <div className="fixed top-0 left-0 right-0 h-[2px] bg-subtle overflow-hidden z-[60]">
          <div
            className="h-full bg-accent w-[30%]"
            style={{
              animation: 'indeterminateProgress 1.2s linear infinite',
            }}
          />
        </div>

        {/* Centered column — W mark + spinner, no company name */}
        <div className="flex flex-col items-center text-center gap-5">
          <img
            src="/worklane-mark.png"
            alt=""
            width={56}
            height={56}
            className="w-14 h-14 object-contain select-none"
            draggable={false}
          />
          <div
            className="w-[22px] h-[22px] rounded-full border-2 border-accent/25 border-t-accent animate-spin"
            role="presentation"
          />
          {message ? (
            <p className="mt-1 text-[13px] text-fg-muted font-normal">{message}</p>
          ) : null}
          {subtext ? (
            <p className="mt-1 text-[12px] text-fg-faint font-mono">{subtext}</p>
          ) : null}
        </div>
      </div>
    );
  }

  // Inline mode (renders neutral skeleton block)
  return (
    <div className={`w-full py-6 flex-1 flex flex-col justify-center ${className}`}>
      <div className="bg-surface border border-border rounded-lg p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <Skeleton className="w-48 h-4 rounded-sm" />
          <Skeleton className="w-20 h-4 rounded-sm" />
        </div>
        <div className="space-y-3 pt-1">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 py-1.5 border-b border-border last:border-b-0"
            >
              <Skeleton className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="w-1/3 h-3.5 rounded-sm" />
                <Skeleton className="w-1/4 h-3 rounded-sm" />
              </div>
              <Skeleton className="w-20 h-5 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
