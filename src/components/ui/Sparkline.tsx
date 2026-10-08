import React from 'react';
import { cn } from '../../lib/utils';

export interface SparklineProps extends React.SVGAttributes<SVGSVGElement> {
  data: number[];
  width?: number;
  height?: number;
  strokeColor?: string;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 96,
  height = 28,
  strokeColor = 'var(--accent)',
  className,
  ...props
}) => {
  if (!data || data.length < 2) {
    return null;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const padding = 2;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const points = data
    .map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * usableWidth;
      const y =
        range === 0
          ? height / 2
          : height - padding - ((val - min) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible shrink-0', className)}
      {...props}
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
