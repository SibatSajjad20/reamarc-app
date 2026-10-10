import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'kpi',
            'h1',
            'h2',
            'h3',
            'h4',
            'body',
            'ui',
            'table',
            'label',
            'small',
            'caption',
            'micro',
            'mono',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return customTwMerge(clsx(inputs));
}
