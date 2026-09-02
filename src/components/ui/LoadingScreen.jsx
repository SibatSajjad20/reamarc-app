import React from 'react';
import ReamarcLogo3D from './ReamarcLogo3D';

/**
 * LoadingScreen Component (Pure JavaScript)
 * Renders the interactive 3D Reamarc logo with real-time 60/120fps WebGL
 * Supports both full-screen overlay (e.g. auth/session verification)
 * and in-container section loading (e.g. tables, matrices, modules).
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
  message = 'Loading...',
  title = '',
  subtext = '',
  size = 0,
  fullScreen = false,
  className = '',
}) {
  const logoSize = size || (fullScreen ? 56 : 44);

  const LogoElement = (
    <div
      style={{ width: logoSize, height: logoSize }}
      className="relative flex items-center justify-center shrink-0"
    >
      <ReamarcLogo3D size={logoSize} floatSpeed={2.2} floatIntensity={0.6} />
    </div>
  );

  if (fullScreen) {
    return (
      <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-slate-900 select-none p-6 ${className}`}>
        <div className="relative flex flex-col items-center text-center space-y-4">
          <div className="flex items-center justify-center mb-1">
            {LogoElement}
          </div>

          <div className="space-y-1.5">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              {title || 'Reamarc AI'}
            </h2>
            <p className="text-xs font-medium text-slate-500">
              {message}
            </p>
            {subtext && (
              <p className="text-[11px] text-slate-400 font-mono">
                {subtext}
              </p>
            )}
          </div>

          {/* Minimalist animated loader bar */}
          <div className="w-32 h-1 bg-zinc-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full animate-pulse w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex-1 min-h-[240px] py-16 w-full flex flex-col items-center justify-center text-center select-none gap-3 bg-white ${className}`}
    >
      <div className="flex items-center justify-center">
        {LogoElement}
      </div>

      <div className="space-y-1 max-w-sm px-4">
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {message}
        </p>
        {subtext && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{subtext}</p>
        )}
      </div>
    </div>
  );
}

export default LoadingScreen;
