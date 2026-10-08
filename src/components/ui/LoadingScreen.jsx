import React, { useState, useEffect } from 'react';
import { BrandMark } from './BrandMark';
import { Skeleton } from './skeleton';

/**
 * LoadingScreen Component
 * Supports both full-screen boot/session verification overlay
 * and in-container section skeleton loading.
 *
 * @param {Object} props
 * @param {string} [props.message]
 * @param {string} [props.title]
 * @param {string} [props.subtext]
 * @param {number} [props.size]
 * @param {boolean} [props.fullScreen]
 * @param {string} [props.className]
 */
export function LoadingScreen({
  message = 'Checking your session…',
  title = 'Reamarc',
  subtext = '',
  _size = 0,
  fullScreen = false,
  className = '',
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 300ms visual delay so fast sessions never flash the screen
    const timer = setTimeout(() => {
      setMounted(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  if (fullScreen) {
    return (
      <div
        className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas text-fg select-none transition-opacity duration-160 ease-[var(--ease-standard)] ${
          mounted ? 'opacity-100' : 'opacity-0 pointer-events-none'
        } ${className}`}
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

        {/* Centered column */}
        <div className="flex flex-col items-center text-center">
          <BrandMark size={32} />
          <h2 className="mt-2 text-[15px] font-semibold text-fg tracking-tight">
            {title || 'Reamarc'}
          </h2>
          <p className="mt-3 text-[13px] text-fg-muted font-normal">
            {message}
          </p>
          {subtext && (
            <p className="mt-1 text-[12px] text-fg-faint font-mono">
              {subtext}
            </p>
          )}
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
