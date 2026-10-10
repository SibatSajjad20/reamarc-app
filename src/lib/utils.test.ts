import { cn } from './utils';

// Tiny assertion check for tailwind-merge font-size configuration
export function testFontTokensPreserved(): void {
  const result = cn('bg-accent text-accent-fg text-body');
  if (!result.includes('text-accent-fg') || !result.includes('text-body')) {
    throw new Error(`Expected text-accent-fg and text-body to both be preserved, got: "${result}"`);
  }
}
