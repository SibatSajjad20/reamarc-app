import React from 'react';

interface BrandMarkProps {
  size?: 24 | 28 | 32 | 40;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28, className = '' }) => {
  const fontSize = Math.round(size * 0.5);

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${fontSize}px`,
      }}
      className={`rounded-mark bg-accent text-accent-fg font-semibold flex items-center justify-center shrink-0 select-none ${className}`}
      aria-hidden="true"
    >
      R
    </div>
  );
};
