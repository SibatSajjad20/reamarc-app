import React, { useEffect } from 'react';

const BITS: { dx: string; dy: string; rot: string; color: string }[] = [
  { dx: '-28px', dy: '-36px', rot: '40deg', color: '#34d399' },
  { dx: '-10px', dy: '-44px', rot: '-18deg', color: '#6ee7b7' },
  { dx: '12px', dy: '-42px', rot: '22deg', color: '#fbbf24' },
  { dx: '30px', dy: '-32px', rot: '-32deg', color: '#f472b6' },
  { dx: '-36px', dy: '-14px', rot: '16deg', color: '#60a5fa' },
  { dx: '36px', dy: '-12px', rot: '48deg', color: '#a78bfa' },
  { dx: '-18px', dy: '-22px', rot: '-8deg', color: '#fcd34d' },
  { dx: '20px', dy: '-20px', rot: '12deg', color: '#fb7185' },
];

export const TaskCompleteConfetti: React.FC<{ x: number; y: number; onDone: () => void }> = ({ x, y, onDone }) => {
  useEffect(() => {
    const id = window.setTimeout(onDone, 700);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="pointer-events-none fixed z-[90]" style={{ left: x, top: y }} aria-hidden="true">
      {BITS.map((bit) => (
        <span
          key={`${bit.dx}-${bit.dy}`}
          className="task-confetti-bit"
          style={{ '--dx': bit.dx, '--dy': bit.dy, '--rot': bit.rot, background: bit.color } as React.CSSProperties}
        />
      ))}
    </div>
  );
};
