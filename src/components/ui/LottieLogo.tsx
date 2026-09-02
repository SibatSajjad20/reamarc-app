import React from 'react';

interface LottieLogoProps {
  className?: string;
  size?: number;
}

export const LottieLogo: React.FC<LottieLogoProps> = ({ className = '', size = 32 }) => {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex items-center justify-center shrink-0 overflow-hidden select-none ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Animated Vibrant Gradients */}
          <linearGradient id="logoGradientMain" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#D946EF" />
          </linearGradient>

          <linearGradient id="logoGradientInner" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#818CF8" />
          </linearGradient>

          <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Outer Rotating Pulse Ring */}
        <g className="animate-spin-slow origin-center">
          <circle
            cx="50"
            cy="50"
            r="42"
            stroke="url(#logoGradientMain)"
            strokeWidth="3.5"
            strokeDasharray="18 10 30 10"
            strokeLinecap="round"
            className="opacity-90"
          />
          <circle
            cx="50"
            cy="8"
            r="3"
            fill="#38BDF8"
            filter="url(#logoGlow)"
          />
          <circle
            cx="92"
            cy="50"
            r="2.5"
            fill="#D946EF"
            filter="url(#logoGlow)"
          />
        </g>

        {/* Counter-Rotating Mid Layer Starburst */}
        <g className="animate-reverse-spin origin-center">
          <path
            d="M50 18 L55 40 L77 45 L58 58 L63 80 L50 67 L37 80 L42 58 L23 45 L45 40 Z"
            fill="url(#logoGradientMain)"
            opacity="0.2"
          />
        </g>

        {/* Central Core Glowing AI Sparkle */}
        <g className="animate-pulse-fast origin-center" filter="url(#logoGlow)">
          {/* Main 4-point AI Star */}
          <path
            d="M50 24 C50 38 38 50 24 50 C38 50 50 62 50 76 C50 62 62 50 76 50 C62 50 50 38 50 24 Z"
            fill="url(#logoGradientMain)"
          />

          {/* Inner Accent Sparkle */}
          <path
            d="M50 35 C50 43 43 50 35 50 C43 50 50 57 50 65 C50 57 57 50 65 50 C57 50 50 43 50 35 Z"
            fill="url(#logoGradientInner)"
          />

          {/* Core White Diamond Center */}
          <polygon
            points="50,44 54,50 50,56 46,50"
            fill="#FFFFFF"
          />
        </g>
      </svg>
    </div>
  );
};

